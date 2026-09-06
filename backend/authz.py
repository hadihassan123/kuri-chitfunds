from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import ChitFund, Member


def get_chit_for_user(chit_id: str, user_id: str, db: Session) -> ChitFund:
    """Return a chit only when the user is its organizer or a member."""
    chit = db.query(ChitFund).filter(ChitFund.id == chit_id).first()
    if not chit:
        raise HTTPException(status_code=404, detail="Chit fund not found")

    if chit.user_id == user_id:
        return chit

    is_member = db.query(Member.id).filter(
        Member.chit_fund_id == chit_id,
        Member.user_id == user_id,
    ).first()
    if not is_member:
        # Use 404 to avoid confirming that another user's chit exists.
        raise HTTPException(status_code=404, detail="Chit fund not found")

    return chit


def require_chit_organizer(chit_id: str, user_id: str, db: Session) -> ChitFund:
    """Return a chit only when the authenticated user owns/organizes it."""
    chit = db.query(ChitFund).filter(ChitFund.id == chit_id).first()
    if not chit:
        raise HTTPException(status_code=404, detail="Chit fund not found")
    if chit.user_id != user_id:
        raise HTTPException(status_code=403, detail="Organizer only")
    return chit
