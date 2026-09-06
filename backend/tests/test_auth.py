import base64
import json
import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

os.environ.setdefault("SUPABASE_URL", "https://kxhjkfwqcmgfbxqqyqby.supabase.co")

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException
from starlette.requests import Request

from auth import SUPABASE_ISSUER, _jwks_client, get_user_id


@pytest.fixture
def signing_keys():
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()
    _jwks_client.get_signing_key_from_jwt = lambda token: SimpleNamespace(key=public_key)
    return private_key, public_key


def make_request(token: str | None) -> Request:
    headers = []
    if token is not None:
        headers.append((b"authorization", f"Bearer {token}".encode()))
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers})


def make_token(private_key, **overrides):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(uuid4()),
        "iss": SUPABASE_ISSUER,
        "aud": "authenticated",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=10)).timestamp()),
    }
    payload.update(overrides)
    return jwt.encode(payload, private_key, algorithm="ES256", headers={"kid": "test-key"})


def replace_header(token: str, **changes) -> str:
    encoded_header, payload, signature = token.split(".")
    padding = "=" * (-len(encoded_header) % 4)
    header = json.loads(base64.urlsafe_b64decode(encoded_header + padding))
    header.update(changes)
    new_header = base64.urlsafe_b64encode(json.dumps(header, separators=(",", ":")).encode()).rstrip(b"=").decode()
    return f"{new_header}.{payload}.{signature}"


def test_missing_authorization_returns_401():
    with pytest.raises(HTTPException) as exc:
        get_user_id(make_request(None))
    assert exc.value.status_code == 401
    assert exc.value.detail == "Authentication required"


def test_malformed_token_returns_401():
    with pytest.raises(HTTPException) as exc:
        get_user_id(make_request("not-a-jwt"))
    assert exc.value.status_code == 401


def test_valid_es256_token_is_accepted(signing_keys):
    private_key, _ = signing_keys
    token = make_token(private_key)

    user_id = get_user_id(make_request(token))

    assert len(user_id) == 36


def test_wrong_signature_returns_401(signing_keys):
    _, _ = signing_keys
    attacker_key = ec.generate_private_key(ec.SECP256R1())
    token = make_token(attacker_key)

    with pytest.raises(HTTPException) as exc:
        get_user_id(make_request(token))
    assert exc.value.status_code == 401


def test_expired_token_returns_401(signing_keys):
    private_key, _ = signing_keys
    now = datetime.now(timezone.utc)
    token = make_token(
        private_key,
        iat=int((now - timedelta(minutes=20)).timestamp()),
        exp=int((now - timedelta(minutes=10)).timestamp()),
    )

    with pytest.raises(HTTPException) as exc:
        get_user_id(make_request(token))
    assert exc.value.status_code == 401


def test_wrong_issuer_returns_401(signing_keys):
    private_key, _ = signing_keys
    token = make_token(private_key, iss="https://attacker.example/auth/v1")

    with pytest.raises(HTTPException) as exc:
        get_user_id(make_request(token))
    assert exc.value.status_code == 401


def test_wrong_audience_returns_401(signing_keys):
    private_key, _ = signing_keys
    token = make_token(private_key, aud="anon")

    with pytest.raises(HTTPException) as exc:
        get_user_id(make_request(token))
    assert exc.value.status_code == 401


def test_unsupported_algorithm_returns_401(signing_keys):
    private_key, _ = signing_keys
    token = replace_header(make_token(private_key), alg="RS256")

    with pytest.raises(HTTPException) as exc:
        get_user_id(make_request(token))
    assert exc.value.status_code == 401


def test_missing_subject_returns_401(signing_keys):
    private_key, _ = signing_keys
    token = make_token(private_key, sub=None)

    with pytest.raises(HTTPException) as exc:
        get_user_id(make_request(token))
    assert exc.value.status_code == 401
