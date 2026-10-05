import pytest
from pydantic import ValidationError

from schemas import ChitFundCreate, MemberCreate


def test_member_request_rejects_database_overflow_fields():
    with pytest.raises(ValidationError):
        MemberCreate(
            name="A" * 101,
            email="member@example.com",
            phone="1" * 21,
            country="IN",
        )


def test_chit_request_rejects_database_overflow_fields():
    with pytest.raises(ValidationError):
        ChitFundCreate(
            name="A" * 101,
            description="D" * 501,
            monthly_amount=1000,
            currency="INR",
            total_members=2,
            organizer_name="Organizer",
            organizer_email="organizer@example.com",
            organizer_country="IN",
            organizer_upi="U" * 101,
        )


def test_existing_business_limits_remain_unchanged():
    payload = ChitFundCreate(
        name="Valid Kuri",
        monthly_amount=1000,
        currency="INR",
        total_members=20,
        organizer_name="Organizer",
        organizer_email="organizer@example.com",
        organizer_country="IN",
    )
    assert payload.total_members == 20
    assert payload.duration_months == 20
