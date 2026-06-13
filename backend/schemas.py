from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from enum import Enum


class ChitStatusEnum(str, Enum):
    draft = "draft"
    active = "active"
    completed = "completed"


class PaymentResponse(BaseModel):
    id: str
    member_id: str
    month: int
    amount: int
    is_paid: bool
    paid_at: Optional[datetime]
    marked_by: Optional[str]

    class Config:
        from_attributes = True


class MemberCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    country: str


class MemberResponse(BaseModel):
    id: str
    name: str
    email: str
    phone: Optional[str]
    country: str
    has_won: bool
    won_in_month: Optional[int]

    class Config:
        from_attributes = True


class DrawResultResponse(BaseModel):
    id: str
    month: int
    winner_id: str
    winner_name: str
    drawn_at: datetime

    class Config:
        from_attributes = True


class ChitFundCreate(BaseModel):
    name: str
    description: Optional[str] = None
    monthly_amount: int
    currency: str = "INR"
    total_members: int
    duration_months: int
    organizer_name: str
    organizer_email: EmailStr
    organizer_country: str
    organizer_wins_first: bool = True
    organizer_upi: Optional[str] = None


class ChitFundResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    monthly_amount: int
    currency: str
    total_members: int
    duration_months: int
    current_month: int
    organizer_id: str
    organizer_wins_first: bool
    organizer_upi: Optional[str]
    status: ChitStatusEnum
    created_at: datetime
    members: List[MemberResponse]
    draws: List[DrawResultResponse]
    payments: List[PaymentResponse]

    class Config:
        from_attributes = True


class ChitFundListResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    monthly_amount: int
    currency: str
    total_members: int
    duration_months: int
    current_month: int
    organizer_id: str
    organizer_wins_first: bool
    organizer_upi: Optional[str]
    status: ChitStatusEnum
    created_at: datetime
    members: List[MemberResponse]
    draws: List[DrawResultResponse]
    payments: List[PaymentResponse]

    class Config:
        from_attributes = True
