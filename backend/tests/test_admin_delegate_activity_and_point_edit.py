import uuid

import pytest
import requests
from dotenv import dotenv_values


# Module coverage: admin delegate activity endpoint, delegate activity tracking hooks, point edit endpoint, admin-only permissions
FRONTEND_ENV = dotenv_values("/app/frontend/.env")
BASE_URL = FRONTEND_ENV.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    raise RuntimeError("Missing REACT_APP_BACKEND_URL in /app/frontend/.env")

API_BASE = f"{str(BASE_URL).rstrip('/')}/api"


@pytest.fixture(scope="session")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def admin_token(api_client):
    response = api_client.post(
        f"{API_BASE}/auth/login-admin",
        json={"username": "admin", "password": "ses2026"},
        timeout=20,
    )
    if response.status_code != 200:
        pytest.skip("Admin login failed with expected credentials")

    data = response.json()
    token = data.get("access_token")
    assert isinstance(token, str) and token
    assert data.get("role") == "admin"
    return token


@pytest.fixture(scope="session")
def seeded_context(api_client, admin_token):
    suffix = uuid.uuid4().hex[:8].upper()
    document_id = f"ACT{suffix}"
    delegate_name = f"TEST Activity Delegate {suffix}"
    temporary_password = document_id[-4:]

    upload_res = api_client.post(
        f"{API_BASE}/admin/delegates/upload",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"delegates": [{"document_id": document_id, "full_name": delegate_name}]},
        timeout=20,
    )
    assert upload_res.status_code == 200
    upload_data = upload_res.json()
    assert upload_data["created"] + upload_data["updated"] >= 1

    login_delegate_res = api_client.post(
        f"{API_BASE}/auth/login-delegate",
        json={"document_id": document_id, "password": temporary_password},
        timeout=20,
    )
    assert login_delegate_res.status_code == 200
    delegate_login_data = login_delegate_res.json()
    assert delegate_login_data["role"] == "delegate"
    delegate_token = delegate_login_data.get("access_token")
    assert isinstance(delegate_token, str) and delegate_token

    points_res = api_client.get(
        f"{API_BASE}/admin/points",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=20,
    )
    assert points_res.status_code == 200
    points = points_res.json().get("points", [])
    existing_orders = {point.get("order") for point in points}
    free_order = next((n for n in range(1, 41) if n not in existing_orders), None)
    if free_order is None:
        pytest.skip("No free order available to create test point")

    create_point_res = api_client.post(
        f"{API_BASE}/admin/points",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "title": f"TEST Activity Point {suffix}",
            "description": "TEST point for delegate activity and edit checks",
            "order": free_order,
        },
        timeout=20,
    )
    assert create_point_res.status_code == 200

    list_after_create_res = api_client.get(
        f"{API_BASE}/admin/points",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=20,
    )
    assert list_after_create_res.status_code == 200
    points_after_create = list_after_create_res.json().get("points", [])
    point = next((item for item in points_after_create if item.get("order") == free_order), None)
    assert point is not None

    open_res = api_client.post(
        f"{API_BASE}/admin/points/{point['id']}/open",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=20,
    )
    assert open_res.status_code == 200

    active_res = api_client.get(
        f"{API_BASE}/voting/active-point",
        headers={"Authorization": f"Bearer {delegate_token}"},
        timeout=20,
    )
    assert active_res.status_code == 200
    active_data = active_res.json()
    assert active_data.get("has_active_point") is True
    assert active_data.get("point", {}).get("id") == point["id"]

    vote_res = api_client.post(
        f"{API_BASE}/voting/vote",
        headers={"Authorization": f"Bearer {delegate_token}"},
        json={"point_id": point["id"], "choice": "aprobado"},
        timeout=20,
    )
    assert vote_res.status_code == 200

    return {
        "delegate_document_id": document_id,
        "delegate_name": delegate_name,
        "delegate_token": delegate_token,
        "point_id": point["id"],
        "point_order": free_order,
    }


class TestAdminDelegateActivityAndPointEdit:
    def test_admin_can_view_delegate_activity_with_expected_fields(self, api_client, admin_token, seeded_context):
        response = api_client.get(
            f"{API_BASE}/admin/delegates/activity?active_window_minutes=15",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=20,
        )
        assert response.status_code == 200

        data = response.json()
        assert data["active_window_minutes"] == 15
        assert isinstance(data.get("active_now_count"), int)
        assert isinstance(data.get("logged_today_count"), int)
        assert isinstance(data.get("total_delegates"), int)
        assert isinstance(data.get("delegates"), list)

        target_delegate = next(
            (item for item in data["delegates"] if item.get("document_id") == seeded_context["delegate_document_id"]),
            None,
        )
        assert target_delegate is not None
        assert target_delegate["full_name"] == seeded_context["delegate_name"]
        assert target_delegate["logged_today"] is True
        assert target_delegate["is_active_now"] is True
        assert target_delegate.get("last_login_at")
        assert target_delegate.get("last_activity_at")
        assert data["active_now_count"] >= 1
        assert data["logged_today_count"] >= 1

    def test_admin_can_edit_point_and_persist_changes(self, api_client, admin_token, seeded_context):
        update_payload = {
            "title": "TEST Edited Point Title",
            "description": "TEST Edited description for admin point update",
            "order": seeded_context["point_order"],
        }
        update_res = api_client.put(
            f"{API_BASE}/admin/points/{seeded_context['point_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=update_payload,
            timeout=20,
        )
        assert update_res.status_code == 200
        assert "actualizado" in update_res.json().get("message", "").lower()

        list_res = api_client.get(
            f"{API_BASE}/admin/points",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=20,
        )
        assert list_res.status_code == 200
        point = next(
            (item for item in list_res.json().get("points", []) if item.get("id") == seeded_context["point_id"]),
            None,
        )
        assert point is not None
        assert point["title"] == update_payload["title"]
        assert point["description"] == update_payload["description"]
        assert point["order"] == update_payload["order"]

    def test_delegate_cannot_access_admin_delegate_activity_endpoint(self, api_client, seeded_context):
        forbidden_res = api_client.get(
            f"{API_BASE}/admin/delegates/activity",
            headers={"Authorization": f"Bearer {seeded_context['delegate_token']}"},
            timeout=20,
        )
        assert forbidden_res.status_code == 403
        assert "solo administrador" in forbidden_res.json().get("detail", "").lower()

    def test_delegate_cannot_edit_points(self, api_client, seeded_context):
        response = api_client.put(
            f"{API_BASE}/admin/points/{seeded_context['point_id']}",
            headers={"Authorization": f"Bearer {seeded_context['delegate_token']}"},
            json={
                "title": "Delegado no autorizado",
                "description": "Intento no autorizado",
                "order": seeded_context["point_order"],
            },
            timeout=20,
        )
        assert response.status_code == 403
        assert "solo administrador" in response.json().get("detail", "").lower()

    def test_unauthenticated_user_cannot_access_admin_activity_or_edit(self, api_client, seeded_context):
        activity_res = api_client.get(f"{API_BASE}/admin/delegates/activity", timeout=20)
        assert activity_res.status_code == 401
        assert "token" in activity_res.json().get("detail", "").lower()

        edit_res = api_client.put(
            f"{API_BASE}/admin/points/{seeded_context['point_id']}",
            json={
                "title": "No auth",
                "description": "No auth",
                "order": seeded_context["point_order"],
            },
            timeout=20,
        )
        assert edit_res.status_code == 401
        assert "token" in edit_res.json().get("detail", "").lower()
