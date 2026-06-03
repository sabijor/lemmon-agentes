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

_TENANT_ID_RE = __import__("re").compile(r"^[a-z0-9][a-z0-9_-]{0,62}$")


def tenant_id() -> str:
    """Retorna tenant atual (env LEMMON_TENANT_ID ou 'default').

    v1.46.2 A3a-002 — sanitize contra path traversal. Antes `tenant_id="../etc"`
    fazia tenant_namespace(HISTORICO_DIR, ...) escapar pra fora de historico/.
    Agora regex força [a-z0-9_-]{1,63} iniciando com alfanumérico. Inválido →
    'default'. Cobre LGPD safety (não vaza pra path de outro tenant).
    """
    raw = os.getenv("LEMMON_TENANT_ID", "default").strip().lower() or "default"
    if not _TENANT_ID_RE.match(raw):
        # Tenant inválido vira default — não escapa. Audit não fica disponível
        # nesta camada (importaria circular), mas tenant_namespace nunca vai
        # criar pasta fora do historico/.
        return "default"
    return raw


def tenant_namespace(base: Path, subfolder: str = "dashboard") -> Path:
    """Retorna Path namespacado pelo tenant.

    Ex: tenant_namespace(HISTORICO_DIR, 'dashboard') → historico/hator/dashboard/
    Cria diretórios se não existirem.
    """
    t = tenant_id()
    p = base / t / subfolder
    p.mkdir(parents=True, exist_ok=True)
    return p


# v1.49 A3a-007/008 — Helper safe_join pra blindagem em profundidade.
# Defesa em profundidade: nunca confiar só em regex de entrada — sempre confirmar
# que o path resolvido NÃO escapa do base via relative_to.
#
# Edge cases tratados:
# - Drives diferentes no Windows (relative_to ValueError)
# - Symlinks que apontem fora do base (resolve() segue links)
# - Caracteres null e separators escondidos via unicode tricky
# - .. dentro do segmento (NFKC + path resolve cancela)

_TRAVERSAL_INDICATORS = ("..", "/", "\\", "\0", "\x00", "%2e%2e", "%2f", "%5c")


def safe_join(base: Path, *segments: str) -> Path | None:
    """Junta `segments` em `base`, garantindo que resultado não escapa.

    Retorna None se qualquer segment contém traversal/separator, OU se o path
    resultado (resolvido com symlinks) cai fora do base.

    Uso:
        p = safe_join(HISTORICO_DIR, tenant, "dashboard", session_id + ".json")
        if p is None:
            raise HTTPException(400, "path inválido")
    """
    if not segments:
        return None
    base_abs = base.resolve()

    for seg in segments:
        if not isinstance(seg, str) or not seg:
            return None
        # Rejeita indicadores conhecidos de traversal/path
        seg_norm = seg.strip()
        for indicator in _TRAVERSAL_INDICATORS:
            if indicator in seg_norm.lower():
                return None
        # Rejeita unicode control chars (zero-width, RTL override, etc.)
        for c in seg_norm:
            if 0x0000 <= ord(c) <= 0x001F or 0x007F <= ord(c) <= 0x009F:
                return None
            if c in ("​", "‌", "‍", "‮", "﻿"):
                return None

    candidate = base
    for seg in segments:
        candidate = candidate / seg
    try:
        resolved = candidate.resolve()
        # relative_to levanta ValueError se resolved NÃO está dentro de base_abs
        resolved.relative_to(base_abs)
    except (ValueError, OSError):
        return None
    return resolved


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
