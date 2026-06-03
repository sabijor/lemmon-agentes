"""Testes do Sprint v1.51 — multi-tenant prod-ready.

Cobre:
- Share particionado por tenant (cross-tenant lookup → 404)
- Calibragem por tenant (não polui treino entre clientes)
"""
from __future__ import annotations

import importlib
import json

import pytest


# ─── Share por tenant ────────────────────────────────────────────────

def _setup_share_env(monkeypatch, tmp_path, tenant):
    """Helper: configura ambiente isolado pra testes de share."""
    monkeypatch.setenv("LEMMON_RATE_LIMIT_PER_MIN", "5000")
    monkeypatch.setenv("LEMMON_TENANT_ID", tenant)
    monkeypatch.delenv("LEMMON_AUTH_TOKEN", raising=False)
    shares_dir = tmp_path / "shares"
    shares_dir.mkdir(parents=True, exist_ok=True)
    # Reload PRIMEIRO pra capturar env nova
    import core.tenant, core.config, core.historico_index, api.deps
    importlib.reload(core.tenant)
    # core.config tem HISTORICO_DIR que é base de tudo
    monkeypatch.setattr("core.config.HISTORICO_DIR", tmp_path)
    monkeypatch.setattr("core.historico_index.HISTORICO_DIR", tmp_path)
    monkeypatch.setattr("api.deps.HISTORICO_DIR", tmp_path)
    monkeypatch.setattr("api.deps.SHARES_DIR", shares_dir)
    import api.routes.share
    importlib.reload(api.routes.share)
    monkeypatch.setattr(api.routes.share, "HISTORICO_DIR", tmp_path)
    monkeypatch.setattr(api.routes.share, "SHARES_DIR", shares_dir)
    return shares_dir


def test_share_grava_tenant_no_json(monkeypatch, tmp_path):
    """v1.51 — POST /share grava `tenant` no JSON do share."""
    from fastapi.testclient import TestClient
    shares_dir = _setup_share_env(monkeypatch, tmp_path, "tenant-a")

    # Cria sessão fake do tenant-a
    sessao_dir = tmp_path / "tenant-a" / "dashboard"
    sessao_dir.mkdir(parents=True)
    (sessao_dir / "ses1.json").write_text(json.dumps({
        "schema_version": 1,
        "briefing": "test",
        "agentes_usados": ["otto"],
        "respostas": {"otto": "blob"},
    }), encoding="utf-8")

    from api.main import app
    c = TestClient(app)
    r = c.post("/share", json={"session_id": "ses1"})
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    arquivo = shares_dir / f"{token}.json"
    assert arquivo.exists()
    dados = json.loads(arquivo.read_text())
    assert dados.get("tenant") == "tenant-a"


def test_share_lookup_cross_tenant_retorna_404(monkeypatch, tmp_path):
    """v1.51 — cliente do tenant B NÃO consegue ler share criado pelo tenant A."""
    from fastapi.testclient import TestClient
    shares_dir = _setup_share_env(monkeypatch, tmp_path, "tenant-b")
    fake_token = "abcdef123456"
    (shares_dir / f"{fake_token}.json").write_text(json.dumps({
        "token": fake_token,
        "tenant": "tenant-a",
        "session_id": "ses1",
        "briefing": "dados sensíveis",
        "agentes_usados": ["otto"],
        "respostas": {"otto": "segredo"},
    }), encoding="utf-8")
    from api.main import app
    c = TestClient(app)
    r = c.get(f"/share/{fake_token}.json")
    assert r.status_code == 404, f"tenant-b conseguiu ler share do tenant-a: {r.text}"


def test_share_lookup_mesmo_tenant_funciona(monkeypatch, tmp_path):
    """v1.51 — cliente do mesmo tenant que criou consegue ler."""
    from fastapi.testclient import TestClient
    shares_dir = _setup_share_env(monkeypatch, tmp_path, "tenant-x")
    fake_token = "xyz789abc"
    (shares_dir / f"{fake_token}.json").write_text(json.dumps({
        "token": fake_token,
        "tenant": "tenant-x",
        "session_id": "ses1",
        "briefing": "ok",
        "agentes_usados": [],
        "respostas": {},
    }), encoding="utf-8")
    from api.main import app
    c = TestClient(app)
    r = c.get(f"/share/{fake_token}.json")
    assert r.status_code == 200
    assert r.json()["briefing"] == "ok"


# ─── Calibragem por tenant ──────────────────────────────────────────

def test_calibragem_path_particiona_por_tenant(monkeypatch, tmp_path):
    """v1.51 — _calibragem_path() retorna historico/<tenant>/calibragem.json."""
    monkeypatch.setenv("LEMMON_TENANT_ID", "cliente-z")
    monkeypatch.setattr("api.routes.calibragem.HISTORICO_DIR", tmp_path)
    import core.tenant
    importlib.reload(core.tenant)
    import api.routes.calibragem as cal
    importlib.reload(cal)
    monkeypatch.setattr(cal, "HISTORICO_DIR", tmp_path)
    p = cal._calibragem_path()
    assert "cliente-z" in str(p)
    assert p.name == "calibragem.json"


def test_calibragem_post_grava_no_tenant(monkeypatch, tmp_path):
    """v1.51 — POST /calibragem_pedro grava no path do tenant atual."""
    from fastapi.testclient import TestClient
    monkeypatch.setenv("LEMMON_RATE_LIMIT_PER_MIN", "5000")
    monkeypatch.setenv("LEMMON_TENANT_ID", "tenantA")
    monkeypatch.delenv("LEMMON_AUTH_TOKEN", raising=False)
    monkeypatch.setattr("api.deps.HISTORICO_DIR", tmp_path)
    import core.tenant, api.deps, api.routes.calibragem
    importlib.reload(core.tenant)
    importlib.reload(api.deps)
    importlib.reload(api.routes.calibragem)
    monkeypatch.setattr(api.routes.calibragem, "HISTORICO_DIR", tmp_path)

    from api.main import app
    c = TestClient(app)
    r = c.post("/calibragem_pedro", json={
        "session_id": "test",
        "elemento": "voz",
        "predicao_ia": "X",
        "feedback_real": "Y",
        "nota_acerto": 3,
    })
    assert r.status_code == 200, r.text
    # Validate path foi criado no tenant correto
    arquivo = tmp_path / "tenantA" / "calibragem.json"
    assert arquivo.exists()
    dados = json.loads(arquivo.read_text())
    assert len(dados) == 1
    assert dados[0]["nota_acerto"] == 3
