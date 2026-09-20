import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


# Configure deterministic test settings before application modules are imported.
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_ci.db")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

from database import Base, get_db
from main import app
from auth import get_current_user_id


TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=TEST_ENGINE, autoflush=False, autocommit=False)


def override_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def override_user(user_id):
    def dependency():
        return user_id
    return dependency


@pytest.fixture
def test_db():
    Base.metadata.drop_all(bind=TEST_ENGINE)
    Base.metadata.create_all(bind=TEST_ENGINE)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=TEST_ENGINE)


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user_id] = override_user("organizer-1")
    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        app.dependency_overrides.clear()
