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

import secrets

import anthropic
from fastapi import APIRouter, Header, HTTPException

from api.deps import _anthropic_client, CALIBRAGEM_FILE
from core import audit
from core.agente_base import classificar_erro_anthropic, formatar_erro_anthropic

router = APIRouter()

PROMPTS_DIR = Path(__file__).parent.parent.parent / "prompts"

# v1.48 A3a-006 — seções OBRIGATÓRIAS que o prompt resultado deve preservar.
# Se Haiku perde alguma (ex: omite "RECUSA responder" e o espelho vira complacente),
# rejeitamos o treino e mantemos a versão anterior.
SECOES_OBRIGATORIAS = (
    "QUEM É VOCÊ",
    "SUA VOZ",
    "SEU POSICIONAMENTO",
    "REGRAS DE RESPOSTA",
    "O QUE VOCÊ NUNCA FAZ",
    "REGRA DE OURO",
)


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


def _validar_prompt_resultado(novo: str, atual: str) -> tuple[bool, str]:
    """v1.48 A3a-006 — Garante que prompt resultado preserva seções obrigatórias.

    Retorna (ok, motivo).

    Critérios:
    1. Tamanho >= 80% do atual (já tinha)
    2. TODAS as seções de SECOES_OBRIGATORIAS continuam presentes
    3. Header H1 inicial preservado (cabeçalho de identidade)
    4. Não tem texto de meta-prompt vazando (ex: "Sua tarefa:", "Use ESTRITAMENTE")
    """
    if not novo:
        return False, "Resposta vazia"

    if len(novo) < len(atual) * 0.8:
        return False, (
            f"Resposta muito curta: {len(novo)} chars vs {len(atual)} no atual "
            "(< 80%) — Haiku provavelmente truncou ou ignorou conteúdo"
        )

    # Header H1 (identidade) preservado
    primeira_linha_atual = atual.strip().split("\n", 1)[0]
    if primeira_linha_atual.startswith("# ") and primeira_linha_atual not in novo:
        return False, (
            f"Header H1 de identidade ausente no resultado: '{primeira_linha_atual}' "
            "— espelho perdeu cabeçalho 'Você é o Dr. Pedro Abrahão'"
        )

    # Seções obrigatórias presentes
    for secao in SECOES_OBRIGATORIAS:
        if secao not in novo:
            return False, (
                f"Seção obrigatória '{secao}' ausente no resultado. "
                "Treino rejeitado — manteria versão anterior pra não perder regra crítica."
            )

    # Detecta vazamento do system prompt do editor (Haiku copiou as instruções dele)
    vazamentos = ("Sua tarefa:", "Use ESTRITAMENTE", "Markdown puro.", "Saída: O prompt completo")
    for v in vazamentos:
        if v in novo:
            return False, (
                f"Vazamento de meta-prompt detectado ('{v}') — Haiku confundiu "
                "instruções dele com conteúdo do prompt. Resultado descartado."
            )

    return True, "OK"


@router.post("/pedro/treinar")
async def treinar_pedro_espelho(authorization: str | None = Header(default=None)):
    """Consolida correções de calibragem + gera nova versão do prompt.

    Requer Authorization: Bearer <LEMMON_AUTH_TOKEN>.
    Em dev: LEMMON_ALLOW_TRAIN_DEV=1 dispensa o token.
    """
    # v1.48 A3a-006 — bypass dev SÓ funciona quando LEMMON_ENV=dev.
    # Antes: LEMMON_ALLOW_TRAIN_DEV=1 dispensava token em qualquer ambiente
    # (perigoso se acidentalmente setado em prod). Agora exige env=dev também.
    env_atual = os.getenv("LEMMON_ENV", "").lower()
    permitir_dev = (
        os.getenv("LEMMON_ALLOW_TRAIN_DEV") == "1"
        and env_atual in ("dev", "development", "local")
    )
    esperado = os.getenv("LEMMON_AUTH_TOKEN", "")

    if not permitir_dev:
        if not esperado:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Treino exige LEMMON_AUTH_TOKEN configurada. "
                    "Em dev, defina também LEMMON_ENV=dev + LEMMON_ALLOW_TRAIN_DEV=1."
                ),
            )
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=403,
                detail="Authorization header obrigatório (Bearer <token>).",
            )
        enviado = authorization[7:].strip()
        if not secrets.compare_digest(enviado, esperado):
            raise HTTPException(status_code=403, detail="Token inválido.")

    # 1. Lê registros de calibragem
    # v1.51 — usa _calibragem_path() pra pegar arquivo do tenant atual
    from api.routes.calibragem import _calibragem_path
    arquivo_cal = _calibragem_path()
    if not arquivo_cal.exists():
        raise HTTPException(status_code=404, detail="Nenhum registro de calibragem ainda.")
    try:
        registros = json.loads(arquivo_cal.read_text(encoding="utf-8"))
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

    # v1.48 A3a-006 — validação rigorosa antes de gravar.
    # Antes só checava tamanho; agora também valida seções obrigatórias.
    ok_valid, motivo_valid = _validar_prompt_resultado(novo_prompt, prompt_atual)
    if not ok_valid:
        # Audit pra rastrear treinos rejeitados (ajuda detectar Haiku piorando)
        try:
            audit.registrar(
                "pedro_espelho_train_rejected",
                motivo=motivo_valid,
                tam_resposta=len(novo_prompt) if novo_prompt else 0,
                tam_atual=len(prompt_atual),
            )
        except Exception:
            pass
        raise HTTPException(
            status_code=502,
            detail=(
                "Treino rejeitado: prompt resultado não preserva regras críticas. "
                f"Detalhe: {motivo_valid}"
            ),
        )

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
