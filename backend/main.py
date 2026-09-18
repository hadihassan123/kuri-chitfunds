from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sqlalchemy.sql import func
from typing import List
import random

from database import get_db, engine, Base
from models import ChitFund, Member, DrawResult, Payment, ChitStatus
from schemas import (
    ChitFundCreate, ChitFundResponse, ChitFundListResponse,
    MemberCreate, MemberResponse, MembershipClaimResponse, PublicInviteResponse, DrawResultResponse, PaymentResponse
)
from config import get_settings
from auth import get_current_user_id, get_current_user_email
from authz import get_chit_for_user, require_chit_organizer

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="ChitFund API",
    description="Backend API for Digital Chit Fund Management",
    version="1.0.0"
)

settings = get_settings()
origins = [origin.strip() for origin in settings.cors_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "ChitFund API is running", "version": "1.0.0"}


@app.get("/api/chits", response_model=List[ChitFundListResponse])
def get_chits(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    chits = db.query(ChitFund).filter(
        or_(
            ChitFund.user_id == user_id,
            ChitFund.id.in_(db.query(Member.chit_fund_id).filter(Member.user_id == user_id))
        )
    ).all()
    return chits


@app.get("/api/invites/{chit_id}", response_model=PublicInviteResponse)
def get_public_invite(chit_id: str, db: Session = Depends(get_db)):
    chit = db.query(ChitFund).filter(ChitFund.id == chit_id).first()
    if not chit:
        raise HTTPException(status_code=404, detail="Invite not found")
    organizer = db.query(Member).filter(
        Member.id == chit.organizer_id,
        Member.chit_fund_id == chit_id,
    ).first()
    member_count = db.query(Member.id).filter(Member.chit_fund_id == chit_id).count()
    return PublicInviteResponse(
        id=chit.id,
        name=chit.name,
        description=chit.description,
        monthly_amount=chit.monthly_amount,
        currency=chit.currency,
        total_members=chit.total_members,
        duration_months=chit.duration_months,
        member_count=member_count,
        organizer_name=organizer.name if organizer else None,
        organizer_wins_first=chit.organizer_wins_first,
        status=chit.status,
    )


@app.get("/api/chits/{chit_id}", response_model=ChitFundResponse)
def get_chit(chit_id: str, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    return get_chit_for_user(chit_id, user_id, db)


@app.get("/api/memberships/pending", response_model=List[MembershipClaimResponse])
def get_pending_memberships(
    email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Member, ChitFund)
        .join(ChitFund, ChitFund.id == Member.chit_fund_id)
        .filter(func.lower(Member.email) == email, Member.user_id.is_(None))
        .all()
    )
    return [
        MembershipClaimResponse(
            member_id=member.id,
            chit_id=chit.id,
            chit_name=chit.name,
            member_name=member.name,
            email=member.email,
        )
        for member, chit in rows
    ]


@app.post("/api/memberships/{member_id}/claim", response_model=MembershipClaimResponse)
def claim_membership(
    member_id: str,
    user_id: str = Depends(get_current_user_id),
    email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    member = db.query(Member).filter(Member.id == member_id).with_for_update().first()
    if not member:
        raise HTTPException(status_code=404, detail="Membership not found")
    if member.user_id is not None:
        if member.user_id == user_id:
            raise HTTPException(status_code=409, detail="Membership already claimed")
        raise HTTPException(status_code=409, detail="Membership already claimed by another account")
    if member.email.strip().lower() != email:
        raise HTTPException(status_code=404, detail="Membership not found")

    chit = db.query(ChitFund).filter(ChitFund.id == member.chit_fund_id).first()
    if not chit:
        raise HTTPException(status_code=404, detail="Chit fund not found")

    member.user_id = user_id
    db.commit()
    return MembershipClaimResponse(
        member_id=member.id,
        chit_id=chit.id,
        chit_name=chit.name,
        member_name=member.name,
        email=member.email,
    )


@app.post("/api/chits", response_model=ChitFundResponse)
def create_chit(payload: ChitFundCreate, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    organizer_id = str(__import__('uuid').uuid4())[:15]

    chit = ChitFund(
        name=payload.name,
        description=payload.description,
        monthly_amount=payload.monthly_amount,
        currency=payload.currency,
        total_members=payload.total_members,
        duration_months=payload.duration_months,
        organizer_id=organizer_id,
        organizer_wins_first=payload.organizer_wins_first,
        organizer_upi=payload.organizer_upi,
        status=ChitStatus.DRAFT,
        current_month=0,
        user_id=user_id,
    )
    db.add(chit)
    db.flush()

    organizer = Member(
        id=organizer_id,
        chit_fund_id=chit.id,
        name=payload.organizer_name,
        email=payload.organizer_email,
        country=payload.organizer_country,
        has_won=False,
        user_id=user_id,
    )
    db.add(organizer)

    db.commit()
    db.refresh(chit)
    return chit


@app.post("/api/chits/{chit_id}/members", response_model=MemberResponse)
def add_member(chit_id: str, payload: MemberCreate, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    require_chit_organizer(chit_id, user_id, db)

    chit = db.query(ChitFund).filter(ChitFund.id == chit_id).with_for_update().first()
    if not chit:
        raise HTTPException(status_code=404, detail="Chit fund not found")
    if chit.user_id != user_id:
        raise HTTPException(status_code=403, detail="Organizer only")
    if chit.status != ChitStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Cannot add members to an active chit")
    if len(chit.members) >= chit.total_members:
        raise HTTPException(status_code=400, detail="Maximum members reached")

    normalized_email = payload.email.strip().lower()
    existing = db.query(Member).filter(
        Member.chit_fund_id == chit_id,
        func.lower(Member.email) == normalized_email,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Member with this email already exists")

    member = Member(
        chit_fund_id=chit_id,
        name=payload.name,
        email=normalized_email,
        phone=payload.phone,
        country=payload.country,
        has_won=False,
        user_id=None,
    )
    db.add(member)
    db.flush()

    if len(chit.members) + 1 >= chit.total_members:
        chit.status = ChitStatus.ACTIVE
        chit.current_month = 1

    db.commit()
    db.refresh(member)
    return member


@app.delete("/api/chits/{chit_id}/members/{member_id}")
def remove_member(chit_id: str, member_id: str, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    chit = require_chit_organizer(chit_id, user_id, db)
    if chit.status != ChitStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Cannot remove members from an active chit")
    if member_id == chit.organizer_id:
        raise HTTPException(status_code=400, detail="Cannot remove the organizer")

    member = db.query(Member).filter(Member.id == member_id, Member.chit_fund_id == chit_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    db.delete(member)
    db.commit()
    return {"message": "Member removed successfully"}


@app.delete("/api/chits/{chit_id}")
def delete_chit(chit_id: str, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    chit = require_chit_organizer(chit_id, user_id, db)
    db.delete(chit)
    db.commit()
    return {"message": "Chit fund deleted successfully"}


@app.get("/api/chits/{chit_id}/eligible", response_model=List[MemberResponse])
def get_eligible_members(chit_id: str, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    chit = get_chit_for_user(chit_id, user_id, db)
    eligible = [m for m in chit.members if not m.has_won]
    if not chit.organizer_wins_first and chit.current_month < chit.duration_months:
        eligible = [m for m in eligible if m.id != chit.organizer_id]
    return eligible


@app.post("/api/chits/{chit_id}/draw", response_model=DrawResultResponse)
def conduct_draw(chit_id: str, payload: DrawRequest, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    chit = db.query(ChitFund).filter(ChitFund.id == chit_id).with_for_update().first()
    if not chit:
        raise HTTPException(status_code=404, detail="Chit fund not found")
    if chit.user_id != user_id:
        raise HTTPException(status_code=403, detail="Organizer only")
    if chit.status != ChitStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Chit is not active")
    if chit.current_month > chit.duration_months:
        raise HTTPException(status_code=400, detail="All draws completed")

    month = chit.current_month
    if payload.expected_month != month:
        raise HTTPException(
            status_code=409,
            detail=f"Draw month is stale; current month is {month}",
        )

    existing_draw = db.query(DrawResult.id).filter(
        DrawResult.chit_fund_id == chit_id,
        DrawResult.month == month,
    ).first()
    if existing_draw:
        raise HTTPException(
            status_code=409,
            detail=f"Draw already completed for month {month}",
        )

    members = db.query(Member).filter(Member.chit_fund_id == chit_id).with_for_update().all()
    eligible = [m for m in members if not m.has_won]
    if not eligible:
        raise HTTPException(status_code=400, detail="No eligible members")

    organizer = next((m for m in members if m.id == chit.organizer_id), None)
    is_first_month = month == 1
    is_last_month = month == chit.duration_months
    winner = None

    if chit.organizer_wins_first and is_first_month and organizer and not organizer.has_won:
        winner = organizer
    elif not chit.organizer_wins_first and is_last_month and organizer and not organizer.has_won:
        winner = organizer
    elif not chit.organizer_wins_first and len(eligible) == 1:
        winner = eligible[0]
    else:
        pool = eligible
        if not chit.organizer_wins_first and organizer and not organizer.has_won:
            pool = [m for m in eligible if m.id != chit.organizer_id]
        winner = random.choice(pool) if pool else random.choice(eligible)

    winner.has_won = True
    winner.won_in_month = month

    draw_result = DrawResult(chit_fund_id=chit.id, month=chit.current_month, winner_id=winner.id, winner_name=winner.name)
    db.add(draw_result)

    for member in members:
        existing = db.query(Payment).filter(
            Payment.chit_fund_id == chit_id,
            Payment.member_id == member.id,
            Payment.month == month,
        ).first()
        if not existing:
            db.add(Payment(
                chit_fund_id=chit.id,
                member_id=member.id,
                month=month,
                amount=chit.monthly_amount,
                is_paid=False,
            ))

    chit.current_month += 1
    if chit.current_month > chit.duration_months:
        chit.status = ChitStatus.COMPLETED

    db.commit()
    db.refresh(draw_result)
    return draw_result


@app.get("/api/chits/{chit_id}/payments", response_model=List[PaymentResponse])
def get_payments(chit_id: str, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    chit = get_chit_for_user(chit_id, user_id, db)
    return chit.payments


@app.patch("/api/chits/{chit_id}/payments/{payment_id}/mark-paid")
def mark_paid(chit_id: str, payment_id: str, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    payment = db.query(Payment).filter(Payment.id == payment_id, Payment.chit_fund_id == chit_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    chit = db.query(ChitFund).filter(ChitFund.id == chit_id).first()
    if not chit:
        raise HTTPException(status_code=404, detail="Chit fund not found")
    is_organizer = chit.user_id == user_id
    member = db.query(Member).filter(Member.id == payment.member_id, Member.chit_fund_id == chit_id).first()
    is_own_payment = member is not None and member.user_id == user_id
    if not is_organizer and not is_own_payment:
        raise HTTPException(status_code=403, detail="Not authorized")
    payment.is_paid = True
    payment.paid_at = func.now()
    payment.marked_by = "organizer" if is_organizer else "member"
    db.commit()
    db.refresh(payment)
    return payment


@app.patch("/api/chits/{chit_id}/payments/{payment_id}/mark-unpaid")
def mark_unpaid(chit_id: str, payment_id: str, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    require_chit_organizer(chit_id, user_id, db)
    payment = db.query(Payment).filter(Payment.id == payment_id, Payment.chit_fund_id == chit_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    payment.is_paid = False
    payment.paid_at = None
    payment.marked_by = None
    db.commit()
    db.refresh(payment)
    return payment


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
