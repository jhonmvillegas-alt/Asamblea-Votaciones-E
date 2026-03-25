import random
import uuid

import pytest
import requests
from dotenv import dotenv_values


# Module coverage: temporary password assignment/login/change + delegate auth regression endpoints
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
        pytest.skip("Admin login failed with known credentials; cannot run temporary-password tests")

    data = response.json()
    token = data.get("access_token")
    assert isinstance(token, str) and token
    assert data.get("role") == "admin"
    return token


@pytest.fixture
def fresh_delegate(admin_token, api_client):
    # Numeric document to validate 4-digit temporary password policy (last 4 digits)
    unique_tail = random.randint(100000, 999999)
    document_id = f"99{unique_tail}"
    full_name = f"TEST Temp Delegate {uuid.uuid4().hex[:6].upper()}"
    temporary_password = document_id[-4:]

    upload_res = api_client.post(
        f"{API_BASE}/admin/delegates/upload",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"delegates": [{"document_id": document_id, "full_name": full_name}]},
        timeout=20,
    )
    assert upload_res.status_code == 200
    upload_data = upload_res.json()
    assert isinstance(upload_data.get("created"), int)
    assert isinstance(upload_data.get("updated"), int)

    return {
        "document_id": document_id,
        "full_name": full_name,
        "temporary_password": temporary_password,
    }


class TestTemporaryPasswordDelegateAuth:
    def test_new_delegate_login_with_temp_password_and_flag(self, api_client, fresh_delegate):
        login_res = api_client.post(
            f"{API_BASE}/auth/login-delegate",
            json={
                "document_id": fresh_delegate["document_id"],
                "password": fresh_delegate["temporary_password"],
            },
            timeout=20,
        )
        assert login_res.status_code == 200

        data = login_res.json()
        assert data["role"] == "delegate"
        assert isinstance(data.get("access_token"), str) and data["access_token"]
        assert data.get("using_temporary_password") is True

    def test_change_password_delegate_endpoint_disables_temporary(self, api_client, fresh_delegate):
        login_res = api_client.post(
            f"{API_BASE}/auth/login-delegate",
            json={
                "document_id": fresh_delegate["document_id"],
                "password": fresh_delegate["temporary_password"],
            },
            timeout=20,
        )
        assert login_res.status_code == 200
        delegate_token = login_res.json()["access_token"]

        new_password = f"NuevaSegura{uuid.uuid4().hex[:4]}"
        change_res = api_client.post(
            f"{API_BASE}/auth/change-password-delegate",
            headers={"Authorization": f"Bearer {delegate_token}"},
            json={
                "current_password": fresh_delegate["temporary_password"],
                "new_password": new_password,
            },
            timeout=20,
        )
        assert change_res.status_code == 200
        change_data = change_res.json()
        assert "actualizada" in change_data.get("message", "").lower()

        relogin_res = api_client.post(
            f"{API_BASE}/auth/login-delegate",
            json={"document_id": fresh_delegate["document_id"], "password": new_password},
            timeout=20,
        )
        assert relogin_res.status_code == 200
        relogin_data = relogin_res.json()
        assert relogin_data.get("using_temporary_password") is False

    def test_reupload_existing_delegate_does_not_reset_password(self, api_client, admin_token, fresh_delegate):
        first_login = api_client.post(
            f"{API_BASE}/auth/login-delegate",
            json={
                "document_id": fresh_delegate["document_id"],
                "password": fresh_delegate["temporary_password"],
            },
            timeout=20,
        )
        assert first_login.status_code == 200
        delegate_token = first_login.json()["access_token"]

        stable_password = f"Estable{uuid.uuid4().hex[:6]}"
        change_res = api_client.post(
            f"{API_BASE}/auth/change-password-delegate",
            headers={"Authorization": f"Bearer {delegate_token}"},
            json={
                "current_password": fresh_delegate["temporary_password"],
                "new_password": stable_password,
            },
            timeout=20,
        )
        assert change_res.status_code == 200

        reupload_res = api_client.post(
            f"{API_BASE}/admin/delegates/upload",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "delegates": [
                    {
                        "document_id": fresh_delegate["document_id"],
                        "full_name": f"{fresh_delegate['full_name']} UPDATED",
                    }
                ]
            },
            timeout=20,
        )
        assert reupload_res.status_code == 200

        old_temp_login = api_client.post(
            f"{API_BASE}/auth/login-delegate",
            json={
                "document_id": fresh_delegate["document_id"],
                "password": fresh_delegate["temporary_password"],
            },
            timeout=20,
        )
        assert old_temp_login.status_code == 401

        stable_login = api_client.post(
            f"{API_BASE}/auth/login-delegate",
            json={"document_id": fresh_delegate["document_id"], "password": stable_password},
            timeout=20,
        )
        assert stable_login.status_code == 200
        stable_data = stable_login.json()
        assert stable_data.get("using_temporary_password") is False

    def test_regression_admin_delegate_voting_endpoints_still_operational(self, api_client, admin_token, fresh_delegate):
        admin_me_res = api_client.get(
            f"{API_BASE}/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=20,
        )
        assert admin_me_res.status_code == 200
        assert admin_me_res.json().get("role") == "admin"

        delegate_login = api_client.post(
            f"{API_BASE}/auth/login-delegate",
            json={
                "document_id": fresh_delegate["document_id"],
                "password": fresh_delegate["temporary_password"],
            },
            timeout=20,
        )
        assert delegate_login.status_code == 200
        delegate_token = delegate_login.json().get("access_token")

        active_point_res = api_client.get(
            f"{API_BASE}/voting/active-point",
            headers={"Authorization": f"Bearer {delegate_token}"},
            timeout=20,
        )
        assert active_point_res.status_code == 200
        active_point_data = active_point_res.json()
        assert isinstance(active_point_data.get("has_active_point"), bool)
