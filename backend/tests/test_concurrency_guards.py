from conftest import override_user
from auth import get_current_user_email, get_current_user_id
from main import app
from models import ChitFund, Member, Payment, ChitStatus
from test_draw_guard import seed_active_kuri


def set_authenticated_user(user_id: str):
    app.dependency_overrides[get_current_user_id] = override_user(user_id)


def set_authenticated_email(email: str):
    app.dependency_overrides[get_current_user_email] = override_user(email)


def test_payment_mutations_preserve_authorization_and_state(client, test_db):
    chit_id = seed_active_kuri(test_db)
    member = test_db.query(Member).filter(Member.id == "member-2").one()
    payment = Payment(
        chit_fund_id=chit_id,
        member_id=member.id,
        month=1,
        amount=1000,
        is_paid=False,
    )
    test_db.add(payment)
    test_db.commit()
    payment_id = payment.id

    set_authenticated_user("member-2")
    paid = client.patch(
        f"/api/chits/{chit_id}/payments/{payment_id}/mark-paid"
    )
    assert paid.status_code == 200
    assert paid.json()["is_paid"] is True
    assert paid.json()["marked_by"] == "member"
    assert paid.json()["paid_at"] is not None

    set_authenticated_user("organizer-1")
    unpaid = client.patch(
        f"/api/chits/{chit_id}/payments/{payment_id}/mark-unpaid"
    )
    assert unpaid.status_code == 200
    assert unpaid.json()["is_paid"] is False
    assert unpaid.json()["paid_at"] is None
    assert unpaid.json()["marked_by"] is None

    set_authenticated_user("unrelated-user")
    forbidden = client.patch(
        f"/api/chits/{chit_id}/payments/{payment_id}/mark-paid"
    )
    assert forbidden.status_code == 403


def test_membership_claim_allows_only_one_account_to_claim_member(client, test_db):
    chit = ChitFund(
        name="Claim Guard Kuri",
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
    test_db.add(chit)
    test_db.flush()
    member = Member(
        id="pending-member",
        chit_fund_id=chit.id,
        name="Pending Member",
        email="pending@example.com",
        country="IN",
        user_id=None,
    )
    test_db.add(member)
    test_db.commit()

    set_authenticated_user("member-2")
    set_authenticated_email("pending@example.com")
    claimed = client.post(f"/api/memberships/{member.id}/claim")
    assert claimed.status_code == 200
    assert claimed.json()["member_id"] == member.id

    set_authenticated_user("member-3")
    set_authenticated_email("pending@example.com")
    second_claim = client.post(f"/api/memberships/{member.id}/claim")
    assert second_claim.status_code == 409
    assert "already claimed" in second_claim.json()["detail"]

    test_db.refresh(member)
    assert member.user_id == "member-2"
