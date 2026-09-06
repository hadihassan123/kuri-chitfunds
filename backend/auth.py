from uuid import UUID

import jwt
from fastapi import HTTPException, Request
from jwt import InvalidTokenError, PyJWKClient

from config import get_settings

settings = get_settings()
SUPABASE_URL = settings.supabase_url.rstrip("/")
JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
SUPABASE_ISSUER = f"{SUPABASE_URL}/auth/v1"
EXPECTED_ALGORITHM = "ES256"
EXPECTED_AUDIENCE = "authenticated"

_jwks_client = PyJWKClient(JWKS_URL)


def get_current_user_id(request: Request) -> str:
    """Verify the Supabase access token and return the authenticated user ID."""
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")

    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Authentication required")

    token = token.strip()

    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") != EXPECTED_ALGORITHM:
            raise InvalidTokenError("Unsupported JWT algorithm")

        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=[EXPECTED_ALGORITHM],
            audience=EXPECTED_AUDIENCE,
            issuer=SUPABASE_ISSUER,
            options={"require": ["exp", "iss", "aud", "sub"]},
        )

        subject = payload.get("sub")
        if not isinstance(subject, str) or not subject.strip():
            raise InvalidTokenError("Missing JWT subject")

        UUID(subject)
        return subject
    except (InvalidTokenError, ValueError, TypeError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid authentication token")
