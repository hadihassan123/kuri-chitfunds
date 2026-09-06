from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from authz import get_chit_for_user, require_chit_organizer


@pytest.fixture
def db():
    return MagicMock()


def test_chit_owner_can_access(db):
    chit = SimpleNamespace(id="chit-1", user_id="owner-1")
    db.query.return_value.filter.return_value.first.return_value = chit

    result = get_chit_for_user("chit-1", "owner-1", db)

    assert result is chit
    db.query.assert_called_once()


def test_member_can_access(db):
    chit = SimpleNamespace(id="chit-1", user_id="owner-1")
    query = db.query.return_value.filter.return_value
    query.first.side_effect = [chit, SimpleNamespace(id="member-1")]

    result = get_chit_for_user("chit-1", "member-1", db)

    assert result is chit
    assert query.first.call_count == 2


def test_non_member_cannot_access(db):
    chit = SimpleNamespace(id="chit-1", user_id="owner-1")
    query = db.query.return_value.filter.return_value
    query.first.side_effect = [chit, None]

    with pytest.raises(HTTPException) as exc:
        get_chit_for_user("chit-1", "outsider-1", db)

    assert exc.value.status_code == 404
    assert exc.value.detail == "Chit fund not found"


def test_missing_chit_returns_404(db):
    db.query.return_value.filter.return_value.first.return_value = None

    with pytest.raises(HTTPException) as exc:
        get_chit_for_user("missing", "user-1", db)

    assert exc.value.status_code == 404
    assert exc.value.detail == "Chit fund not found"


def test_organizer_is_allowed(db):
    chit = SimpleNamespace(id="chit-1", user_id="owner-1")
    db.query.return_value.filter.return_value.first.return_value = chit

    result = require_chit_organizer("chit-1", "owner-1", db)

    assert result is chit


def test_non_organizer_is_forbidden(db):
    chit = SimpleNamespace(id="chit-1", user_id="owner-1")
    db.query.return_value.filter.return_value.first.return_value = chit

    with pytest.raises(HTTPException) as exc:
        require_chit_organizer("chit-1", "member-1", db)

    assert exc.value.status_code == 403
    assert exc.value.detail == "Organizer only"


def test_missing_chit_for_organizer_check_returns_404(db):
    db.query.return_value.filter.return_value.first.return_value = None

    with pytest.raises(HTTPException) as exc:
        require_chit_organizer("missing", "owner-1", db)

    assert exc.value.status_code == 404
    assert exc.value.detail == "Chit fund not found"
