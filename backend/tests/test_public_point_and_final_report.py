import uuid

import pytest
import requests
from dotenv import dotenv_values


# Module coverage: public per-point results endpoint + admin final report data endpoint + vote label regression
FRONTEND_ENV = dotenv_values("/app/frontend/.env")
BASE_URL = FRONTEND_ENV.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    raise RuntimeError("Missing REACT_APP_BACKEND_URL in /app/frontend/.env")

API_BASE = f"{str(BASE_URL).rstrip('/')}/api"
EXPECTED_LABELS = {
    "aprobado": "1. Aprobado",
    "no_aprobado": "2. No aprobado",
    "abstencion": "3. Abstención",
    "en_blanco": "4. Voto en blanco",
}


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
        pytest.skip("Admin login failed with known credentials; cannot test admin report endpoints")

    data = response.json()
    token = data.get("access_token")
    assert isinstance(token, str) and token
    assert data.get("role") == "admin"
    return token


@pytest.fixture(scope="session")
def target_point(api_client, admin_token):
    list_res = api_client.get(
        f"{API_BASE}/admin/points",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=20,
    )
    assert list_res.status_code == 200
    points = list_res.json().get("points", [])

    if points:
        point = points[0]
        assert isinstance(point.get("id"), str) and point["id"]
        return point

    free_order = 1
    suffix = uuid.uuid4().hex[:6]
    create_res = api_client.post(
        f"{API_BASE}/admin/points",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "title": f"TEST Punto reporte {suffix}",
            "description": "Punto generado para pruebas de reporte final",
            "order": free_order,
        },
        timeout=20,
    )
    if create_res.status_code != 200:
        pytest.skip("Unable to create fallback point for public result endpoint tests")

    verify_res = api_client.get(
        f"{API_BASE}/admin/points",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=20,
    )
    assert verify_res.status_code == 200
    created = next((p for p in verify_res.json().get("points", []) if p.get("order") == free_order), None)
    assert created is not None
    return created


class TestPublicPointAndFinalReport:
    def test_public_result_by_point_success(self, api_client, target_point):
        response = api_client.get(f"{API_BASE}/voting/results/public/{target_point['id']}", timeout=20)
        assert response.status_code == 200

        data = response.json()
        assert data["point"]["id"] == target_point["id"]
        assert data["choice_labels"] == EXPECTED_LABELS
        assert isinstance(data.get("results"), dict)
        assert isinstance(data["results"].get("total_votes"), int)

    def test_public_result_by_point_not_found(self, api_client):
        response = api_client.get(f"{API_BASE}/voting/results/public/not-a-real-point", timeout=20)
        assert response.status_code == 404
        data = response.json()
        assert "no encontrado" in data.get("detail", "").lower()

    def test_final_report_requires_admin_auth(self, api_client):
        response = api_client.get(f"{API_BASE}/admin/reports/final-data", timeout=20)
        assert response.status_code == 401
        data = response.json()
        assert "token" in data.get("detail", "").lower()

    def test_final_report_data_schema_and_labels(self, api_client, admin_token):
        response = api_client.get(
            f"{API_BASE}/admin/reports/final-data",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30,
        )
        assert response.status_code == 200

        data = response.json()
        assert data["assembly_name"] == "Asamblea Delegados SES"
        assert data["choice_labels"] == EXPECTED_LABELS
        assert isinstance(data.get("points"), list)
        assert isinstance(data.get("global_totals"), dict)
        assert isinstance(data.get("stats"), dict)

        if data["points"]:
            first = data["points"][0]
            assert isinstance(first.get("id"), str)
            assert isinstance(first.get("results"), dict)
            assert isinstance(first.get("votes"), list)