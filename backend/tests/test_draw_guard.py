from database import Base
from models import ChitFund, Member, ChitStatus, DrawResult
from datetime import datetime, timedelta, timezone


def seed_active_kuri(db):
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
    return chit.id


def test_stale_draw_request_cannot_advance_to_next_month(client, test_db):
    chit_id = seed_active_kuri(test_db)

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

    chit = test_db.query(ChitFund).filter(ChitFund.id == chit_id).one()
    draws = test_db.query(DrawResult).filter(DrawResult.chit_fund_id == chit_id).all()
    assert chit.current_month == 2
    assert len(draws) == 1


def test_draw_requires_strict_30_day_interval(client, test_db):
    chit_id = seed_active_kuri(test_db)

    first = client.post(
        f"/api/chits/{chit_id}/draw",
        json={"expected_month": 1},
    )
    assert first.status_code == 200

    # Backdate the completed draw by only 29 days; the next draw must remain blocked.
    draw = test_db.query(DrawResult).filter(DrawResult.chit_fund_id == chit_id).one()
    draw.drawn_at = datetime.now(timezone.utc) - timedelta(days=29)
    test_db.commit()

    blocked = client.post(
        f"/api/chits/{chit_id}/draw",
        json={"expected_month": 2},
    )
    assert blocked.status_code == 409
    assert "not yet eligible" in blocked.json()["detail"]

    # Exactly 30 days elapsed: the draw becomes eligible.
    draw.drawn_at = datetime.now(timezone.utc) - timedelta(days=30)
    test_db.commit()

    allowed = client.post(
        f"/api/chits/{chit_id}/draw",
        json={"expected_month": 2},
    )
    assert allowed.status_code == 200
    assert allowed.json()["month"] == 2
