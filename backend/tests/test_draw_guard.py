import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_draw_guard.db")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from models import ChitFund, Member, ChitStatus, DrawResult
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
app.dependency_overrides[get_current_user_id] = override_user("organizer-1")
client = TestClient(app)


def reset_db():
    Base.metadata.drop_all(bind=TEST_ENGINE)
    Base.metadata.create_all(bind=TEST_ENGINE)


def seed_active_kuri():
    db = TestingSessionLocal()
    chit = ChitFund(
        name="Draw Guard Kuri",
        monthly_amount=1000,
        currency="INR",
        total_members=2,
        duration_months=2,
        current_month=1,
        organizer_id="organizer-member",
        organizer_wins_first=True,
        status=ChitStatus.ACTIVE,
        user_id="organizer-1",
    )
    db.add(chit)
    db.flush()
    db.add_all([
        Member(
            id="organizer-member",
            chit_fund_id=chit.id,
            name="Organizer",
            email="organizer@example.com",
            country="IN",
            user_id="organizer-1",
        ),
        Member(
            id="member-2",
            chit_fund_id=chit.id,
            name="Member 2",
            email="member2@example.com",
            country="IN",
        ),
    ])
    db.commit()
    db.refresh(chit)
    chit_id = chit.id
    db.close()
    return chit_id


def test_stale_draw_request_cannot_advance_to_next_month():
    reset_db()
    chit_id = seed_active_kuri()

    first = client.post(
        f"/api/chits/{chit_id}/draw",
        json={"expected_month": 1},
    )
    assert first.status_code == 200
    assert first.json()["month"] == 1

    second = client.post(
        f"/api/chits/{chit_id}/draw",
        json={"expected_month": 1},
    )
    assert second.status_code == 409
    assert "stale" in second.json()["detail"]

    db = TestingSessionLocal()
    chit = db.query(ChitFund).filter(ChitFund.id == chit_id).one()
    draws = db.query(DrawResult).filter(DrawResult.chit_fund_id == chit_id).all()
    assert chit.current_month == 2
    assert len(draws) == 1
    db.close()
