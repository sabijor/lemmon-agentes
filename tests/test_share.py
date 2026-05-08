"""Testes de integração para T107 — share links (POST /share e GET /share/{token}.json)."""
import json
import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("ANTHROPIC_API_KEY", "sk-test-fake-key-for-testing")


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """Cliente de teste com HISTORICO_DIR e SHARES_DIR apontando para tmp_path."""
    sessao_dir = tmp_path / "historico" / "dashboard"
    sessao_dir.mkdir(parents=True)
    shares_dir = tmp_path / "shares"
    shares_dir.mkdir()

    sessao_id = "20260508_120000_sessao"
    sessao_data = {
        "timestamp": "2026-05-08T12:00:00",
        "briefing": "Briefing de teste para share",
        "agentes_usados": ["otto"],
        "respostas": {"otto": "Resposta fake do Otto."},
        "custo_total_usd": 0.01,
        "favorito": False,
        "origem": "dashboard",
    }
    (sessao_dir / f"{sessao_id}.json").write_text(
        json.dumps(sessao_data, ensure_ascii=False), encoding="utf-8"
    )

    import api.deps as deps
    monkeypatch.setattr(deps, "HISTORICO_DIR", tmp_path / "historico")
    monkeypatch.setattr(deps, "SHARES_DIR", shares_dir)

    import api.routes.share as share_mod
    monkeypatch.setattr(share_mod, "HISTORICO_DIR", tmp_path / "historico")
    monkeypatch.setattr(share_mod, "SHARES_DIR", shares_dir)

    from api.main import app
    with TestClient(app) as c:
        c._sessao_id = sessao_id
        yield c


def test_gera_e_consome_token_imediatamente(client):
    """POST /share cria token; GET /share/{token}.json devolve os dados imediatamente."""
    resp = client.post("/share", json={"session_id": client._sessao_id})
    assert resp.status_code == 200, f"POST /share falhou: {resp.text}"
    token = resp.json()["token"]
    assert token, "Token não pode ser vazio"

    resp2 = client.get(f"/share/{token}.json")
    assert resp2.status_code == 200, f"GET /share/{token}.json falhou: {resp2.text}"
    data = resp2.json()
    assert data["token"] == token
    assert data["session_id"] == client._sessao_id
    assert data["briefing"] == "Briefing de teste para share"
    assert "otto" in data["agentes_usados"]


def test_token_inexistente_retorna_404(client):
    """GET /share/{token-inexistente}.json deve retornar 404."""
    resp = client.get("/share/token-que-nao-existe.json")
    assert resp.status_code == 404, f"Esperado 404, recebido {resp.status_code}"
