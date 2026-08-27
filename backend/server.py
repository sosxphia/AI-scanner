import base64
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import httpx
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Request, HTTPException, UploadFile, File
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
from pydantic import BaseModel
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

# ---------- Object storage (Emergent managed) ----------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "ai-photo-judge"
storage_key = None

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------- Auth helpers ----------
async def user_from_token(token: str) -> Optional[dict]:
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return None
    expires = session.get("expires_at")
    if isinstance(expires, datetime) and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if not expires or expires < datetime.now(timezone.utc):
        return None
    return await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})


async def get_user_optional(request: Request) -> Optional[dict]:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    return await user_from_token(auth.split(" ", 1)[1])


async def require_user(request: Request) -> dict:
    user = await get_user_optional(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


# ---------- Abuse controls ----------
SCAN_DAILY_LIMIT = 50  # per device/IP per day — generous for real users, blocks scripted abuse


def client_identity(request: Request) -> str:
    dev = (request.headers.get("X-Device-Id") or "").strip()
    if dev:
        return f"dev:{dev[:64]}"
    xff = request.headers.get("x-forwarded-for", "")
    ip = xff.split(",")[0].strip() if xff else (request.client.host if request.client else "unknown")
    return f"ip:{ip}"


async def enforce_scan_quota(request: Request) -> None:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    doc_id = f"{today}:{client_identity(request)}"
    doc = await db.rate_limits.find_one_and_update(
        {"_id": doc_id},
        {"$inc": {"count": 1}, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    if doc.get("count", 0) > SCAN_DAILY_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="Daily scan limit reached on this device. Please try again tomorrow.",
        )


def sniff_image_mime(raw: bytes) -> Optional[str]:
    if raw[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    return None


class SessionIdBody(BaseModel):
    session_id: str


@api_router.post("/auth/session")
async def create_session(body: SessionIdBody):
    async with httpx.AsyncClient(timeout=30) as hc:
        r = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired session_id")
    data = r.json()
    email = data.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="No email in session data")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user = existing
    else:
        user = {
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": email,
            "name": data.get("name"),
            "picture": data.get("picture"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(dict(user))

    session_token = data["session_token"]
    now = datetime.now(timezone.utc)
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user["user_id"],
        "created_at": now,
        "expires_at": now + timedelta(days=7),
    })
    return {"session_token": session_token, "user": user}


@api_router.get("/auth/me")
async def auth_me(request: Request):
    return await require_user(request)


@api_router.post("/auth/logout")
async def auth_logout(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        await db.user_sessions.delete_one({"session_token": auth.split(" ", 1)[1]})
    return {"ok": True}


# ---------- Scan (Claude Sonnet 4.6 vision) ----------
SCAN_SYSTEM = (
    "You are a forensic image analyst specialized in detecting AI-generated imagery. "
    "You examine lighting physics, anatomy, texture coherence, lens artifacts, noise patterns, "
    "text rendering, and compositional statistics. You always respond with strict JSON only."
)

SCAN_PROMPT = (
    "Analyze this image and determine whether it is a REAL photograph or AI-GENERATED. "
    "Respond ONLY with valid JSON, no markdown fences, exactly this shape: "
    '{"verdict": "AI_GENERATED" or "REAL", "confidence": <integer 50-100, your confidence in the verdict>, '
    '"summary": "<one concise sentence explaining the verdict>", '
    '"indicators": ["<3-5 short technical observations that support the verdict>"]}'
)


def parse_scan_response(text: str) -> dict:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("no JSON in model response")
    data = json.loads(match.group(0))
    verdict = "ai" if "AI" in str(data.get("verdict", "")).upper() else "real"
    confidence = max(0, min(100, int(data.get("confidence", 50))))
    indicators = [str(i) for i in (data.get("indicators") or [])][:6]
    return {
        "verdict": verdict,
        "confidence": confidence,
        "summary": str(data.get("summary", "")),
        "indicators": indicators,
    }


@api_router.post("/scan")
async def scan_image(request: Request, file: UploadFile = File(...)):
    await enforce_scan_quota(request)
    user = await get_user_optional(request)
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 15MB)")
    mime = sniff_image_mime(raw)
    if not mime:
        raise HTTPException(status_code=400, detail="Unsupported file type (JPEG, PNG, or WEBP only)")

    b64 = base64.b64encode(raw).decode()
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"scan-{uuid.uuid4().hex[:12]}",
        system_message=SCAN_SYSTEM,
    ).with_model("anthropic", "claude-sonnet-4-6")

    try:
        response = await chat.send_message(
            UserMessage(text=SCAN_PROMPT, file_contents=[ImageContent(image_base64=b64)])
        )
        text = response if isinstance(response, str) else str(response)
        analysis = parse_scan_response(text)
    except Exception as e:
        logger.error(f"Scan analysis failed: {e}")
        raise HTTPException(status_code=502, detail="Analysis failed, please try again")

    result = {
        "id": str(uuid.uuid4()),
        "verdict": analysis["verdict"],
        "confidence": analysis["confidence"],
        "summary": analysis["summary"],
        "indicators": analysis["indicators"],
        "image_path": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "saved": False,
    }

    if user:
        ext = "png" if "png" in mime else ("webp" if "webp" in mime else "jpg")
        path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
        try:
            await run_in_threadpool(put_object, path, raw, mime)
            result["image_path"] = path
        except Exception as e:
            logger.warning(f"Object storage upload failed: {e}")
        doc = {k: v for k, v in result.items() if k != "saved"}
        doc["user_id"] = user["user_id"]
        await db.scans.insert_one(dict(doc))
        result["saved"] = True

    return result


@api_router.get("/scans")
async def list_scans(request: Request):
    user = await require_user(request)
    scans = await db.scans.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return scans


@api_router.get("/scans/stats")
async def scan_stats(request: Request):
    user = await require_user(request)
    total = await db.scans.count_documents({"user_id": user["user_id"]})
    ai = await db.scans.count_documents({"user_id": user["user_id"], "verdict": "ai"})
    return {"total": total, "ai": ai, "real": total - ai}


@api_router.get("/files/{path:path}")
async def serve_file(path: str, request: Request):
    user = await require_user(request)
    scan = await db.scans.find_one({"image_path": path, "user_id": user["user_id"]}, {"_id": 0})
    if not scan:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        content, ctype = await run_in_threadpool(get_object, path)
    except Exception as e:
        logger.error(f"Object storage read failed: {e}")
        raise HTTPException(status_code=502, detail="Could not read file")
    return Response(content=content, media_type=ctype, headers={"Cache-Control": "private, max-age=86400"})


@api_router.get("/")
async def root():
    return {"message": "AI Photo Judge API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost(:\d+)?|([a-z0-9-]+\.)*emergentagent\.com)",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("user_id")
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.scans.create_index([("user_id", 1), ("created_at", -1)])
        await db.rate_limits.create_index("created_at", expireAfterSeconds=172800)
    except Exception as e:
        logger.warning(f"Index creation failed: {e}")
    try:
        await run_in_threadpool(init_storage)
        logger.info("Object storage initialized")
    except Exception as e:
        logger.warning(f"Object storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
