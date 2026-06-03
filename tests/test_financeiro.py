"""Testes do módulo financeiro (PROD-FIN v1.47 — Ana Maria + planilha XLSX)."""
from __future__ import annotations

import io
import json
from pathlib import Path

import pytest


@pytest.fixture
def xlsx_basico() -> bytes:
    """XLSX simples com 4 transações de clínica."""
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "movimento"
    ws.append(["Data", "Paciente", "Procedimento", "Valor", "Forma Pgto"])
    ws.append(["2026-06-01", "Maria S.", "Botox", 800.0, "PIX"])
    ws.append(["2026-06-02", "Ana P.", "Preenchimento labial", 1200.0, "Cartão"])
    ws.append(["2026-06-03", "Júlia L.", "Botox", 800.0, "Boleto"])
    ws.append(["2026-06-04", "Carla M.", "Limpeza de pele", 200.0, "PIX"])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.fixture
def cliente(monkeypatch, tmp_path):
    """TestClient + tenant temporário pra isolamento."""
    import uuid
    monkeypatch.setenv("LEMMON_TENANT_ID", f"test{uuid.uuid4().hex[:6]}")
    monkeypatch.setenv("LEMMON_RATE_LIMIT_PER_MIN", "5000")
    # Aponta HISTORICO_DIR pra tmp_path pra não poluir disco real
    from fastapi.testclient import TestClient
    import api.deps as deps
    monkeypatch.setattr(deps, "HISTORICO_DIR", tmp_path / "historico")
    import api.routes.financeiro as fin_mod
    monkeypatch.setattr(fin_mod, "HISTORICO_DIR", tmp_path / "historico")
    from api.main import app
    return TestClient(app)


# ─── PROD-FIN-1: Upload XLSX ────────────────────────────────────────────

def test_upload_xlsx_valido(cliente, xlsx_basico):
    """POST /financeiro/upload aceita XLSX válido e retorna resumo."""
    r = cliente.post(
        "/financeiro/upload",
        files={"arquivo": ("clinica_junho.xlsx", xlsx_basico, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert "file_id" in data
    assert data["resumo"]["formato"] == "xlsx"
    assert data["resumo"]["total_linhas"] == 4
    # Detecção de colunas-chave
    cand = data["resumo"]["candidatos_colunas"]
    assert "Valor" in cand.get("valor", [])
    assert "Paciente" in cand.get("paciente", [])


def test_upload_csv_valido(cliente):
    """POST /financeiro/upload aceita CSV válido."""
    csv_content = (
        "data,paciente,procedimento,valor\n"
        "2026-06-01,Maria,Botox,800\n"
        "2026-06-02,Ana,Preenchimento,1200\n"
    ).encode("utf-8")
    r = cliente.post(
        "/financeiro/upload",
        files={"arquivo": ("clinica.csv", csv_content, "text/csv")},
    )
    assert r.status_code == 200, r.text
    assert r.json()["resumo"]["formato"] == "csv"
    assert r.json()["resumo"]["total_linhas"] == 2


# ─── PROD-FIN-2: Defesas ────────────────────────────────────────────────

def test_upload_rejeita_executavel_disfarcado_de_xlsx(cliente):
    """Arquivo binário que NÃO é zip (XLSX) deve ser rejeitado por magic bytes."""
    fake_xlsx = b"MZ\x90\x00" + b"\x00" * 1000  # PE header (Windows EXE)
    r = cliente.post(
        "/financeiro/upload",
        files={"arquivo": ("malware.xlsx", fake_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert r.status_code == 400
    assert "magic bytes" in r.json()["detail"].lower() or "xlsx" in r.json()["detail"].lower()


def test_upload_csv_injection_neutralizado(cliente):
    """CSV com =cmd|/c calc deve ser sanitizado (prefixo com aspas simples)."""
    malicious_csv = (
        "data,nome,obs\n"
        "2026-06-01,=cmd|/c calc,teste\n"
        "2026-06-02,Maria,@SUM(1+2)\n"
        "2026-06-03,+1+1,normal\n"
    ).encode("utf-8")
    r = cliente.post(
        "/financeiro/upload",
        files={"arquivo": ("evil.csv", malicious_csv, "text/csv")},
    )
    assert r.status_code == 200
    # Confere que valores perigosos viram strings com prefixo "'"
    amostra = r.json()["resumo"]["amostra"]
    valores_nome = [linha.get("nome", "") for linha in amostra]
    # = / @ / + devem virar começando com aspas simples
    for v in valores_nome:
        if v and v[0] in ("=", "@", "+", "-", "|", "%"):
            pytest.fail(f"CSV injection NÃO foi sanitizado: {v!r}")


def test_upload_arquivo_grande_demais(cliente):
    """Arquivo > 50MB deve ser rejeitado."""
    # Gera 51MB de dados (pesado mas necessário pro teste)
    big_content = b"PK\x03\x04" + (b"X" * (51 * 1024 * 1024 - 4))
    r = cliente.post(
        "/financeiro/upload",
        files={"arquivo": ("huge.xlsx", big_content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    # Pode dar 400 (validação) ou 413 (FastAPI body limit) — ambos OK
    assert r.status_code in (400, 413), f"Esperava 400/413, deu {r.status_code}"


# ─── PROD-FIN-3: Listagem + resumo ──────────────────────────────────────

def test_listar_planilhas_vazio(cliente):
    """GET /financeiro/listar com tenant novo retorna lista vazia."""
    r = cliente.get("/financeiro/listar")
    assert r.status_code == 200
    assert r.json() == {"total": 0, "planilhas": []}


def test_upload_e_listar(cliente, xlsx_basico):
    """Após upload, /financeiro/listar retorna a planilha com metadados."""
    cliente.post(
        "/financeiro/upload",
        files={"arquivo": ("hator_jun.xlsx", xlsx_basico, "")},
    )
    r = cliente.get("/financeiro/listar")
    data = r.json()
    assert data["total"] == 1
    p = data["planilhas"][0]
    assert p["filename_original"] == "hator_jun.xlsx"
    assert p["total_linhas"] == 4
    assert "Valor" in p["colunas"]


def test_resumo_planilha_recupera_dados(cliente, xlsx_basico):
    """GET /financeiro/{file_id}/resumo re-lê planilha salva."""
    up = cliente.post(
        "/financeiro/upload",
        files={"arquivo": ("teste.xlsx", xlsx_basico, "")},
    )
    file_id = up.json()["file_id"]
    r = cliente.get(f"/financeiro/{file_id}/resumo")
    assert r.status_code == 200
    data = r.json()
    assert data["meta"]["filename_original"] == "teste.xlsx"
    assert data["resumo"]["total_linhas"] == 4


def test_resumo_file_id_invalido_rejeita(cliente):
    """file_id com chars perigosos rejeitado."""
    for evil in ["../etc", "ab/cd", "ab cd", "with;semi"]:
        r = cliente.get(f"/financeiro/{evil}/resumo")
        assert r.status_code in (400, 404), f"file_id {evil!r} deveria ser rejeitado"


def test_resumo_inexistente_404(cliente):
    """file_id válido mas inexistente → 404."""
    r = cliente.get("/financeiro/20260101_120000_inexistente/resumo")
    assert r.status_code == 404
