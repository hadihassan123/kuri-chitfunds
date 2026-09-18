import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_kuri_integration.db")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from models import Member, ChitFund, DrawResult
from main import app
from auth import get_current_user_id

TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=TEST_ENGINE, autoflush=False, autocommit=False)
Base.metadata.create_all(bind=TEST_ENGINE)


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


app.dependency_overrides[get_db] = override_db
client = TestClient(app)


def reset_db():
    Base.metadata.drop_all(bind=TEST_ENGINE)
    Base.metadata.create_all(bind=TEST_ENGINE)


def test_protected_endpoint_requires_authentication():
    app.dependency_overrides.pop(get_current_user_id, None)
    response = client.get("/api/chits")
    assert response.status_code == 401
    app.dependency_overrides[get_current_user_id] = override_user("organizer-1")


def test_create_activate_draw_and_payments_flow():
    reset_db()
    app.dependency_overrides[get_current_user_id] = override_user("organizer-1")

    response = client.post("/api/chits", json={
        "name": "Integration Kuri",
        "description": "test",
        "monthly_amount": 1000,
        "currency": "INR",
        "total_members": 3,
        "organizer_name": "Organizer",
        "organizer_email": "organizer@example.com",
        "organizer_country": "IN",
        "organizer_wins_first": True,
    })
    assert response.status_code == 200
    chit = response.json()
    chit_id = chit["id"]
    assert chit["duration_months"] == 3
    assert chit["current_month"] == 0

    for index in range(2):
        response = client.post(
            f"/api/chits/{chit_id}/members",
            json={
                "name": f"Member {index + 1}",
                "email": f"member{index + 1}@example.com",
                "country": "IN",
            },
        )
        assert response.status_code == 200

    response = client.get(f"/api/chits/{chit_id}")
    assert response.status_code == 200
    assert response.json()["status"] == "active"
    assert response.json()["current_month"] == 1

    response = client.post(
        f"/api/chits/{chit_id}/draw",
        json={"expected_month": 1},
    )
    assert response.status_code == 200
    draw = response.json()
    assert draw["month"] == 1
    assert draw["winner_name"] == "Organizer"

    response = client.get(f"/api/chits/{chit_id}/payments")
    assert response.status_code == 200
    payments = response.json()
    assert len(payments) == 3
    assert {payment["month"] for payment in payments} == {1}
    assert all(payment["is_paid"] is False for payment in payments)


def test_stale_draw_request_cannot_advance_to_next_month():
    reset_db()
    app.dependency_overrides[get_current_user_id] = override_user("organizer-1")

    response = client.post("/api/chits", json={
        "name": "Stale Draw Kuri",
        "monthly_amount": 500,
        "currency": "INR",
        "total_members": 2,
        "organizer_name": "Organizer",
        "organizer_email": "organizer2@example.com",
        "organizer_country": "IN",
        "organizer_wins_first": True,
    })
    chit_id = response.json()["id"]

    response = client.post(
        f"/api/chits/{chit_id}/members",
        json={
            "name": "Member",
            "email": "member@example.com",
            "country": "IN",
        },
    )
    assert response.status_code == 200

    first = client.post(
        f"/api/chits/{chit_id}/draw",
        json={"expected_month": 1},
    )
    assert first.status_code == 200

    stale = client.post(
        f"/api/chits/{chit_id}/draw",
        json={"expected_month": 1},
    )
    assert stale.status_code == 409
    assert "stale" in stale.json()["detail"]

    db = TestingSessionLocal()
    chit = db.query(ChitFund).filter(ChitFund.id == chit_id).one()
    draws = db.query(DrawResult).filter(DrawResult.chit_fund_id == chit_id).all()
    assert chit.current_month == 2
    assert len(draws) == 1
    db.close()


def test_public_invite_preview_does_not_require_auth_or_expose_member_data():
    reset_db()
    app.dependency_overrides[get_current_user_id] = override_user("organizer-1")

    response = client.post("/api/chits", json={
        "name": "Invite Preview Kuri",
        "monthly_amount": 750,
        "currency": "INR",
        "total_members": 2,
        "organizer_name": "Organizer",
        "organizer_email": "organizer3@example.com",
        "organizer_country": "IN",
        "organizer_wins_first": True,
    })
    assert response.status_code == 200
    chit_id = response.json()["id"]

    app.dependency_overrides.pop(get_current_user_id, None)
    preview = client.get(f"/api/invites/{chit_id}")
    assert preview.status_code == 200
    data = preview.json()
    assert data["name"] == "Invite Preview Kuri"
    assert data["member_count"] == 1
    assert "organizer_name" in data
    assert "organizer_email" not in data
    assert "members" not in data
    assert "payments" not in data
    assert "draws" not in data
    app.dependency_overrides[get_current_user_id] = override_user("organizer-1")
