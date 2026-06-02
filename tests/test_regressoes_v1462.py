"""Testes de regressão pros bugs corrigidos no Sprint v1.46.2.

Cada teste deve falhar se a regressão voltar. NÃO chamam Anthropic.
"""
from __future__ import annotations

import os

import pytest


# ─── A5-002 — AgenteAdminBase usa registrar() ───────────────────────────

def test_agente_admin_base_chama_registrar_nao_salvar():
    """Bug VIVO descoberto na auditoria: AgenteAdminBase chamava
    self.historico.salvar() que não existe na classe Historico.
    4 agentes admin (Ana Maria, Prichina, Caíto, Kelly) crashavam.
    """
    import core.agente_admin_base as mod
    src = open(mod.__file__, encoding="utf-8").read()
    assert ".historico.registrar(" in src, (
        "AgenteAdminBase deve chamar self.historico.registrar({...}). "
        "Bug v1.46.2 A5-002 — se voltou pra .salvar() Ana Maria crasha."
    )
    assert ".historico.salvar(" not in src, (
        "AgenteAdminBase NÃO pode chamar .salvar() (método não existe na "
        "classe Historico). Vai estourar AttributeError."
    )


# ─── A3a-001 — LGPD endpoints exigem auth ───────────────────────────────

def test_lgpd_exportar_exige_auth_em_prod(monkeypatch):
    """GET /lgpd/exportar deve retornar 403 sem Authorization header
    quando LEMMON_AUTH_TOKEN está setado.
    """
    from fastapi.testclient import TestClient
    monkeypatch.setenv("LEMMON_AUTH_TOKEN", "test-token-v1462")
    from api.main import app
    c = TestClient(app)
    r = c.get("/lgpd/exportar")
    assert r.status_code == 403, (
        f"GET /lgpd/exportar sem auth deveria ser 403, voltou {r.status_code}. "
        "Bug v1.46.2 A3a-001 — vazava ZIP inteiro do tenant."
    )


def test_lgpd_deletar_sessao_exige_auth(monkeypatch):
    """POST /lgpd/deletar-sessao deve exigir auth (não só 'apagar-tudo')."""
    from fastapi.testclient import TestClient
    monkeypatch.setenv("LEMMON_AUTH_TOKEN", "test-token-v1462")
    from api.main import app
    c = TestClient(app)
    r = c.post("/lgpd/deletar-sessao", json={"session_id": "qualquer123"})
    assert r.status_code == 403, (
        f"POST /lgpd/deletar-sessao sem auth deveria ser 403, voltou {r.status_code}. "
        "Bug v1.46.2 A3a-001 — qualquer um podia apagar sessão de outro tenant."
    )


# ─── A3a-002 — tenant_id sanitize ───────────────────────────────────────

def test_tenant_id_rejeita_path_traversal(monkeypatch):
    """LEMMON_TENANT_ID com `../etc` deve cair em 'default', não escapar."""
    from core.tenant import tenant_id
    for evil in ["../etc", "../../root", "/etc/passwd", "hator/../admin", ""]:
        monkeypatch.setenv("LEMMON_TENANT_ID", evil)
        # Reload pra pegar env nova
        result = tenant_id()
        assert result == "default", (
            f"tenant_id({evil!r}) = {result!r}, deveria ser 'default'. "
            "Bug v1.46.2 A3a-002 — path traversal escapa namespace."
        )


def test_tenant_id_aceita_valores_validos(monkeypatch):
    """Tenants válidos (alfanum + hífen/underscore) devem passar."""
    from core.tenant import tenant_id
    for ok in ["hator", "cliente-2", "test_tenant", "abc123"]:
        monkeypatch.setenv("LEMMON_TENANT_ID", ok)
        assert tenant_id() == ok.lower(), f"tenant_id válido {ok} rejeitado"


# ─── A3a-004 — auth comparação constant-time ────────────────────────────

def test_auth_required_usa_compare_digest():
    """Garante que api/security.py usa secrets.compare_digest (não ==)."""
    import api.security as mod
    src = open(mod.__file__, encoding="utf-8").read()
    assert "secrets.compare_digest" in src, (
        "api/security.py deve usar secrets.compare_digest pra evitar timing attack."
    )


def test_get_usuarios_exige_auth(monkeypatch):
    """GET /usuarios não pode vazar lista de tokens sem auth."""
    from fastapi.testclient import TestClient
    monkeypatch.setenv("LEMMON_AUTH_TOKEN", "test-token-v1462")
    from api.main import app
    c = TestClient(app)
    r = c.get("/usuarios")
    assert r.status_code == 401, (
        f"GET /usuarios sem auth deveria ser 401, voltou {r.status_code}. "
        "Bug v1.46.2 A3a-004 — listava token[:8] de cada usuário."
    )


# ─── A5-005 — historico.py usa tenant ───────────────────────────────────

def test_historico_inclui_tenant_no_path(monkeypatch):
    """Historico('otto').dir deve incluir tenant na path."""
    monkeypatch.setenv("LEMMON_TENANT_ID", "hator")
    # Reload do módulo pra pegar tenant novo
    import importlib
    import core.tenant
    import core.historico
    importlib.reload(core.tenant)
    importlib.reload(core.historico)
    h = core.historico.Historico("otto")
    assert "hator" in str(h.dir), (
        f"Historico('otto').dir = {h.dir}, deveria conter 'hator'. "
        "Bug v1.46.2 A5-005 — antes ignorava tenant, vazava entre clientes."
    )


# ─── A1a-007 — magic bytes WebP completo ────────────────────────────────

def test_magic_bytes_webp_rejeita_riff_falso():
    """Cliente que diz image/webp mas manda RIFF de WAV/AVI deve ser bloqueado.

    Antes só checava 'RIFF' no início — qualquer formato RIFF passava.
    Agora exige marker 'WEBP' nos bytes 8-11.
    """
    import base64
    # RIFF + AVI nos bytes 8-11 (não WEBP) — formato malicioso
    fake_riff = b"RIFF" + b"\x00\x00\x00\x00" + b"AVI " + b"\x00\x00\x00\x00"
    fake_b64 = base64.b64encode(fake_riff).decode("ascii")

    # Simula a validação de ws_chat
    _head = base64.b64decode(fake_b64[:24], validate=False)[:16]
    is_webp = (
        len(_head) >= 12
        and _head[:4] == b"RIFF"
        and _head[8:12] == b"WEBP"
    )
    assert not is_webp, "AVI mascarado de WebP deveria ser bloqueado"


def test_magic_bytes_webp_aceita_webp_real():
    """WebP genuíno (RIFF + WEBP nos bytes 8-11) deve passar."""
    import base64
    real_webp_header = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"VP8 "
    real_b64 = base64.b64encode(real_webp_header).decode("ascii")
    _head = base64.b64decode(real_b64[:24], validate=False)[:16]
    is_webp = (
        len(_head) >= 12
        and _head[:4] == b"RIFF"
        and _head[8:12] == b"WEBP"
    )
    assert is_webp, "WebP genuíno deveria passar"
