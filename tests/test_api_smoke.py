"""
Smoke test para a API FastAPI do sistema Lemmon.

Verifica que GET /historico retorna 200 com uma lista.
"""
import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("ANTHROPIC_API_KEY", "sk-test-fake-key-for-testing")


@pytest.fixture(scope="module")
def client():
    """Cliente de teste do FastAPI (síncrono)."""
    from api.main import app
    with TestClient(app) as c:
        yield c


def test_historico_endpoint(client):
    """GET /historico deve retornar 200 com uma lista."""
    response = client.get("/historico")
    assert response.status_code == 200, (
        f"Esperado 200, recebido {response.status_code}. "
        f"Body: {response.text[:300]}"
    )
    data = response.json()
    assert isinstance(data, list), f"Esperado lista, recebido: {type(data)}"
