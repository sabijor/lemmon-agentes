"""Multi-tenant namespace + cripto-at-rest simplificada.

V-02 + V-05 — primeiro passo pra B2B.

Como funciona:
- Env `LEMMON_TENANT_ID=hator` (default: "default") define namespace de tudo
- Histórico vai pra `historico/<tenant>/dashboard/` em vez de `historico/dashboard/`
- Outputs vão pra `outputs/<tenant>/` em vez de `outputs/`
- Cripto-at-rest opcional via `LEMMON_ENCRYPT_KEY` (32 bytes base64 — Fernet)
  Aplicada nos campos `briefing` e `respostas` antes de gravar JSON

Sem dependência nova: usa cryptography (já em requirements via anthropic ou similar)
ou fallback degrade (não cifra, loga warning).
"""
from __future__ import annotations

import base64
import os
from pathlib import Path

# ─── Tenant ──────────────────────────────────────────────────────────

def tenant_id() -> str:
    """Retorna tenant atual (env LEMMON_TENANT_ID ou 'default')."""
    return os.getenv("LEMMON_TENANT_ID", "default").strip().lower() or "default"


def tenant_namespace(base: Path, subfolder: str = "dashboard") -> Path:
    """Retorna Path namespacado pelo tenant.

    Ex: tenant_namespace(HISTORICO_DIR, 'dashboard') → historico/hator/dashboard/
    Cria diretórios se não existirem.
    """
    t = tenant_id()
    p = base / t / subfolder
    p.mkdir(parents=True, exist_ok=True)
    return p


# ─── Cripto-at-rest (LGPD G-01) ──────────────────────────────────────

_encrypt_key_cache: bytes | None = None
_encrypt_available: bool | None = None


def _get_fernet():
    """Lazy import + cache do Fernet."""
    global _encrypt_key_cache, _encrypt_available
    if _encrypt_available is False:
        return None
    try:
        from cryptography.fernet import Fernet  # noqa: PLC0415
        key_b64 = os.getenv("LEMMON_ENCRYPT_KEY", "").strip()
        if not key_b64:
            _encrypt_available = False
            return None
        if _encrypt_key_cache is None:
            try:
                _encrypt_key_cache = key_b64.encode("ascii")
                # Valida formato
                Fernet(_encrypt_key_cache)
            except Exception:
                _encrypt_available = False
                _encrypt_key_cache = None
                return None
        _encrypt_available = True
        return Fernet(_encrypt_key_cache)
    except ImportError:
        _encrypt_available = False
        return None


def cripto_disponivel() -> bool:
    """True se LEMMON_ENCRYPT_KEY setada e cryptography instalado."""
    return _get_fernet() is not None


def cifrar_texto(plaintext: str) -> str:
    """Cifra texto. Se cripto indisponível, retorna plaintext (degrade)."""
    f = _get_fernet()
    if f is None or not plaintext:
        return plaintext
    try:
        return "ENC:" + f.encrypt(plaintext.encode("utf-8")).decode("ascii")
    except Exception:
        return plaintext


def decifrar_texto(value: str) -> str:
    """Decifra texto. Se não tem prefixo ENC: retorna como está."""
    if not value or not isinstance(value, str):
        return value
    if not value.startswith("ENC:"):
        return value
    f = _get_fernet()
    if f is None:
        return value  # cripto sumiu — retorna ciphertext (mas dev pode debugar)
    try:
        return f.decrypt(value[4:].encode("ascii")).decode("utf-8")
    except Exception:
        return value


def gerar_chave() -> str:
    """Gera uma chave Fernet nova (32 bytes base64). Útil pra setup inicial."""
    try:
        from cryptography.fernet import Fernet  # noqa: PLC0415
        return Fernet.generate_key().decode("ascii")
    except ImportError:
        # Fallback: gera 32 bytes via os.urandom
        return base64.urlsafe_b64encode(os.urandom(32)).decode("ascii")
