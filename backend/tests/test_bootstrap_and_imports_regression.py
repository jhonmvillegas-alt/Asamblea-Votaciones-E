import uuid

import pytest
import requests
from dotenv import dotenv_values


# Module coverage: bootstrap public endpoints + admin/delegate auth regression + delegate/point bulk uploads
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
def bootstrap_status_data(api_client):
    response = api_client.get(f"{API_BASE}/public/bootstrap-status", timeout=20)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data.get("setup_required"), bool)
    assert isinstance(data.get("admin_count"), int)
    assert isinstance(data.get("delegates_count"), int)
    assert isinstance(data.get("points_count"), int)
    return data


@pytest.fixture(scope="session")
def admin_context(api_client, bootstrap_status_data):
    username = "admin"
    password = "ses2026"
    login_res = api_client.post(
        f"{API_BASE}/auth/login-admin",
        json={"username": username, "password": password},
        timeout=20,
    )

    if login_res.status_code != 200 and bootstrap_status_data["setup_required"]:
        suffix = uuid.uuid4().hex[:6]
        username = f"bootadmin{suffix}"
        password = f"Boot{suffix}123"
        init_res = api_client.post(
            f"{API_BASE}/public/bootstrap-initialize",
            json={
                "admin_username": username,
                "admin_password": password,
                "delegates": [
                    {
                        "document_id": f"BOOT{suffix}",
                        "full_name": f"BOOT Delegate {suffix}",
                    }
                ],
                "points": [
                    {
                        "order": 1,
                        "title": f"BOOT Pregunta {suffix}",
                        "description": "Carga inicial automática para testing",
                    }
                ],
            },
            timeout=20,
        )
        if init_res.status_code not in {200, 400}:
            pytest.fail(f"Unexpected bootstrap initialize status: {init_res.status_code}")

        login_res = api_client.post(
            f"{API_BASE}/auth/login-admin",
            json={"username": username, "password": password},
            timeout=20,
        )

    if login_res.status_code != 200:
        pytest.fail(
            "Admin login regression: unable to login with known admin credentials. "
            "If setup already completed with custom credentials, test data is not accessible."
        )

    login_data = login_res.json()
    assert login_data["role"] == "admin"
    assert isinstance(login_data.get("access_token"), str) and login_data["access_token"]

    return {
        "token": login_data["access_token"],
        "username": username,
    }


class TestBootstrapAndRegression:
    # Features: public bootstrap status/init, admin points bulk endpoint, auth regression and data persistence checks

    def test_public_bootstrap_status(self, bootstrap_status_data):
        assert set(bootstrap_status_data.keys()) == {
            "setup_required",
            "admin_count",
            "delegates_count",
            "points_count",
        }

    def test_bootstrap_initialize_only_when_no_admin(self, api_client, bootstrap_status_data):
        payload = {
            "admin_username": "should_not_create",
            "admin_password": "should_not_create_123",
            "delegates": [],
            "points": [],
        }
        status_before_res = api_client.get(f"{API_BASE}/public/bootstrap-status", timeout=20)
        assert status_before_res.status_code == 200
        status_before = status_before_res.json()

        response = api_client.post(
            f"{API_BASE}/public/bootstrap-initialize",
            json=payload,
            timeout=20,
        )

        if status_before["setup_required"]:
            assert response.status_code == 200
            data = response.json()
            assert "message" in data
        else:
            assert response.status_code == 400
            data = response.json()
            assert "completada" in data.get("detail", "").lower()

    def test_admin_login_and_me_regression(self, api_client, admin_context):
        me_res = api_client.get(
            f"{API_BASE}/auth/me",
            headers={"Authorization": f"Bearer {admin_context['token']}"},
            timeout=20,
        )
        assert me_res.status_code == 200
        profile = me_res.json()
        assert profile["role"] == "admin"
        assert isinstance(profile.get("display_name"), str)
        assert profile["display_name"]

    def test_admin_upload_delegates_and_verify_summary(self, api_client, admin_context):
        suffix = uuid.uuid4().hex[:8].upper()
        delegates = [
            {"document_id": f"TXT{suffix}", "full_name": f"TEST Texto {suffix}"},
            {"document_id": f"CSV{suffix}", "full_name": f"TEST Archivo {suffix}"},
        ]

        upload_res = api_client.post(
            f"{API_BASE}/admin/delegates/upload",
            headers={"Authorization": f"Bearer {admin_context['token']}"},
            json={"delegates": delegates},
            timeout=20,
        )
        assert upload_res.status_code == 200
        upload_data = upload_res.json()
        assert upload_data["created"] + upload_data["updated"] >= 2
        assert isinstance(upload_data["total_in_padron"], int)

        summary_res = api_client.get(
            f"{API_BASE}/admin/delegates/summary",
            headers={"Authorization": f"Bearer {admin_context['token']}"},
            timeout=20,
        )
        assert summary_res.status_code == 200
        summary = summary_res.json()
        assert summary["total_in_padron"] >= upload_data["total_in_padron"]

    def test_admin_points_bulk_create_and_verify_persistence(self, api_client, admin_context):
        points_res = api_client.get(
            f"{API_BASE}/admin/points",
            headers={"Authorization": f"Bearer {admin_context['token']}"},
            timeout=20,
        )
        assert points_res.status_code == 200
        existing_orders = {p.get("order") for p in points_res.json().get("points", [])}

        free_orders = [n for n in range(1, 41) if n not in existing_orders][:2]
        if len(free_orders) < 2:
            pytest.skip("No hay órdenes libres para crear puntos de prueba")

        suffix = uuid.uuid4().hex[:6]
        payload_points = [
            {
                "order": free_orders[0],
                "title": f"TEST Bulk Punto A {suffix}",
                "description": "Creado por endpoint bulk",
            },
            {
                "order": free_orders[1],
                "title": f"TEST Bulk Punto B {suffix}",
                "description": "Creado por endpoint bulk",
            },
        ]

        bulk_res = api_client.post(
            f"{API_BASE}/admin/points/bulk",
            headers={"Authorization": f"Bearer {admin_context['token']}"},
            json={"points": payload_points},
            timeout=20,
        )
        assert bulk_res.status_code == 200
        bulk_data = bulk_res.json()
        assert bulk_data["created"] + bulk_data["updated"] >= 2
        assert isinstance(bulk_data.get("total_points"), int)

        verify_res = api_client.get(
            f"{API_BASE}/admin/points",
            headers={"Authorization": f"Bearer {admin_context['token']}"},
            timeout=20,
        )
        assert verify_res.status_code == 200
        points = verify_res.json().get("points", [])
        for expected in payload_points:
            match = next((item for item in points if item.get("order") == expected["order"]), None)
            assert match is not None
            assert match["title"] == expected["title"]
            assert match["description"] == expected["description"]

    def test_admin_point_individual_create_and_verify(self, api_client, admin_context):
        list_res = api_client.get(
            f"{API_BASE}/admin/points",
            headers={"Authorization": f"Bearer {admin_context['token']}"},
            timeout=20,
        )
        assert list_res.status_code == 200
        existing_orders = {p.get("order") for p in list_res.json().get("points", [])}
        free_order = next((n for n in range(1, 41) if n not in existing_orders), None)
        if free_order is None:
            pytest.skip("No hay orden disponible para crear punto individual")

        suffix = uuid.uuid4().hex[:6]
        payload = {
            "order": free_order,
            "title": f"TEST Individual {suffix}",
            "description": "Punto creado individualmente para regresión",
        }

        create_res = api_client.post(
            f"{API_BASE}/admin/points",
            headers={"Authorization": f"Bearer {admin_context['token']}"},
            json=payload,
            timeout=20,
        )
        assert create_res.status_code == 200
        data = create_res.json()
        assert "Punto creado" in data.get("message", "")

        verify_res = api_client.get(
            f"{API_BASE}/admin/points",
            headers={"Authorization": f"Bearer {admin_context['token']}"},
            timeout=20,
        )
        assert verify_res.status_code == 200
        created = next(
            (item for item in verify_res.json().get("points", []) if item.get("order") == payload["order"]),
            None,
        )
        assert created is not None
        assert created["title"] == payload["title"]

    def test_delegate_register_login_and_me_regression(self, api_client, admin_context):
        suffix = uuid.uuid4().hex[:7].upper()
        document_id = f"REG{suffix}"
        full_name = f"TEST Regression Delegate {suffix}"
        password = f"Reg{suffix}99"

        upload_res = api_client.post(
            f"{API_BASE}/admin/delegates/upload",
            headers={"Authorization": f"Bearer {admin_context['token']}"},
            json={"delegates": [{"document_id": document_id, "full_name": full_name}]},
            timeout=20,
        )
        assert upload_res.status_code == 200

        register_res = api_client.post(
            f"{API_BASE}/auth/register-delegate",
            json={"document_id": document_id, "password": password},
            timeout=20,
        )
        assert register_res.status_code == 200
        register_data = register_res.json()
        assert "registro" in register_data.get("message", "").lower()

        login_res = api_client.post(
            f"{API_BASE}/auth/login-delegate",
            json={"document_id": document_id, "password": password},
            timeout=20,
        )
        assert login_res.status_code == 200
        login_data = login_res.json()
        assert login_data["role"] == "delegate"
        assert isinstance(login_data.get("access_token"), str) and login_data["access_token"]

        me_res = api_client.get(
            f"{API_BASE}/auth/me",
            headers={"Authorization": f"Bearer {login_data['access_token']}"},
            timeout=20,
        )
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["role"] == "delegate"
        assert me_data["document_id"] == document_id