from conftest import override_user
from auth import get_current_user_email, get_current_user_id
from main import app
from test_draw_guard import seed_active_kuri


def set_authenticated_user(user_id: str):
    app.dependency_overrides[get_current_user_id] = override_user(user_id)


def set_authenticated_email(email: str):
    app.dependency_overrides[get_current_user_email] = override_user(email)


def test_public_invite_rejects_malformed_identifier(client):
    response = client.get("/api/invites/not-a-valid-id")
    assert response.status_code == 422


def test_membership_claim_rejects_malformed_identifier(client):
    set_authenticated_user("member-2")
    set_authenticated_email("pending@example.com")

    response = client.post("/api/memberships/not-a-valid-id/claim")
    assert response.status_code == 422


def test_public_invite_still_works_for_existing_chit(client, test_db):
    chit_id = seed_active_kuri(test_db)

    response = client.get(f"/api/invites/{chit_id}")
    assert response.status_code == 200
    assert response.json()["id"] == chit_id
