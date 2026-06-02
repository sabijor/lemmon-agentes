"""PROD-2 — Calibragem que TREINA o prompt do Pedro Espelho.

Diferente da rota `/calibragem_pedro` original (que só REGISTRA divergência),
esta consolida correções acumuladas e gera nova versão do system prompt
do Pedro Espelho — versionada (v2, v3...).

Pipeline:
1. Lê `calibragem_pedro.json` (registros do Pedro real corrigindo IA)
2. Filtra correções com nota_acerto <= 3 (IA errou)
3. Manda pra Haiku consolidar como "regra adicional do system prompt"
4. Grava `prompts/pedro_abrahao_system_v{N+1}.md` e atualiza a classe Pedro

Pra rodar: POST /pedro/treinar — exige LEMMON_AUTH_TOKEN em prod.
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

import anthropic
from fastapi import APIRouter, HTTPException

from api.deps import _anthropic_client, CALIBRAGEM_FILE
from core import audit
from core.agente_base import classificar_erro_anthropic, formatar_erro_anthropic

router = APIRouter()

PROMPTS_DIR = Path(__file__).parent.parent.parent / "prompts"


def _prompt_atual_path() -> Path:
    """Acha a versão mais alta de pedro_abrahao_system_v*.md."""
    versoes = sorted(PROMPTS_DIR.glob("pedro_abrahao_system_v*.md"))
    return versoes[-1] if versoes else PROMPTS_DIR / "pedro_abrahao_system_v1.md"


def _proxima_versao() -> int:
    """Próximo número de versão (v2, v3, ...)."""
    versoes = sorted(PROMPTS_DIR.glob("pedro_abrahao_system_v*.md"))
    if not versoes:
        return 2
    import re
    nums = [int(m.group(1)) for f in versoes if (m := re.match(r"pedro_abrahao_system_v(\d+)\.md", f.name))]
    return max(nums) + 1 if nums else 2


@router.post("/pedro/treinar")
async def treinar_pedro_espelho():
    """Consolida correções de calibragem + gera nova versão do prompt.

    Requer LEMMON_AUTH_TOKEN em produção (não permite chamada anônima).
    """
    if not os.getenv("LEMMON_AUTH_TOKEN") and os.getenv("LEMMON_ALLOW_TRAIN_DEV") != "1":
        raise HTTPException(
            status_code=403,
            detail="Treino exige produção ou LEMMON_ALLOW_TRAIN_DEV=1.",
        )

    # 1. Lê registros de calibragem
    if not CALIBRAGEM_FILE.exists():
        raise HTTPException(status_code=404, detail="Nenhum registro de calibragem ainda.")
    try:
        registros = json.loads(CALIBRAGEM_FILE.read_text(encoding="utf-8"))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Arquivo de calibragem corrompido.") from e

    if not isinstance(registros, list) or not registros:
        raise HTTPException(status_code=400, detail="Sem registros pra treinar.")

    # 2. Filtra correções com nota baixa (≤ 3 = IA errou)
    correcoes_relevantes = [r for r in registros if (r.get("nota_acerto", 5) or 5) <= 3]
    if not correcoes_relevantes:
        return {
            "ok": False,
            "motivo": "Nenhuma correção com nota ≤ 3. IA tá indo bem!",
            "total_registros": len(registros),
        }

    # 3. Lê prompt atual
    prompt_atual_path = _prompt_atual_path()
    if not prompt_atual_path.exists():
        raise HTTPException(status_code=500, detail="Prompt base do Pedro não encontrado.")
    prompt_atual = prompt_atual_path.read_text(encoding="utf-8")

    # 4. Pede pro Haiku consolidar correções em "regras adicionais"
    correcoes_texto = "\n\n".join([
        f"- ELEMENTO: {r.get('elemento','?')}\n"
        f"  IA disse: \"{r.get('predicao_ia','')[:200]}\"\n"
        f"  Real disse: \"{r.get('feedback_real','')[:200]}\"\n"
        f"  Nota: {r.get('nota_acerto', '?')}/5"
        for r in correcoes_relevantes[-20:]  # últimas 20 correções
    ])

    system = """Você é editor de prompts. Vai receber:
1. O system prompt atual do "Pedro Espelho IA" (calibrado pra imitar Dr. Pedro Abrahão)
2. Uma lista de correções (Pedro real disse "não foi assim, na verdade era X")

Sua tarefa: PRESERVAR o prompt original 100% E ADICIONAR uma seção nova ao final:

## 📋 Aprendizados de calibragem (versão Y)

Liste em bullets os padrões observados:
- "Quando falar sobre X, prefira frase Y em vez de Z"
- "Recuse afirmar A — Pedro real diria B"
- etc.

Use ESTRITAMENTE as correções fornecidas. Não invente.
Saída: O prompt completo (preservado) + a nova seção. Markdown puro.
"""

    try:
        resp = _anthropic_client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=4096,
            system=system,
            messages=[{
                "role": "user",
                "content": f"# Prompt atual\n\n{prompt_atual}\n\n---\n\n# Correções acumuladas ({len(correcoes_relevantes)} registros)\n\n{correcoes_texto}",
            }],
        )
        novo_prompt = next((b.text for b in resp.content if hasattr(b, "text")), "")
    except (anthropic.APIError, anthropic.APIStatusError) as e:
        raise HTTPException(
            status_code=502,
            detail=formatar_erro_anthropic(e),
        ) from e

    if not novo_prompt or len(novo_prompt) < len(prompt_atual) * 0.8:
        raise HTTPException(status_code=502, detail="Resposta do Haiku muito curta (possível erro).")

    # 5. Grava nova versão
    nova_versao = _proxima_versao()
    novo_path = PROMPTS_DIR / f"pedro_abrahao_system_v{nova_versao}.md"
    novo_path.write_text(novo_prompt, encoding="utf-8")

    audit.registrar(
        "pedro_espelho_trained",
        nova_versao=nova_versao,
        correcoes_aplicadas=len(correcoes_relevantes),
    )

    return {
        "ok": True,
        "nova_versao": nova_versao,
        "arquivo": str(novo_path.relative_to(PROMPTS_DIR.parent)),
        "correcoes_aplicadas": len(correcoes_relevantes),
        "total_registros": len(registros),
        "proximo_passo": f"Atualize agentes/pedro_abrahao.py: `versao_prompt = 'v{nova_versao}'`",
    }


@router.get("/pedro/versoes")
async def listar_versoes_prompt():
    """Lista todas as versões do prompt do Pedro Espelho."""
    versoes = sorted(PROMPTS_DIR.glob("pedro_abrahao_system_v*.md"))
    return [
        {
            "versao": f.stem.replace("pedro_abrahao_system_", ""),
            "tamanho_chars": f.stat().st_size,
            "modificado_em": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
        }
        for f in versoes
    ]
