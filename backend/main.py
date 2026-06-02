from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
import random

from database import get_db, engine, Base
from models import ChitFund, Member, DrawResult, ChitStatus
from schemas import (
    ChitFundCreate, ChitFundResponse, ChitFundListResponse,
    MemberCreate, MemberResponse, DrawResultResponse
)
from config import get_settings

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="ChitFund API",
    description="Backend API for Digital Chit Fund Management",
    version="1.0.0"
)

settings = get_settings()

# CORS configuration
origins = [origin.strip() for origin in settings.cors_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── JWT Helper ───────────────────────────────────────────────────────────────

def get_user_id(request: Request) -> Optional[str]:
    """
    Extract Supabase user ID from JWT token in Authorization header.
    Returns None if no token or invalid token — allows public routes to work.
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth.split(" ")[1]
    try:
        import base64, json
        # Decode JWT payload without signature verification
        payload_b64 = token.split(".")[1]
        # Add padding
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        return payload.get("sub")  # Supabase user UUID
    except Exception:
        return None


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"message": "ChitFund API is running", "version": "1.0.0"}


@app.get("/api/chits", response_model=List[ChitFundListResponse])
def get_chits(request: Request, db: Session = Depends(get_db)):
    """Get all chit funds for the logged-in user (created + joined)"""
    user_id = get_user_id(request)

    if not user_id:
        # No auth — return empty list
        return []

    # Chits I created OR chits I joined as a member
    chits = db.query(ChitFund).filter(
        or_(
            ChitFund.user_id == user_id,
            ChitFund.id.in_(
                db.query(Member.chit_fund_id).filter(Member.user_id == user_id)
            )
        )
    ).all()

    return chits


@app.get("/api/chits/{chit_id}", response_model=ChitFundResponse)
def get_chit(chit_id: str, db: Session = Depends(get_db)):
    """Get a single chit fund by ID — public so invite links work"""
    chit = db.query(ChitFund).filter(ChitFund.id == chit_id).first()
    if not chit:
        raise HTTPException(status_code=404, detail="Chit fund not found")
    return chit


@app.post("/api/chits", response_model=ChitFundResponse)
def create_chit(payload: ChitFundCreate, request: Request, db: Session = Depends(get_db)):
    """Create a new chit fund — requires auth"""
    user_id = get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    chit = ChitFund(
        name=payload.name,
        description=payload.description,
        monthly_amount=payload.monthly_amount,
        currency=payload.currency,
        total_members=payload.total_members,
        duration_months=payload.duration_months,
        organizer_wins_first=payload.organizer_wins_first,
        status=ChitStatus.DRAFT,
        current_month=0,
        user_id=user_id,  # ← link to logged-in user
    )

    db.add(chit)
    db.flush()

    organizer = Member(
        chit_fund_id=chit.id,
        name=payload.organizer_name,
        email=payload.organizer_email,
        country=payload.organizer_country,
        has_won=False,
        user_id=user_id,  # ← organizer is also a member
    )

    db.add(organizer)
    db.flush()

    chit.organizer_id = organizer.id

    db.commit()
    db.refresh(chit)

    return chit


@app.post("/api/chits/{chit_id}/members", response_model=MemberResponse)
def add_member(chit_id: str, payload: MemberCreate, request: Request, db: Session = Depends(get_db)):
    """Add a member — user_id optional (invite link users may not be logged in)"""
    user_id = get_user_id(request)  # can be None for invite link joins

    chit = db.query(ChitFund).filter(ChitFund.id == chit_id).first()
    if not chit:
        raise HTTPException(status_code=404, detail="Chit fund not found")

    if chit.status != ChitStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Cannot add members to an active chit")

    if len(chit.members) >= chit.total_members:
        raise HTTPException(status_code=400, detail="Maximum members reached")

    existing = db.query(Member).filter(
        Member.chit_fund_id == chit_id,
        Member.email == payload.email
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Member with this email already exists")

    member = Member(
        chit_fund_id=chit_id,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        country=payload.country,
        has_won=False,
        user_id=user_id,  # ← None if joined without account
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
def remove_member(chit_id: str, member_id: str, db: Session = Depends(get_db)):
    """Remove a member from a chit fund"""
    chit = db.query(ChitFund).filter(ChitFund.id == chit_id).first()
    if not chit:
        raise HTTPException(status_code=404, detail="Chit fund not found")

    if chit.status != ChitStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Cannot remove members from an active chit")

    if member_id == chit.organizer_id:
        raise HTTPException(status_code=400, detail="Cannot remove the organizer")

    member = db.query(Member).filter(
        Member.id == member_id,
        Member.chit_fund_id == chit_id
    ).first()

    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    db.delete(member)
    db.commit()

    return {"message": "Member removed successfully"}


@app.get("/api/chits/{chit_id}/eligible", response_model=List[MemberResponse])
def get_eligible_members(chit_id: str, db: Session = Depends(get_db)):
    """Get members eligible for the next draw"""
    chit = db.query(ChitFund).filter(ChitFund.id == chit_id).first()
    if not chit:
        raise HTTPException(status_code=404, detail="Chit fund not found")

    eligible = [m for m in chit.members if not m.has_won]

    if not chit.organizer_wins_first and chit.current_month < chit.duration_months:
        eligible = [m for m in eligible if m.id != chit.organizer_id]

    return eligible


@app.post("/api/chits/{chit_id}/draw", response_model=DrawResultResponse)
def conduct_draw(chit_id: str, db: Session = Depends(get_db)):
    """Conduct the monthly draw"""
    chit = db.query(ChitFund).filter(ChitFund.id == chit_id).first()
    if not chit:
        raise HTTPException(status_code=404, detail="Chit fund not found")

    if chit.status != ChitStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Chit is not active")

    if chit.current_month > chit.duration_months:
        raise HTTPException(status_code=400, detail="All draws completed")

    eligible = [m for m in chit.members if not m.has_won]

    if not eligible:
        raise HTTPException(status_code=400, detail="No eligible members")

    organizer = next((m for m in chit.members if m.id == chit.organizer_id), None)
    is_first_month = chit.current_month == 1
    is_last_month = chit.current_month == chit.duration_months

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
    winner.won_in_month = chit.current_month

    draw_result = DrawResult(
        chit_fund_id=chit.id,
        month=chit.current_month,
        winner_id=winner.id,
        winner_name=winner.name
    )

    db.add(draw_result)
    chit.current_month += 1

    if chit.current_month > chit.duration_months:
        chit.status = ChitStatus.COMPLETED

    db.commit()
    db.refresh(draw_result)

    return draw_result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)