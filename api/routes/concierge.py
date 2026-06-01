"""
T186 — Agente Concierge (orquestrador conversacional).

Diferente dos outros agentes Lemmon (Otto, Heitor, etc) que rodam DEPOIS
da escolha de pipeline, o Concierge roda ANTES e é o **cérebro do sistema**:
 - Conhece TODOS os 12 agentes e ferramentas disponíveis
 - Avalia o pedido em 6 dimensões + intenção
 - Conversa pra refinar quando vago
 - Quando pronto, escolhe os agentes E ferramentas extras + explica razão
"""
import json
import os
from typing import Literal

import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.routes.agentes import construir_catalogo

router = APIRouter()


class HistoricoMensagem(BaseModel):
    role: Literal['user', 'concierge']
    content: str
    # T186.c — imagem opcional anexada à mensagem (vision)
    image_base64: str | None = None
    image_media_type: str | None = None


class ConcierePedido(BaseModel):
    historico: list[HistoricoMensagem]


class ConciereResposta(BaseModel):
    tipo: Literal['pergunta', 'pronto']
    conteudo: str
    briefing_refinado: str | None = None
    dimensoes_completas: list[str] = []
    dimensoes_faltando: list[str] = []
    agentes_sugeridos: list[str] = []
    razoes_agentes: dict[str, str] = {}
    ferramentas_extras: list[str] = []


# ─── Ferramentas disponíveis no sistema (endpoints especiais) ─────────
FERRAMENTAS_DISPONIVEIS = {
    "briefing_reverso": {
        "nome": "Briefing Reverso",
        "quando_usar": "Cliente já tem refs visuais (vídeos, prints, mood board) e quer extrair briefing estruturado a partir delas. Útil pra entender 'eu quero algo parecido com isso'.",
        "endpoint": "POST /briefing_reverso",
    },
    "cortes_prontos": {
        "nome": "Cortes Prontos",
        "quando_usar": "Cliente já tem material gravado (entrevista longa, live, podcast) e quer extrair clips/cortes prontos pra Reels/Shorts com hook+CTA.",
        "endpoint": "POST /cortes_prontos",
    },
    "calibragem_pedro": {
        "nome": "Calibragem Pedro Abrahão",
        "quando_usar": "Específico pra clínica Hator: ajustar voz/estilo do espelho Pedro Abrahão com base em material real do médico. Pra mantê-lo autêntico.",
        "endpoint": "POST /calibragem_pedro",
    },
    "transcrever": {
        "nome": "Transcrição (Whisper)",
        "quando_usar": "Cliente envia áudio/vídeo e precisa do texto pra trabalhar (briefing ditado, entrevista bruta, etc).",
        "endpoint": "POST /transcrever",
    },
    "share": {
        "nome": "Compartilhar Dossiê",
        "quando_usar": "Cliente quer enviar resultado da sessão pra terceiros (cliente final, médico, sócio) com link público e comentários.",
        "endpoint": "POST /share",
    },
    "exportar": {
        "nome": "Exportar Dossiê",
        "quando_usar": "Cliente quer baixar PDF/Markdown/JSON do dossiê pra arquivar, imprimir ou enviar.",
        "endpoint": "POST /exportar",
    },
}


def _carregar_catalogo_seguro() -> list[dict]:
    """Carrega catálogo dos agentes; retorna lista vazia se falhar."""
    try:
        return construir_catalogo()
    except Exception:
        return []


def _construir_system_prompt() -> str:
    """Constrói SYSTEM_PROMPT com catálogo ATUAL dos agentes + ferramentas.

    Carrega dinamicamente pra que novos agentes adicionados não exijam
    mudar o prompt manualmente.
    """
    catalogo = _carregar_catalogo_seguro()

    # Bloco agentes
    agentes_block = "\n".join(
        f"- **{a['id']}** ({a.get('papel_curto', '?')}): {a.get('quando_usar', [''])[0] if a.get('quando_usar') else ''}"
        for a in catalogo
    )

    # Bloco ferramentas
    ferramentas_block = "\n".join(
        f"- **{key}** — {info['nome']}: {info['quando_usar']}"
        for key, info in FERRAMENTAS_DISPONIVEIS.items()
    )

    return f"""# Você é o **Concierge** da Lemmon Produções

Lemmon é uma agência de marketing especializada em conteúdo pra clínicas de saúde (cliente principal: **Hator Clinic** do Dr. Pedro Abrahão, especializada em menopausa, saúde feminina e estética orofacial).

Você é o **cérebro do sistema** — a primeira pessoa que o cliente fala antes de mobilizar a equipe de especialistas. Sua função é:

1. **Entender DE VERDADE** o que o cliente quer (não aceita briefing vago)
2. **Conversar pra refinar** quando faltar contexto
3. **Escolher os agentes especialistas** corretos
4. **Sugerir ferramentas extras** quando aplicável
5. **Explicar a razão de cada escolha** pro cliente entender o pipeline

Você NÃO produz conteúdo. Você orquestra.

---

## 🧠 Equipe que você comanda (12 especialistas)

{agentes_block}

## 🧰 Ferramentas extras do sistema

{ferramentas_block}

---

## 🎯 Como avaliar um pedido

Sempre considere essas dimensões antes de mobilizar a equipe:

1. **O QUÊ** — qual peça/conteúdo/análise é o entregável final?
2. **PÚBLICO** — quem é o alvo (idade, gênero, dor, momento)?
3. **CANAL** — Reels/IG, TikTok, YouTube, ad pago, dossiê interno, planilha admin?
4. **OBJETIVO** — awareness, conversão, retenção, educação, decisão interna?
5. **URGÊNCIA** — hoje, semana, mês?
6. **VIBE/TOM** — íntimo, técnico, científico, divertido, sério?

E também:
- **CONTEXTO ESPECIAL**: É clínica Hator? Material já existe? Precisa compliance?

---

## 🧭 Decisão: pergunta vs pronto

### Pergunte quando:
- Falta o **O QUÊ** ou **OBJETIVO** (são obrigatórios)
- Faltam 2+ dimensões críticas
- Ambíguo qual frente acionar (marketing vs admin Hator vs orçamento)

### Vá pra "pronto" quando:
- O QUÊ e OBJETIVO claros + pelo menos 2 outras dimensões
- Sabe exatamente quais especialistas ativar e por quê
- Sabe se ferramentas extras são necessárias

**Limite**: após 4 rodadas de pergunta, FORCE "pronto" mesmo incompleto — não trave o cliente.

---

## 🗣 Tom

- Português brasileiro coloquial e direto
- Acolhedor SEM ser bajulador (evite "claro!", "ótimo!", "perfeito!")
- **Uma frase curta de contexto** ("Vi que é sobre menopausa") + **uma pergunta concreta** ("É pra Reels orgânico ou ad pago?")
- Em "pronto", explique: **quem vai fazer o quê** numa frase amigável

---

## 🧩 Padrões de pipeline (use como referência)

Esses são padrões observados, não regras rígidas. Você decide.

- **Reels orgânico saúde**: otto + carlos + heitor + sonia + (pedro_abrahao se Hator) + aya
- **Ad pago saúde**: otto + heitor (obrigatório) + carlos + sonia + aya
- **Conteúdo educativo**: otto + carlos + (pedro_abrahao se Hator) + aya
- **Cliente tem refs visuais**: ferramenta `briefing_reverso` + otto + ...
- **Calendário editorial**: renata + (otto se estratégico) + aya
- **Reels com material gravado**: ferramenta `cortes_prontos` + carlos + sonia
- **Análise financeira Hator**: ana_maria + (caito se decisão) + (kelly se tributário)
- **Decisão operacional Hator**: caito + (ana_maria/prichina/kelly conforme área)
- **Folha/RH/contas Hator**: prichina + (ana_maria se pagamento)
- **Tributário/imposto Hator**: kelly + (ana_maria se fluxo)

**Sempre** termina com **aya** (compiladora) pra fechar dossiê — exceto pra admin Hator (que tem outras saídas).

---

## 📤 Formato OBRIGATÓRIO da resposta

Retorne SEMPRE um JSON válido, e SÓ o JSON (sem texto fora, sem markdown fences):

```json
{{
  "tipo": "pergunta" | "pronto",
  "conteudo": "<texto pro cliente — pergunta gentil OU mensagem de transição amigável explicando quem vai fazer o quê>",
  "briefing_refinado": "<se pronto: consolidação clara em 2-4 frases. se pergunta: null>",
  "dimensoes_completas": ["o_que", "publico", "canal", ...],
  "dimensoes_faltando": ["objetivo", "vibe", ...],
  "agentes_sugeridos": ["otto", "carlos", ...],
  "razoes_agentes": {{
    "otto": "decodificar tese pra um briefing aberto de saúde",
    "carlos": "..."
  }},
  "ferramentas_extras": ["briefing_reverso", ...]
}}
```

Use SEMPRE chaves exatas pra dimensões: `o_que`, `publico`, `canal`, `objetivo`, `urgencia`, `vibe`.
Use IDs exatos pra agentes (lowercase, snake_case): `otto`, `heitor`, `salles`, `carlos`, `sonia`, `aya`, `renata`, `pedro_abrahao`, `ana_maria`, `prichina`, `caito`, `kelly`.
Use keys exatos pra ferramentas: `briefing_reverso`, `cortes_prontos`, `calibragem_pedro`, `transcrever`, `share`, `exportar`.

Se `tipo=pergunta`, deixe `agentes_sugeridos`, `razoes_agentes` e `ferramentas_extras` vazios.
"""


@router.post("/concierge/conversar", response_model=ConciereResposta)
async def conversar(pedido: ConcierePedido):
    """Avalia pedido, conversa pra refinar quando vago, escolhe agentes e ferramentas."""
    if not pedido.historico:
        raise HTTPException(status_code=400, detail="histórico vazio")

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY não configurada")

    # Constrói messages no formato Anthropic. Suporta imagem (vision) anexa
    # ao último user message via content blocks (T186.c).
    messages: list[dict] = []
    for msg in pedido.historico:
        role = "user" if msg.role == "user" else "assistant"
        if msg.image_base64 and msg.image_media_type and role == "user":
            # Content blocks com imagem + texto (formato Anthropic vision)
            messages.append({
                "role": role,
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": msg.image_media_type,
                            "data": msg.image_base64,
                        },
                    },
                    {"type": "text", "text": msg.content or "(imagem anexada — analise)"},
                ],
            })
        else:
            messages.append({"role": role, "content": msg.content})

    client = anthropic.Anthropic(api_key=api_key)
    system_prompt = _construir_system_prompt()

    try:
        response = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=2048,
            system=system_prompt,
            messages=messages,
        )
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"erro Anthropic: {str(e)[:200]}") from e

    # Extrai texto
    text = ""
    for block in response.content:
        if block.type == "text":
            text += block.text

    # Parse JSON com tolerância a fences markdown
    try:
        text_clean = text.strip()
        if text_clean.startswith("```"):
            text_clean = text_clean.split("```")[1]
            if text_clean.startswith("json"):
                text_clean = text_clean[4:]
        text_clean = text_clean.strip()
        data = json.loads(text_clean)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Concierge retornou JSON inválido: {text[:300]}",
        ) from e

    return ConciereResposta(
        tipo=data.get("tipo", "pergunta"),
        conteudo=data.get("conteudo", ""),
        briefing_refinado=data.get("briefing_refinado"),
        dimensoes_completas=data.get("dimensoes_completas", []),
        dimensoes_faltando=data.get("dimensoes_faltando", []),
        agentes_sugeridos=data.get("agentes_sugeridos", []),
        razoes_agentes=data.get("razoes_agentes", {}),
        ferramentas_extras=data.get("ferramentas_extras", []),
    )
