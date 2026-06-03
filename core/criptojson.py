"""v1.48 A3a-003 — wrapper de leitura/escrita JSON com cripto-at-rest opcional.

Quando `LEMMON_ENCRYPT_KEY` está setada, JSONs sensíveis (brand_kit, usuarios,
prompts treinados, planilhas financeiras) são serializados, cifrados com Fernet
e gravados em disco. Leitura faz o caminho inverso.

Sem chave: degrada gracefully pra texto plano (compatibilidade dev). Aviso
visual fica por conta de quem chama (usar `cripto_disponivel()`).

Formato cifrado:
    primeira linha: "ENC:" + token Fernet base64 do JSON serializado

Formato plano:
    JSON normal (sem prefixo ENC:)

Migração: ler sempre tenta decifrar; se não vier prefixado ENC:, lê como JSON
plano. Próxima escrita re-cifra (upgrade automático quando chave entra em prod).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .tenant import cifrar_texto, cripto_disponivel, decifrar_texto


def escrever_json_cifrado(path: Path, dados: Any) -> None:
    """Serializa dados, cifra se possível, grava em path.

    Cria diretório pai se não existir. Atômico via temp file + replace.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    json_str = json.dumps(dados, ensure_ascii=False, indent=2)
    # cifrar_texto retorna "ENC:..." se cripto disponível, senão plaintext
    conteudo = cifrar_texto(json_str)

    # Escrita atômica
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(conteudo, encoding="utf-8")
    import os as _os
    _os.replace(tmp, path)


def ler_json_cifrado(path: Path, default: Any = None) -> Any:
    """Lê path, decifra se for cifrado (prefixo ENC:), retorna estrutura JSON.

    Args:
        path: arquivo a ler
        default: retornado se arquivo não existir

    Compatibilidade backward: JSONs antigos plaintext continuam legíveis.
    """
    if not path.exists():
        return default
    try:
        conteudo = path.read_text(encoding="utf-8")
        # Se vier cifrado, decifra; senão (sem prefixo ENC:) retorna o texto inalterado
        decifrado = decifrar_texto(conteudo)
        return json.loads(decifrado)
    except Exception:
        return default
