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
from core.agente_base import classificar_erro_anthropic, formatar_erro_anthropic

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
    # T188.a — novo tipo "confirmar" entre pergunta e pronto.
    # Concierge propõe equipe + razão e pede OK do user antes de mobilizar.
    tipo: Literal['pergunta', 'confirmar', 'pronto']
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

## 🧭 Decisão: pergunta vs confirmar vs pronto

Você tem **3 tipos de resposta** (T188.a — sempre passa pelo "confirmar" antes de disparar):

### "pergunta" — quando ainda falta contexto
- Falta o **O QUÊ** ou **OBJETIVO** (são obrigatórios)
- Faltam 2+ dimensões críticas
- Ambíguo qual frente acionar (marketing vs admin Hator vs orçamento)

### "confirmar" — quando você JÁ sabe o que fazer mas precisa do OK do cliente
- O QUÊ e OBJETIVO claros + pelo menos 2 outras dimensões
- Sabe exatamente quais especialistas ativar e por quê
- **NUNCA dispare pipeline sem confirmação do cliente** — sempre passe por "confirmar" primeiro
- Mostre a equipe escolhida + razão de cada um + pergunte "OK pra rodar?"

### "pronto" — só depois que o cliente confirmou
- Use APENAS quando a mensagem anterior foi "confirmar" E o cliente respondeu algo como "sim/ok/pode/vai/confirmado/pode rodar"
- Se cliente respondeu "edita X" ou "tira Y", volte pra "confirmar" com ajustes

**Limite**: após 4 rodadas de "pergunta", FORCE "confirmar" mesmo incompleto. Após 1 rodada de "confirmar" sem OK explícito do user, mantenha "confirmar" repetindo a pergunta (não force "pronto").

---

## 🗣 Tom

- Português brasileiro coloquial e direto
- Acolhedor SEM ser bajulador (evite "claro!", "ótimo!", "perfeito!")
- **Uma frase curta de contexto** ("Vi que é sobre menopausa") + **uma pergunta concreta** ("É pra Reels orgânico ou ad pago?")
- Em "confirmar": **liste os agentes escolhidos com razão de 1 linha cada** + "OK rodar?"
- Em "pronto": frase curta de transição ("Bora! Time mobilizado.") — o pipeline já vai aparecer

---

## ⚠️ REGRAS RÍGIDAS (T188.b/c/d — bugs reportados no teste real)

### 1. Cliente Hator → SEMPRE inclua `pedro_abrahao`
Se o briefing mencionar QUALQUER UM dos termos abaixo, `pedro_abrahao` é **OBRIGATÓRIO**
(como espelho/validador médico, mesmo que outras frentes existam):
- "Hator", "Dr. Pedro", "Dra. Pedro", "Pedro Abrahão", "menopausa", "saúde feminina",
  "consulta médica", "TRH", "reposição hormonal", "estética orofacial", "clínica" + Pedro,
  "ginecologia", "endocrinologia feminina"

### 2. Salles entra SÓ com material/produção real
`salles` é Produtor documental — entra APENAS se o briefing mencionar:
- "gravar", "captação", "captar", "produzir vídeo", "set", "filmagem", "produção"
- OU "entrevista AO VIVO/PRESENCIAL"
- OU cliente já tem material gravado e quer ESTRUTURAR ele

Se briefing é só "roteiros", "scripts", "textos", "legendas", "copy": **NÃO** chame Salles.
Use Carlos (roteirista publicitário).

### 3. Time conservador — defaults mínimos por demanda
Default: **2-3 agentes**. Máximo: **5** (precisa justificativa explícita pra cada).

Tabela de mínimos por tarefa típica:
- "Roteiros" sozinho → `carlos` + `aya` (2)
- "Estratégia" → `otto` + `aya` (2)
- "Calendário editorial" → `renata` + `aya` (2)
- "Ad pago" → `otto` + `heitor` + `carlos` + `aya` (4) — Heitor obrigatório
- "Reels orgânico saúde Hator" → `otto` + `carlos` + `pedro_abrahao` + `aya` (4)
- "Análise financeira Hator" → `ana_maria` (1) ± `caito`/`kelly` conforme área
- "Cortes de vídeo gravado" → ferramenta `cortes_prontos` + `carlos` + `aya` (2)

**NÃO inclua agente "pra ter certeza"**. Se não há razão específica no briefing,
não convoca. Cliente paga por cada um.

### 4. Heitor entra quando há risco
`heitor` (compliance) entra obrigatoriamente quando:
- É ad pago (Meta cobra compliance)
- Mencionar produto/serviço de saúde com claims ("emagrecimento", "cura", "tratamento")
- Cliente diz "auditar", "revisar termos", "checar"

Pode ficar de fora em: posts orgânicos genéricos sem claim, calendário, copy interno.

---

## 🧩 Padrões de pipeline (use como guia, decida caso a caso)

- **Reels orgânico saúde Hator**: otto + carlos + pedro_abrahao + aya (heitor só se ad)
- **Ad pago saúde**: otto + heitor (obrigatório) + carlos + (pedro_abrahao se Hator) + aya
- **Conteúdo educativo Hator**: otto + carlos + pedro_abrahao + aya
- **Cliente tem refs visuais (prints)**: ferramenta `briefing_reverso` + otto + carlos + aya
- **Calendário editorial**: renata + (otto só se estratégico) + aya
- **Material gravado → cortes**: ferramenta `cortes_prontos` + carlos + aya
- **Análise financeira Hator**: ana_maria + (caito se decisão) + (kelly se tributário)
- **Decisão operacional Hator**: caito + (ana_maria/prichina/kelly conforme área)
- **Folha/RH/contas Hator**: prichina + (ana_maria se pagamento)
- **Tributário/imposto Hator**: kelly + (ana_maria se fluxo)

**Sempre** termina com **aya** (compiladora) — exceto pra admin Hator (saídas próprias).

---

## 📤 Formato OBRIGATÓRIO da resposta

Retorne SEMPRE um JSON válido, e SÓ o JSON (sem texto fora, sem markdown fences):

```json
{{
  "tipo": "pergunta" | "confirmar" | "pronto",
  "conteudo": "<texto pro cliente — pergunta gentil / proposta com OK / transição amigável>",
  "briefing_refinado": "<se confirmar OU pronto: consolidação em 2-4 frases. se pergunta: null>",
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
Se `tipo=confirmar`, PREENCHA todos esses campos (cliente precisa ver o que vai rodar).
Se `tipo=pronto`, mantenha os mesmos campos da última "confirmar" (significa que cliente OKou).

### Exemplo de "confirmar"
```json
{{
  "tipo": "confirmar",
  "conteudo": "Pra Reels de menopausa orgânico, vou mobilizar:\\n\\n• Otto — decodifica tese\\n• Carlos — escreve roteiros\\n• Pedro (espelho IA) — valida pela ótica do médico\\n• Aya — compila tudo\\n\\nOK rodar assim ou quer ajustar?",
  "briefing_refinado": "Reels orgânico pra Instagram da Hator Clinic sobre menopausa. Público: mulheres 40-55 anos. Tom íntimo e científico.",
  "dimensoes_completas": ["o_que", "publico", "canal", "objetivo", "vibe"],
  "dimensoes_faltando": [],
  "agentes_sugeridos": ["otto", "carlos", "pedro_abrahao", "aya"],
  "razoes_agentes": {{
    "otto": "decodifica tese em briefing aberto",
    "carlos": "escreve roteiros publicitários filmáveis",
    "pedro_abrahao": "valida pela ótica do médico (cliente Hator)",
    "aya": "compila o dossiê final"
  }},
  "ferramentas_extras": []
}}
```
"""


def _parse_resposta_concierge(text: str) -> dict | None:
    """Tenta extrair JSON da resposta do Haiku tolerando fences markdown.

    Retorna dict ou None se falhar. Não levanta — quem chama decide se faz retry.
    """
    try:
        text_clean = text.strip()
        # Remove fence ```json...``` ou ```...```
        if text_clean.startswith("```"):
            partes = text_clean.split("```")
            if len(partes) >= 2:
                text_clean = partes[1]
            if text_clean.startswith("json"):
                text_clean = text_clean[4:]
            elif text_clean.startswith("JSON"):
                text_clean = text_clean[4:]
        text_clean = text_clean.strip()
        return json.loads(text_clean)
    except (json.JSONDecodeError, IndexError, ValueError):
        return None


@router.post("/concierge/conversar", response_model=ConciereResposta)
async def conversar(pedido: ConcierePedido):
    """Avalia pedido, conversa pra refinar quando vago, escolhe agentes e ferramentas."""
    if not pedido.historico:
        raise HTTPException(status_code=400, detail="histórico vazio")

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        # T193.c — erro amigável quando .env do cliente não tem a key
        raise HTTPException(
            status_code=401,
            detail="Chave da API Anthropic não configurada. Avise o suporte da Lemmon.",
        )

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

    # T188.l + T193.a — tenta até 2x: se 1ª resposta vier sem JSON válido,
    # injeta lembrete e tenta de novo. Evita derrubar sessão por glitch do modelo.
    data: dict | None = None
    text = ""
    ultima_excecao: Exception | None = None

    for tentativa in range(2):
        try:
            response = client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=2048,
                system=(
                    system_prompt
                    if tentativa == 0
                    else system_prompt + "\n\n## ⚠ Última saída inválida\n"
                    "Sua última resposta NÃO foi JSON válido. Retorne SÓ o objeto JSON "
                    "exigido, sem texto antes/depois, sem fences markdown."
                ),
                messages=messages,
            )
        except (
            anthropic.AuthenticationError,
            anthropic.RateLimitError,
            anthropic.APIConnectionError,
            anthropic.APIStatusError,
            anthropic.APIError,
        ) as e:
            # T193.b + T190.A10 — classifica erro e retorna status apropriado.
            # NÃO vaza traceback nem string crua da Anthropic.
            kind = classificar_erro_anthropic(e)
            msg_amigavel = formatar_erro_anthropic(e)
            status_map = {
                "sem_credito": 402,
                "rate_limit": 429,
                "auth": 401,
                "conexao": 503,
                "outro": 502,
            }
            raise HTTPException(
                status_code=status_map.get(kind, 502),
                detail=msg_amigavel,
            ) from e

        text = ""
        for block in response.content:
            if block.type == "text":
                text += block.text

        data = _parse_resposta_concierge(text)
        if data is not None:
            break  # JSON OK, segue
        # Se chegou aqui, vai tentar de novo (com prompt reforçado)

    if data is None:
        # T188.l — fallback gracioso: nem 2ª tentativa parseou. Em vez de derrubar
        # a sessão com 500, retorna pergunta neutra pra user reformular.
        return ConciereResposta(
            tipo="pergunta",
            conteudo=(
                "Desculpa, me confundi processando sua mensagem. "
                "Pode reformular ou dar mais um detalhe sobre o que você precisa?"
            ),
        )

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
