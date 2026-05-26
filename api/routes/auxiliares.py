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


def _construir_prompt_sugestor(briefing: str, catalogo: list[dict]) -> str:
    """Monta o prompt do Haiku dinamicamente a partir do catálogo de agentes (T139)."""
    linhas_agentes = []
    for a in catalogo:
        linhas_agentes.append(
            f"• {a['id']} [{a['categoria']}] — {a['papel_curto']}\n"
            f"    Use quando: {'; '.join(a['quando_usar'][:3]) or '(sem critérios definidos)'}\n"
            f"    NÃO use quando: {'; '.join(a['quando_nao_usar'][:2]) or '(sem restrições)'}\n"
            f"    Custo médio: ~${a['custo_medio_usd']:.2f}"
        )
    bloco = "\n\n".join(linhas_agentes)
    ids_validos = ", ".join(a["id"] for a in catalogo)
    return (
        "Você é o roteador da Lemmon Produções. Recebe um pedido do operador "
        "e decide QUAIS agentes da equipe devem rodar pra atender. Use só os "
        "agentes da lista abaixo — não invente nomes.\n\n"
        "AGENTES DISPONÍVEIS:\n\n"
        f"{bloco}\n\n"
        "REGRAS:\n"
        "- Escolha o MENOR conjunto suficiente. Não inclua agente irrelevante só pra dar volume.\n"
        "- Ordem importa: cada agente recebe contexto dos anteriores. Coloque estratégia antes de roteiro, roteiro antes de performance.\n"
        "- Aya (compilação) só faz sentido se houver 2+ agentes antes dela.\n"
        "- Espelhos de cliente entram quando o briefing menciona o cliente específico.\n\n"
        "REGRAS DE OURO (não-negociáveis):\n"
        "- Se o pedido envolve SAÚDE, MEDICINA, ESTÉTICA, ODONTO, SUPLEMENTOS, HARMONIZAÇÃO, EMAGRECIMENTO, ESTÉTICA FACIAL/CORPORAL → INCLUIR Heitor SEMPRE.\n"
        "- Se for produzir conteúdo pra ad pago (anúncio no Meta/Instagram/Facebook) → INCLUIR Heitor.\n"
        "- Aya é compiladora obrigatória — SEMPRE entra no final quando há QUALQUER outro agente. Sistema força isso, mas você ainda inclui na sua lista.\n"
        "- Se o pedido tem ação clara (faz/cria/roda/monta X), ATIVE agentes mesmo sem todo contexto. Use seu melhor julgamento. NÃO retorne vazio só porque falta detalhe.\n"
        "- Só retorne lista VAZIA se o pedido for fundamentalmente incompleto (ex: 'me dá ideia [sem dizer ideia do quê]', 'roda esse texto: [vazio]') OU se for puramente conversacional sem entregável (ex: 'oi tudo bem'). Inclua razão em \"_motivo_vazio\".\n\n"
        "EXEMPLOS DE CONJUNTOS MÍNIMOS:\n"
        "- 'campanha completa pra [cliente/produto]' → otto + heitor (se ad/saúde) + salles + sonia + aya  (entrega completa: estratégia → roteiro → otimização performance → dossiê)\n"
        "- 'reel/short pra [tema]' → otto + heitor (se saúde) + salles + sonia + aya\n"
        "- 'estratégia pra [coisa]' → otto + aya (estratégia + dossiê)\n"
        "- 'calendário editorial' (com contexto suficiente) → renata + aya\n"
        "- 'compliance/validar texto' → heitor (sozinho — não precisa de aya)\n"
        "- 'conteúdo pra Pedro/Hator' → adicionar pedro_abrahao ao conjunto que faria sentido\n\n"
        "RESPONDA SOMENTE COM JSON VÁLIDO, no formato:\n"
        '{"agentes": ["id1", "id2", ...], "razoes": {"id1": "por que rodar"}, "custo_estimado_usd": 0.00, "_motivo_vazio": "(só se agentes=[]) explicação amigável"}\n\n'
        f"IDs válidos: {ids_validos}\n\n"
        f"PEDIDO DO OPERADOR:\n{briefing[:2000]}"
    )


@router.get("/sugerir_pipeline")
async def sugerir_pipeline(briefing: str):
    """T28 + T139: Haiku analisa o briefing e sugere quais agentes acionar.

    Lê o catálogo dinâmico via /agentes/catalogo (mesma fonte do front).
    Adicionar agente novo: criar a classe com metadados, registrar em
    api/routes/agentes.py — o sugestor passa a considerar automaticamente.
    """
    from api.routes.agentes import construir_catalogo
    loop = asyncio.get_running_loop()
    catalogo = construir_catalogo()
    ids_validos = {a["id"] for a in catalogo}
    prompt = _construir_prompt_sugestor(briefing, catalogo)
    try:
        resp = await loop.run_in_executor(
            None,
            lambda: _anthropic_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=500,
                messages=[{"role": "user", "content": prompt}],
            ),
        )
    except (APIError, APIConnectionError, AuthenticationError, RateLimitError) as e:
        raise HTTPException(status_code=503, detail=formatar_erro_anthropic(e))
    raw = next((b.text for b in resp.content if hasattr(b, "text")), "")
    sugestao: dict = {}
    try:
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if m:
            sugestao = json.loads(m.group())
    except Exception:
        sugestao = {}
    agentes = [a for a in sugestao.get("agentes", []) if a in ids_validos]
    motivo_vazio = sugestao.get("_motivo_vazio") or ""
    # Se a IA decidiu vazio CONSCIENTEMENTE (com motivo), respeitamos. Se decidiu
    # vazio sem motivo, é falha de parse → fallback conservador (Otto sozinho dá um norte).
    if not agentes and not motivo_vazio:
        agentes = [a for a in ["otto"] if a in ids_validos]

    # REGRA DE OURO: Aya é compiladora — SEMPRE entra no fim quando há outros agentes.
    # Cliente espera SEMPRE um dossiê final. Exceção: agente único de compliance puro
    # (Heitor sozinho — pedido tipo "valida esse texto" não precisa de dossiê).
    if agentes and agentes != ["heitor"] and "aya" not in agentes and "aya" in ids_validos:
        agentes.append("aya")
    # Garante Aya na última posição (a IA pode ter colocado no meio)
    if "aya" in agentes:
        agentes = [a for a in agentes if a != "aya"] + ["aya"]

    return {
        "agentes": agentes,
        "razoes": sugestao.get("razoes", {}),
        "custo_estimado_usd": sugestao.get("custo_estimado_usd"),
        "motivo_vazio": motivo_vazio,
    }


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
