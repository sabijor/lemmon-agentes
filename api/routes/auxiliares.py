"""Rotas auxiliares: sugerir_pipeline, briefing_reverso, cortes_prontos."""
import asyncio
import json
import re

from fastapi import APIRouter, HTTPException

from api.deps import (
    LEMMON_MODELO_PADRAO,
    APIConnectionError,
    APIError,
    AuthenticationError,
    RateLimitError,
    _anthropic_client,
    formatar_erro_anthropic,
)
from api.schemas import BriefingReversoPayload, CortesProntosPayload

router = APIRouter()


@router.get("/sugerir_pipeline")
async def sugerir_pipeline(briefing: str):
    """T28: Haiku analisa o briefing e sugere quais agentes fazer sentido."""
    loop = asyncio.get_running_loop()
    AGENTES_DISPONIVEIS = ["otto", "heitor", "salles", "sonia", "aya"]
    prompt = (
        "Analise o briefing e sugira quais agentes da Lemmon Produções devem rodar:\n"
        "- otto: análise estratégica, tese criativa (sempre útil)\n"
        "- heitor: compliance (essencial se houver saúde, termos técnicos, suplementos, medicina)\n"
        "- salles: roteiro filmável (use se precisar de conteúdo de vídeo/roteiro)\n"
        "- sonia: performance e distribuição (use se o conteúdo vai para redes sociais)\n"
        "- aya: compilação final (sempre recomendado no final)\n\n"
        "Responda SOMENTE com JSON válido: "
        '{\"agentes\": [\"otto\", ...], \"razoes\": {\"agente\": \"motivo curto\"}}'
        f"\n\nBriefing:\n{briefing[:1000]}"
    )
    try:
        resp = await loop.run_in_executor(
            None,
            lambda: _anthropic_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            ),
        )
    except (APIError, APIConnectionError, AuthenticationError, RateLimitError) as e:
        raise HTTPException(status_code=503, detail=formatar_erro_anthropic(e))
    raw = next((b.text for b in resp.content if hasattr(b, "text")), "")
    try:
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        sugestao = json.loads(m.group()) if m else {}
    except Exception:
        sugestao = {"agentes": AGENTES_DISPONIVEIS, "razoes": {}}
    agentes = [a for a in sugestao.get("agentes", AGENTES_DISPONIVEIS) if a in AGENTES_DISPONIVEIS]
    return {"agentes": agentes, "razoes": sugestao.get("razoes", {})}


@router.post("/briefing_reverso")
async def analisar_briefing_reverso(payload: BriefingReversoPayload):
    """T23: dado um vídeo/texto pronto, infere o briefing e tese original."""
    loop = asyncio.get_running_loop()
    system_p = (
        "Você é Otto, estrategista criativo da Lemmon Produções. "
        "Dado um vídeo ou texto já produzido, você deve reconstruir: "
        "qual era o briefing original que gerou este conteúdo, qual é a tese criativa "
        "subjacente e qual o posicionamento de marca implícito.\n\n"
        "Responda em markdown com 3 seções:\n"
        "## Briefing inferido\n## Tese criativa\n## Posicionamento de marca"
    )
    try:
        resp = await loop.run_in_executor(
            None,
            lambda: _anthropic_client.messages.create(
                model=LEMMON_MODELO_PADRAO,
                max_tokens=1200,
                system=system_p,
                messages=[{"role": "user", "content": f"Analise este conteúdo:\n\n{payload.transcricao[:8000]}"}],
            ),
        )
    except (APIError, APIConnectionError, AuthenticationError, RateLimitError) as e:
        raise HTTPException(status_code=503, detail=formatar_erro_anthropic(e))
    texto = next((b.text for b in resp.content if hasattr(b, "text")), "")
    custo = (resp.usage.input_tokens * 3e-6 + resp.usage.output_tokens * 1.5e-5)
    return {"resultado": texto, "custo_total_usd": round(custo, 6)}


@router.post("/cortes_prontos")
async def gerar_cortes_prontos(payload: CortesProntosPayload):
    """T25: a partir de transcrição, propõe cortes autônomos com timestamps."""
    loop = asyncio.get_running_loop()
    durs = ", ".join([f"{d}s" for d in payload.duracoes[:4]])
    system_p = (
        "Você é Sônia, especialista em performance de conteúdo para redes sociais. "
        "Dado o texto de um vídeo longo, proponha cortes autônomos prontos para edição. "
        f"Durações alvo: {durs}. Para cada corte: início/fim aproximado, texto da legenda "
        "principal, hook de abertura e CTA final. Use formato markdown com tabela por duração."
    )
    try:
        resp = await loop.run_in_executor(
            None,
            lambda: _anthropic_client.messages.create(
                model=LEMMON_MODELO_PADRAO,
                max_tokens=2000,
                system=system_p,
                messages=[{"role": "user", "content": f"Transcrição:\n\n{payload.transcricao[:10000]}"}],
            ),
        )
    except (APIError, APIConnectionError, AuthenticationError, RateLimitError) as e:
        raise HTTPException(status_code=503, detail=formatar_erro_anthropic(e))
    texto = next((b.text for b in resp.content if hasattr(b, "text")), "")
    custo = (resp.usage.input_tokens * 3e-6 + resp.usage.output_tokens * 1.5e-5)
    return {"cortes": texto, "custo_total_usd": round(custo, 6)}
