"""
Backend test suite for AI Photo Judge — iteration 2 (security-fix verification).

Tests:
 - /api/scan (anonymous + authenticated, X-Device-Id acceptance, magic-byte validation)
 - /api/scans + /api/scans/stats (auth-gated regression)
 - /api/files/{path} (Bearer-only; ?token= removed; owner-scoped 404)
 - /api/auth/me + /api/auth/session (regression)
 - CORS: allow_origin_regex + no wildcard-with-credentials
"""
import io
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from PIL import Image
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
if not BASE_URL:
    # frontend env holds preview URL
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

TEST_USER_ID = f"user_TEST_{uuid.uuid4().hex[:8]}"
TEST_EMAIL = f"TEST_{uuid.uuid4().hex[:6]}@example.com"
TEST_TOKEN = f"TEST_token_{uuid.uuid4().hex}"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="session", autouse=True)
def seed_user(mongo):
    """Insert a test user + session doc; cleanup after tests."""
    now = datetime.now(timezone.utc)
    mongo.users.insert_one({
        "user_id": TEST_USER_ID,
        "email": TEST_EMAIL,
        "name": "Test User",
        "created_at": now.isoformat(),
    })
    mongo.user_sessions.insert_one({
        "session_token": TEST_TOKEN,
        "user_id": TEST_USER_ID,
        "created_at": now,
        "expires_at": now + timedelta(days=7),
    })
    yield
    mongo.users.delete_one({"user_id": TEST_USER_ID})
    mongo.user_sessions.delete_one({"session_token": TEST_TOKEN})
    mongo.scans.delete_many({"user_id": TEST_USER_ID})


@pytest.fixture(scope="session")
def real_jpeg_bytes():
    """Generate a real JPEG with textures/features (not blank)."""
    img = Image.new("RGB", (512, 512))
    px = img.load()
    for y in range(512):
        for x in range(512):
            # Gradient + diagonal stripes to give real features/edges
            r = (x + y) % 256
            g = (x * 2) % 256
            b = (y * 3 + (x // 8) * 17) % 256
            px[x, y] = (r, g, b)
    # Add a rectangle "object" and border
    for y in range(150, 350):
        for x in range(150, 350):
            px[x, y] = (200, 50, 100)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    yield s
    s.close()


# ---------- Auth endpoints ----------
class TestAuth:
    def test_auth_me_no_token(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_auth_me_invalid_token(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/auth/me",
                           headers={"Authorization": "Bearer bogus_token_xyz"})
        assert r.status_code == 401

    def test_auth_me_valid_token(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/auth/me",
                           headers={"Authorization": f"Bearer {TEST_TOKEN}"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user_id"] == TEST_USER_ID
        assert body["email"] == TEST_EMAIL

    def test_auth_session_invalid_session_id(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/session",
                            json={"session_id": "bogus_session_id_xyz"})
        assert r.status_code == 401


# ---------- Scan anonymous ----------
class TestScanAnonymous:
    def test_scan_anonymous_returns_verdict(self, api_client, real_jpeg_bytes):
        # Also verifies X-Device-Id header is accepted without error (rate-limit key)
        files = {"file": ("scan.jpg", real_jpeg_bytes, "image/jpeg")}
        headers = {"X-Device-Id": f"TEST_device_{uuid.uuid4().hex[:12]}"}
        r = api_client.post(f"{BASE_URL}/api/scan", files=files, headers=headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["verdict"] in ("ai", "real")
        assert isinstance(data["confidence"], int)
        assert 0 <= data["confidence"] <= 100
        assert isinstance(data["summary"], str) and data["summary"]
        assert isinstance(data["indicators"], list)
        assert data["saved"] is False
        assert data.get("image_path") is None

    def test_scan_empty_file_rejected(self, api_client):
        files = {"file": ("empty.jpg", b"", "image/jpeg")}
        r = api_client.post(f"{BASE_URL}/api/scan", files=files, timeout=30)
        assert r.status_code == 400

    def test_scan_non_image_bytes_rejected_by_magic(self, api_client):
        """SEC hardening: content-type says image but bytes are not a real image → 400."""
        fake = b"This is definitely not a real image, just plain text bytes." * 4
        files = {"file": ("evil.jpg", fake, "image/jpeg")}
        r = api_client.post(f"{BASE_URL}/api/scan", files=files, timeout=30)
        assert r.status_code == 400, r.text
        assert "Unsupported file type" in r.text or "Unsupported" in r.text

    def test_scan_gif_rejected_by_magic(self, api_client):
        """GIF is not in the whitelist (JPEG/PNG/WEBP) — must 400 pre-LLM."""
        gif = b"GIF89a" + b"\x00" * 32
        files = {"file": ("thing.gif", gif, "image/gif")}
        r = api_client.post(f"{BASE_URL}/api/scan", files=files, timeout=30)
        assert r.status_code == 400

    def test_scan_rate_limit_shape_and_wiring(self, api_client, real_jpeg_bytes, mongo):
        """
        SEC-001: verify rate-limit wiring without exhausting the real 50/day budget
        (each real scan costs LLM $). We pre-seed the counter for a synthetic device
        so the very next request is over-limit and returns 429 with the expected shape.
        """
        device = f"TEST_ratelimit_{uuid.uuid4().hex[:10]}"
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        doc_id = f"{today}:dev:{device}"
        try:
            mongo.rate_limits.update_one(
                {"_id": doc_id},
                {"$set": {"count": 9999, "created_at": datetime.now(timezone.utc)}},
                upsert=True,
            )
            files = {"file": ("scan.jpg", real_jpeg_bytes, "image/jpeg")}
            headers = {"X-Device-Id": device}
            r = api_client.post(f"{BASE_URL}/api/scan", files=files, headers=headers, timeout=30)
            assert r.status_code == 429, r.text
            body = r.json()
            assert "detail" in body
            assert "limit" in body["detail"].lower() or "429" in str(body)
        finally:
            mongo.rate_limits.delete_one({"_id": doc_id})


# ---------- Scan authenticated ----------
class TestScanAuthenticated:
    saved_image_path = None

    def test_scan_authenticated_saves_result(self, api_client, real_jpeg_bytes, mongo):
        files = {"file": ("scan.jpg", real_jpeg_bytes, "image/jpeg")}
        r = api_client.post(f"{BASE_URL}/api/scan",
                            files=files,
                            headers={"Authorization": f"Bearer {TEST_TOKEN}"},
                            timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["saved"] is True
        assert data.get("image_path"), f"Expected image_path, got: {data}"
        assert data["image_path"].startswith("ai-photo-judge/uploads/")
        # verify DB persistence
        doc = mongo.scans.find_one({"id": data["id"]})
        assert doc is not None
        assert doc["user_id"] == TEST_USER_ID
        TestScanAuthenticated.saved_image_path = data["image_path"]

    def test_list_scans_requires_auth(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/scans")
        assert r.status_code == 401

    def test_list_scans_sorted_desc(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/scans",
                           headers={"Authorization": f"Bearer {TEST_TOKEN}"})
        assert r.status_code == 200
        scans = r.json()
        assert isinstance(scans, list)
        assert len(scans) >= 1
        # sorted desc by created_at
        times = [s["created_at"] for s in scans]
        assert times == sorted(times, reverse=True)

    def test_scans_stats(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/scans/stats",
                           headers={"Authorization": f"Bearer {TEST_TOKEN}"})
        assert r.status_code == 200
        body = r.json()
        assert set(body.keys()) == {"total", "ai", "real"}
        assert body["total"] >= 1


# ---------- Files endpoint (SEC-002: Bearer only, no ?token=) ----------
class TestFilesEndpoint:
    def test_files_no_auth_returns_401(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/files/some/bogus/path.jpg")
        assert r.status_code == 401

    def test_files_old_token_query_param_removed(self, api_client):
        """SEC-002: the ?token= query parameter was removed — old callers must 401."""
        path = TestScanAuthenticated.saved_image_path
        if not path:
            path = f"ai-photo-judge/uploads/{TEST_USER_ID}/nonexistent.jpg"
        r = api_client.get(f"{BASE_URL}/api/files/{path}", params={"token": TEST_TOKEN}, timeout=30)
        assert r.status_code == 401, f"Expected 401 (Bearer only), got {r.status_code}: {r.text}"

    def test_files_with_bearer_owner_returns_200(self, api_client, real_jpeg_bytes, mongo):
        """Happy path: valid Bearer for the owner returns the image bytes.
        Self-contained: scans a fresh image so it doesn't depend on class ordering under xdist."""
        files = {"file": ("scan.jpg", real_jpeg_bytes, "image/jpeg")}
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
        scan_r = api_client.post(f"{BASE_URL}/api/scan", files=files, headers=headers, timeout=60)
        assert scan_r.status_code == 200, scan_r.text
        path = scan_r.json().get("image_path")
        if not path:
            pytest.skip("image_path not set (object storage unavailable)")
        r = api_client.get(f"{BASE_URL}/api/files/{path}",
                           headers={"Authorization": f"Bearer {TEST_TOKEN}"}, timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/")
        assert len(r.content) > 100

    def test_files_bearer_but_not_owner_returns_404(self, api_client, mongo):
        """Owner-scoped: valid token + path exists but belongs to different user → 404."""
        # Insert a scan doc owned by a *different* user so query in server.py fails.
        other_user = f"user_TEST_other_{uuid.uuid4().hex[:6]}"
        other_path = f"ai-photo-judge/uploads/{other_user}/{uuid.uuid4().hex}.jpg"
        mongo.scans.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": other_user,
            "image_path": other_path,
            "verdict": "real",
            "confidence": 90,
            "summary": "seed",
            "indicators": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            r = api_client.get(f"{BASE_URL}/api/files/{other_path}",
                               headers={"Authorization": f"Bearer {TEST_TOKEN}"}, timeout=30)
            assert r.status_code == 404, r.text
        finally:
            mongo.scans.delete_many({"user_id": other_user})

    def test_files_bearer_unknown_path_returns_404(self, api_client):
        path = f"ai-photo-judge/uploads/{TEST_USER_ID}/{uuid.uuid4().hex}.jpg"
        r = api_client.get(f"{BASE_URL}/api/files/{path}",
                           headers={"Authorization": f"Bearer {TEST_TOKEN}"}, timeout=30)
        assert r.status_code == 404


# ---------- CORS hardening ----------
class TestCORS:
    def test_cors_allows_emergentagent_origin(self, api_client):
        origin = "https://ai-photo-judge-1.preview.emergentagent.com"
        r = api_client.options(
            f"{BASE_URL}/api/auth/me",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
            timeout=15,
        )
        assert r.status_code in (200, 204), r.text
        allow_origin = r.headers.get("access-control-allow-origin")
        # Backend echoes the exact origin; ingress (Cloudflare) may replace it with '*'.
        # Either is acceptable AS LONG AS credentials are disabled (no wildcard-with-creds).
        assert allow_origin in (origin, "*"), f"Unexpected allow-origin: {allow_origin!r}"
        creds = r.headers.get("access-control-allow-credentials")
        assert creds in (None, "false"), f"Credentials must be disabled, got {creds!r}"

    def test_cors_allows_localhost(self, api_client):
        origin = "http://localhost:3000"
        r = api_client.options(
            f"{BASE_URL}/api/auth/me",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
            timeout=15,
        )
        assert r.status_code in (200, 204)
        allow_origin = r.headers.get("access-control-allow-origin")
        assert allow_origin in (origin, "*"), f"Unexpected allow-origin: {allow_origin!r}"
        creds = r.headers.get("access-control-allow-credentials")
        assert creds in (None, "false")

    def test_cors_rejects_disallowed_origin(self, api_client):
        """Random third-party origin must NOT get an allow-origin header echoed."""
        origin = "https://evil.example.com"
        r = api_client.options(
            f"{BASE_URL}/api/auth/me",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
            timeout=15,
        )
        allow_origin = r.headers.get("access-control-allow-origin")
        # Must not echo the origin and must not be wildcard-with-credentials
        assert allow_origin != origin, f"Disallowed origin should NOT be echoed: {allow_origin!r}"
        if allow_origin == "*":
            # Wildcard with credentials disabled is technically OK, but with credentials=True it would
            # be a security violation. Verify credentials are NOT enabled.
            assert r.headers.get("access-control-allow-credentials") not in ("true",)

    def test_cors_no_wildcard_with_credentials(self, api_client):
        """Regression: never allow-origin='*' together with allow-credentials='true'."""
        origin = "https://ai-photo-judge-1.preview.emergentagent.com"
        r = api_client.get(f"{BASE_URL}/api/", headers={"Origin": origin}, timeout=15)
        ao = r.headers.get("access-control-allow-origin")
        ac = r.headers.get("access-control-allow-credentials")
        # If credentials are enabled, allow-origin MUST NOT be '*'
        if ac == "true":
            assert ao != "*", "CVE: wildcard origin with credentials"

    def test_cors_direct_backend_regex_echoes_origin(self, api_client):
        """
        Bypass the Cloudflare/K8s ingress (which rewrites CORS to '*') and hit uvicorn directly
        to verify the actual Starlette CORS config: allow_origin_regex correctly echoes allowed
        origins and rejects disallowed ones, with credentials disabled.
        """
        direct = "http://localhost:8001"
        allowed = "https://foo.emergentagent.com"
        r = api_client.options(
            f"{direct}/api/auth/me",
            headers={
                "Origin": allowed,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
            timeout=10,
        )
        assert r.headers.get("access-control-allow-origin") == allowed
        assert r.headers.get("access-control-allow-credentials") in (None, "false")

        # Disallowed origin — backend should NOT include allow-origin header
        r2 = api_client.options(
            f"{direct}/api/auth/me",
            headers={
                "Origin": "https://evil.example.com",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
            timeout=10,
        )
        assert r2.headers.get("access-control-allow-origin") in (None, "")
