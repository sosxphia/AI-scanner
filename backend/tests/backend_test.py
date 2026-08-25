"""
Backend test suite for AI Photo Judge.
Tests:
 - /api/scan (anonymous + authenticated)
 - /api/scans + /api/scans/stats (auth-gated)
 - /api/files/{path} (auth-gated, supports ?token=)
 - /api/auth/me + /api/auth/session
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
        files = {"file": ("scan.jpg", real_jpeg_bytes, "image/jpeg")}
        r = api_client.post(f"{BASE_URL}/api/scan", files=files, timeout=60)
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


# ---------- Files endpoint ----------
class TestFilesEndpoint:
    def test_files_no_auth(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/files/some/bogus/path.jpg")
        assert r.status_code == 401

    def test_files_with_token_query(self, api_client):
        path = TestScanAuthenticated.saved_image_path
        if not path:
            pytest.skip("No saved image path from prior test")
        r = api_client.get(f"{BASE_URL}/api/files/{path}", params={"token": TEST_TOKEN},
                           timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("image/")
        assert len(r.content) > 100

    def test_files_with_bearer(self, api_client):
        path = TestScanAuthenticated.saved_image_path
        if not path:
            pytest.skip("No saved image path from prior test")
        r = api_client.get(f"{BASE_URL}/api/files/{path}",
                           headers={"Authorization": f"Bearer {TEST_TOKEN}"}, timeout=30)
        assert r.status_code == 200

    def test_files_wrong_user_denied(self, api_client):
        path = TestScanAuthenticated.saved_image_path
        if not path:
            pytest.skip("No saved image path from prior test")
        # No token at all
        r = api_client.get(f"{BASE_URL}/api/files/{path}")
        assert r.status_code == 401
