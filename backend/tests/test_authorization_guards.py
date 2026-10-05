from conftest import override_user
from test_draw_guard import seed_active_kuri
from main import app
from auth import get_current_user_id
from models import ChitFund


def set_authenticated_user(user_id: str):
    app.dependency_overrides[get_current_user_id] = override_user(user_id)


def test_member_can_read_chit_but_cannot_manage_it(client, test_db):
    chit_id = seed_active_kuri(test_db)
    set_authenticated_user("member-2")

    response = client.get(f"/api/chits/{chit_id}")
    assert response.status_code == 200

    add_response = client.post(
        f"/api/chits/{chit_id}/members",
        json={
            "name": "Another Member",
            "email": "another@example.com",
            "country": "IN",
        },
    )
    assert add_response.status_code == 403
    assert add_response.json()["detail"] == "Organizer only"


def test_member_cannot_remove_member(client, test_db):
    chit_id = seed_active_kuri(test_db)
    set_authenticated_user("member-2")

    response = client.delete(f"/api/chits/{chit_id}/members/member-2")
    assert response.status_code == 403
    assert response.json()["detail"] == "Organizer only"


def test_member_cannot_conduct_draw(client, test_db):
    chit_id = seed_active_kuri(test_db)
    set_authenticated_user("member-2")

    response = client.post(
        f"/api/chits/{chit_id}/draw",
        json={"expected_month": 1},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Organizer only"

    chit = test_db.query(ChitFund).filter(ChitFund.id == chit_id).one()
    assert chit.current_month == 1


def test_unrelated_user_cannot_read_or_delete_chit(client, test_db):
    chit_id = seed_active_kuri(test_db)
    set_authenticated_user("unrelated-user")

    read_response = client.get(f"/api/chits/{chit_id}")
    assert read_response.status_code == 404
    assert read_response.json()["detail"] == "Chit fund not found"

    delete_response = client.delete(f"/api/chits/{chit_id}")
    assert delete_response.status_code == 403
    assert delete_response.json()["detail"] == "Organizer only"
