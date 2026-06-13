from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum
import uuid


def generate_uuid():
    return str(uuid.uuid4())[:15]


class ChitStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"


class ChitFund(Base):
    __tablename__ = "chit_funds"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    monthly_amount = Column(Integer, nullable=False)
    currency = Column(String(10), nullable=False, default="INR")
    total_members = Column(Integer, nullable=False)
    duration_months = Column(Integer, nullable=False)
    current_month = Column(Integer, default=0)
    organizer_id = Column(String, nullable=False)
    organizer_wins_first = Column(Boolean, default=True)
    organizer_upi = Column(String(100), nullable=True)
    status = Column(Enum(ChitStatus), default=ChitStatus.DRAFT)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    user_id = Column(String, nullable=True)

    members = relationship("Member", back_populates="chit_fund", cascade="all, delete-orphan")
    draws = relationship("DrawResult", back_populates="chit_fund", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="chit_fund", cascade="all, delete-orphan")


class Member(Base):
    __tablename__ = "members"

    id = Column(String, primary_key=True, default=generate_uuid)
    chit_fund_id = Column(String, ForeignKey("chit_funds.id"), nullable=False)
    name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=True)
    country = Column(String(100), nullable=False)
    has_won = Column(Boolean, default=False)
    won_in_month = Column(Integer, nullable=True)
    user_id = Column(String, nullable=True)

    chit_fund = relationship("ChitFund", back_populates="members")
    payments = relationship("Payment", back_populates="member", cascade="all, delete-orphan")


class DrawResult(Base):
    __tablename__ = "draw_results"

    id = Column(String, primary_key=True, default=generate_uuid)
    chit_fund_id = Column(String, ForeignKey("chit_funds.id"), nullable=False)
    month = Column(Integer, nullable=False)
    winner_id = Column(String, nullable=False)
    winner_name = Column(String(100), nullable=False)
    drawn_at = Column(DateTime(timezone=True), server_default=func.now())

    chit_fund = relationship("ChitFund", back_populates="draws")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(String, primary_key=True, default=generate_uuid)
    chit_fund_id = Column(String, ForeignKey("chit_funds.id"), nullable=False)
    member_id = Column(String, ForeignKey("members.id"), nullable=False)
    month = Column(Integer, nullable=False)
    amount = Column(Integer, nullable=False)
    is_paid = Column(Boolean, default=False)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    marked_by = Column(String, nullable=True)

    chit_fund = relationship("ChitFund", back_populates="payments")
    member = relationship("Member", back_populates="payments")
