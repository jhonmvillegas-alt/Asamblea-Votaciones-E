import os
import uuid

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    raise RuntimeError("Missing REACT_APP_BACKEND_URL environment variable")

API_BASE = f"{BASE_URL.rstrip('/')}/api"


@pytest.fixture(scope="session")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def test_context(api_client):
    # Auth bootstrap + deterministic unique data for full voting flow
    setup_res = api_client.get(f"{API_BASE}/public/setup", timeout=20)
    assert setup_res.status_code == 200
    setup_data = setup_res.json()
    assert isinstance(setup_data.get("admin_username"), str)
    assert isinstance(setup_data.get("admin_password"), str)

    login_res = api_client.post(
        f"{API_BASE}/auth/login-admin",
        json={
            "username": setup_data["admin_username"],
            "password": setup_data["admin_password"],
        },
        timeout=20,
    )
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert login_data["role"] == "admin"
    assert isinstance(login_data.get("access_token"), str) and login_data["access_token"]

    admin_token = login_data["access_token"]

    points_res = api_client.get(
        f"{API_BASE}/admin/points",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=20,
    )
    assert points_res.status_code == 200
    existing_orders = {p.get("order") for p in points_res.json().get("points", [])}
    free_order = next((n for n in range(1, 41) if n not in existing_orders), None)
    assert free_order is not None

    suffix = uuid.uuid4().hex[:8].upper()
    document_id = f"TEST{suffix}"
    full_name = f"TEST Delegate {suffix}"

    return {
        "admin_token": admin_token,
        "document_id": document_id,
        "delegate_password": "testpass123",
        "delegate_name": full_name,
        "point_order": free_order,
        "point_id": None,
        "delegate_token": None,
    }


class TestVotingMVP:
    # Module coverage: auth, admin padron/points, delegate vote flow, live/public/directiva results

    def test_admin_login_and_profile(self, api_client, test_context):
        me_res = api_client.get(
            f"{API_BASE}/auth/me",
            headers={"Authorization": f"Bearer {test_context['admin_token']}"},
            timeout=20,
        )
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["role"] == "admin"
        assert isinstance(me_data.get("display_name"), str) and me_data["display_name"]

    def test_upload_delegate_padron(self, api_client, test_context):
        upload_res = api_client.post(
            f"{API_BASE}/admin/delegates/upload",
            headers={"Authorization": f"Bearer {test_context['admin_token']}"},
            json={
                "delegates": [
                    {
                        "document_id": test_context["document_id"],
                        "full_name": test_context["delegate_name"],
                    }
                ]
            },
            timeout=20,
        )
        assert upload_res.status_code == 200
        upload_data = upload_res.json()
        assert upload_data["created"] >= 0
        assert upload_data["total_in_padron"] >= 1

    def test_register_delegate(self, api_client, test_context):
        register_res = api_client.post(
            f"{API_BASE}/auth/register-delegate",
            json={
                "document_id": test_context["document_id"],
                "password": test_context["delegate_password"],
            },
            timeout=20,
        )
        assert register_res.status_code == 200
        register_data = register_res.json()
        assert "Registro" in register_data["message"]

    def test_delegate_login_and_profile(self, api_client, test_context):
        login_res = api_client.post(
            f"{API_BASE}/auth/login-delegate",
            json={
                "document_id": test_context["document_id"],
                "password": test_context["delegate_password"],
            },
            timeout=20,
        )
        assert login_res.status_code == 200
        login_data = login_res.json()
        assert login_data["role"] == "delegate"
        assert isinstance(login_data.get("access_token"), str) and login_data["access_token"]
        test_context["delegate_token"] = login_data["access_token"]

        me_res = api_client.get(
            f"{API_BASE}/auth/me",
            headers={"Authorization": f"Bearer {test_context['delegate_token']}"},
            timeout=20,
        )
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["document_id"] == test_context["document_id"]

    def test_create_open_list_close_point_flow(self, api_client, test_context):
        create_res = api_client.post(
            f"{API_BASE}/admin/points",
            headers={"Authorization": f"Bearer {test_context['admin_token']}"},
            json={
                "title": "TEST Punto presupuesto 2026",
                "description": "TEST Aprobación del presupuesto anual",
                "order": test_context["point_order"],
            },
            timeout=20,
        )
        assert create_res.status_code == 200
        assert "Punto creado" in create_res.json()["message"]

        list_res = api_client.get(
            f"{API_BASE}/admin/points",
            headers={"Authorization": f"Bearer {test_context['admin_token']}"},
            timeout=20,
        )
        assert list_res.status_code == 200
        points = list_res.json()["points"]
        target = next((p for p in points if p.get("order") == test_context["point_order"]), None)
        assert target is not None
        assert target["title"] == "TEST Punto presupuesto 2026"
        test_context["point_id"] = target["id"]

        open_res = api_client.post(
            f"{API_BASE}/admin/points/{test_context['point_id']}/open",
            headers={"Authorization": f"Bearer {test_context['admin_token']}"},
            timeout=20,
        )
        assert open_res.status_code == 200
        assert "abierto" in open_res.json()["message"].lower()

    def test_delegate_active_point_and_single_vote_rule(self, api_client, test_context):
        active_res = api_client.get(
            f"{API_BASE}/voting/active-point",
            headers={"Authorization": f"Bearer {test_context['delegate_token']}"},
            timeout=20,
        )
        assert active_res.status_code == 200
        active_data = active_res.json()
        assert active_data["has_active_point"] is True
        assert active_data["point"]["id"] == test_context["point_id"]

        vote_res = api_client.post(
            f"{API_BASE}/voting/vote",
            headers={"Authorization": f"Bearer {test_context['delegate_token']}"},
            json={"point_id": test_context["point_id"], "choice": "aprobado"},
            timeout=20,
        )
        assert vote_res.status_code == 200
        assert "Voto registrado" in vote_res.json()["message"]

        duplicate_vote_res = api_client.post(
            f"{API_BASE}/voting/vote",
            headers={"Authorization": f"Bearer {test_context['delegate_token']}"},
            json={"point_id": test_context["point_id"], "choice": "no_aprobado"},
            timeout=20,
        )
        assert duplicate_vote_res.status_code == 409
        assert "Ya votó" in duplicate_vote_res.json()["detail"]

    def test_live_and_public_results(self, api_client, test_context):
        live_res = api_client.get(f"{API_BASE}/live/state", timeout=20)
        assert live_res.status_code == 200
        live_data = live_res.json()
        assert isinstance(live_data.get("all_points"), list)
        assert "choice_labels" in live_data

        public_res = api_client.get(f"{API_BASE}/voting/results/public", timeout=20)
        assert public_res.status_code == 200
        public_data = public_res.json()
        assert isinstance(public_data.get("points"), list)
        target = next((p for p in public_data["points"] if p.get("id") == test_context["point_id"]), None)
        assert target is not None
        assert target["results"]["aprobado"] >= 1

    def test_directiva_results_and_close_point(self, api_client, test_context):
        directiva_res = api_client.get(
            f"{API_BASE}/voting/results/directiva?point_id={test_context['point_id']}",
            headers={"Authorization": f"Bearer {test_context['admin_token']}"},
            timeout=20,
        )
        assert directiva_res.status_code == 200
        directiva_data = directiva_res.json()
        assert directiva_data["has_data"] is True
        assert directiva_data["point"]["id"] == test_context["point_id"]
        assert isinstance(directiva_data.get("votes"), list) and len(directiva_data["votes"]) >= 1
        assert "delegate_name" in directiva_data["votes"][0]

        close_res = api_client.post(
            f"{API_BASE}/admin/points/{test_context['point_id']}/close",
            headers={"Authorization": f"Bearer {test_context['admin_token']}"},
            timeout=20,
        )
        assert close_res.status_code == 200
        assert "cerrado" in close_res.json()["message"].lower()
