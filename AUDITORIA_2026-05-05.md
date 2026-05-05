# AUDITORIA TÉCNICA — Lemmon Agentes Dashboard
**Data:** 2026-05-05  
**Contexto:** Exportação completa do estado atual do sistema para revisão em conversa limpa.

---

## 1. ESTRUTURA DO PROJETO

```
lemmon-agentes/
├── api_server.py                  # FastAPI + WebSocket backend
├── core/
│   ├── agente_base.py             # Classe base de todos os agentes
│   ├── config.py                  # Configurações (API key, paths)
│   ├── custo.py                   # Classe Custo (atrib: .custo_usd)
│   └── ...
├── agentes/
│   ├── otto.py                    # Estrategista
│   ├── heitor.py                  # Compliance
│   ├── salles.py                  # Roteirista
│   ├── sonia.py                   # Performance
│   └── aya.py                     # Compiladora / Oráculo
└── dashboard/
    ├── app/page.tsx               # Root — monta toda a UI
    └── lib/
    │   ├── agents.ts              # Definição dos 5 agentes (ids, cores, posições)
    │   ├── useChat.ts             # Hook: pipeline WebSocket
    │   ├── useReuniao.ts          # Hook: reunião conversacional WebSocket
    │   └── useHistory.ts         # Hook: histórico REST
    └── components/
        ├── chat/ChatPanel.tsx     # Painel principal de chat (pipeline + reunião)
        └── history/HistoryPanel.tsx  # Painel flutuante de histórico
```

---

## 2. ARQUITETURA GERAL

### Backend (`api_server.py`)
- **FastAPI** com dois endpoints WebSocket e três REST
- `GET /historico` — lista sessões salvas (pipeline + reunião)
- `GET /historico/{session_id}` — detalhe completo
- `POST /avaliar` — salva avaliação (1–5 estrelas)
- `WS /ws/chat` — pipeline sequencial de agentes
- `WS /ws/reuniao` — modo conversacional multi-turno

### Frontend (Next.js/React)
- **`page.tsx`** — orquestra tudo: estado global, painéis flutuantes (chat + histórico)
- **`ChatPanel.tsx`** — UI única para pipeline e reunião (mode-switch interno)
- **`HistoryPanel.tsx`** — painel flutuante com lista + detalhe, suporte a retomada
- **`useChat`** — gerencia WS `/ws/chat`, estado de mensagens, contexto de retomada
- **`useReuniao`** — gerencia WS `/ws/reuniao`, histórico client-side persistente
- **`useHistory`** — fetch REST, seleção de sessão

---

## 3. ESTADO ATUAL DOS ARQUIVOS-CHAVE

---

### 3.1 `api_server.py` (completo)

```python
"""FastAPI + WebSocket backend para o Lemmon Dashboard."""
import asyncio
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import anthropic as _anthropic
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect

_anthropic_client = _anthropic.Anthropic()
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent))

from agentes.otto import Otto
from agentes.heitor import Heitor
from agentes.salles import Salles
from agentes.sonia import Sonia
from agentes.aya import Aya
from core.config import HISTORICO_DIR

app = FastAPI(title="Lemmon Dashboard API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sessões em memória aguardando avaliação  { session_id: path }
_sessoes_pendentes: dict[str, Path] = {}


def _salvar_sessao_reuniao(
    session_id: str | None,
    session_path: Path | None,
    briefing: str,
    agentes_usados: list[str],
    historico: list[dict],
    respostas: dict[str, str],
    custos: dict[str, float],
) -> tuple[str, Path]:
    """Cria ou atualiza sessão de reunião conversacional no histórico."""
    session_dir = HISTORICO_DIR / "dashboard"
    session_dir.mkdir(parents=True, exist_ok=True)

    if session_path and session_path.exists():
        registro = json.loads(session_path.read_text(encoding="utf-8"))
        registro["agentes_usados"] = list(set(agentes_usados))
        registro["respostas"] = respostas
        registro["custos_usd"] = custos
        registro["custo_total_usd"] = sum(custos.values())
        registro["historico"] = historico
        session_path.write_text(json.dumps(registro, ensure_ascii=False, indent=2), encoding="utf-8")
        return session_id, session_path

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    registro = {
        "timestamp": datetime.now().isoformat(),
        "origem": "reuniao",
        "briefing": briefing,
        "agentes_usados": agentes_usados,
        "respostas": respostas,
        "custos_usd": custos,
        "custo_total_usd": sum(custos.values()),
        "historico": historico,
        "avaliacao": None,
        "observacoes_operador": "",
        "tags": [],
    }
    path = session_dir / f"{ts}_reuniao.json"
    path.write_text(json.dumps(registro, ensure_ascii=False, indent=2), encoding="utf-8")
    return path.stem, path


def _salvar_sessao(
    briefing: str,
    agentes_usados: list[str],
    respostas: dict[str, str],
    custos: dict[str, float],
    contexto_tecnico: dict | None = None,
) -> Path:
    """Salva sessão completa da dashboard no histórico."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    session_dir = HISTORICO_DIR / "dashboard"
    session_dir.mkdir(parents=True, exist_ok=True)

    registro = {
        "timestamp": datetime.now().isoformat(),
        "origem": "dashboard",
        "briefing": briefing,
        "agentes_usados": agentes_usados,
        "respostas": respostas,
        "custos_usd": custos,
        "custo_total_usd": sum(custos.values()),
        "contexto_tecnico": contexto_tecnico or {},
        "avaliacao": None,
        "observacoes_operador": "",
        "tags": [],
    }

    path = session_dir / f"{ts}_sessao.json"
    path.write_text(json.dumps(registro, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


class AvaliacaoPayload(BaseModel):
    session_id: str
    nota: int          # 1–5
    observacoes: str = ""
    tags: list[str] = []


@app.get("/historico")
async def listar_historico():
    session_dir = HISTORICO_DIR / "dashboard"
    if not session_dir.exists():
        return []
    all_files = sorted(
        list(session_dir.glob("*_sessao.json")) + list(session_dir.glob("*_reuniao.json")),
        key=lambda p: p.stem,
        reverse=True,
    )[:200]
    sessions = []
    for path in all_files:
        try:
            dados = json.loads(path.read_text(encoding="utf-8"))
            sessions.append({
                "session_id": path.stem,
                "timestamp": dados.get("timestamp"),
                "briefing": dados.get("briefing", "")[:120],
                "agentes_usados": dados.get("agentes_usados", []),
                "custo_total_usd": dados.get("custo_total_usd", 0),
                "avaliacao": dados.get("avaliacao"),
                "origem": dados.get("origem", "dashboard"),
            })
        except Exception:
            pass
    return sessions


@app.get("/historico/{session_id}")
async def detalhe_historico(session_id: str):
    session_dir = HISTORICO_DIR / "dashboard"
    path = session_dir / f"{session_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    return json.loads(path.read_text(encoding="utf-8"))


@app.post("/avaliar")
async def avaliar(payload: AvaliacaoPayload):
    """Recebe avaliação da sessão e persiste no JSON já salvo."""
    path = _sessoes_pendentes.get(payload.session_id)
    if not path or not path.exists():
        return {"ok": False, "erro": "Sessão não encontrada"}

    dados = json.loads(path.read_text(encoding="utf-8"))
    dados["avaliacao"] = max(1, min(5, payload.nota))
    dados["observacoes_operador"] = payload.observacoes
    dados["tags"] = payload.tags
    path.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")

    del _sessoes_pendentes[payload.session_id]
    return {"ok": True}


async def _stream(ws: WebSocket, agent: str, text: str):
    words = text.split(" ")
    chunk_size = 10
    for i in range(0, len(words), chunk_size):
        chunk = " ".join(words[i:i + chunk_size])
        if i + chunk_size < len(words):
            chunk += " "
        await ws.send_json({"type": "token", "agent": agent, "content": chunk})
        await asyncio.sleep(0.06)


def _make_confirmacao_callback(ws_conn, event_loop, agent_name: str):
    async def _ask(mensagem: str) -> bool:
        await ws_conn.send_json({"type": "confirmar", "agent": agent_name, "mensagem": mensagem})
        ctrl = await ws_conn.receive_json()
        return ctrl.get("type") == "confirmar_sim"

    def callback(mensagem: str) -> bool:
        future = asyncio.run_coroutine_threadsafe(_ask(mensagem), event_loop)
        try:
            return future.result(timeout=300)
        except Exception:
            return False

    return callback


@app.websocket("/ws/chat")
async def chat(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_json()
            names: list[str] = data.get("agents", [])
            briefing: str = data.get("message", "").strip()
            if not briefing or not names:
                continue

            image_base64: str | None = data.get("image_base64")
            image_media_type: str = data.get("image_media_type", "image/jpeg")
            if image_base64:
                try:
                    _resp = _anthropic_client.messages.create(
                        model="claude-haiku-4-5-20251001",
                        max_tokens=600,
                        messages=[{"role": "user", "content": [
                            {"type": "image", "source": {"type": "base64", "media_type": image_media_type, "data": image_base64}},
                            {"type": "text", "text": "Descreva esta imagem com detalhes relevantes para criação de conteúdo de vídeo/marketing. Inclua: elementos visuais, texto visível, cores, contexto e mood/atmosfera. Seja objetivo e completo."},
                        ]}],
                    )
                    descricao = _resp.content[0].text
                    briefing = f"{briefing}\n\n[CONTEXTO VISUAL — Imagem enviada pelo operador]\n{descricao}\n[FIM DO CONTEXTO VISUAL]"
                except Exception:
                    pass

            manual_mode: bool = data.get("manual_mode", False)
            config: dict = data.get("config", {})
            loop = asyncio.get_running_loop()

            # Retomada de sessão anterior: restaura contexto técnico
            resume_context: dict = data.get("resume_context") or {}
            analise_otto = resume_context.get("analise_otto") or None
            diretrizes_heitor = resume_context.get("diretrizes_heitor") or None
            roteiro_salles = resume_context.get("roteiro_salles") or None

            respostas: dict[str, str] = dict(resume_context.get("respostas", {}))
            custos: dict[str, float] = dict(resume_context.get("custos_usd", {}))
            pipeline_cancelled = False

            if resume_context.get("briefing") and briefing == resume_context["briefing"]:
                pass
            elif resume_context.get("briefing") and briefing:
                briefing = f"{resume_context['briefing']}\n\n[INSTRUÇÃO ADICIONAL]: {briefing}"
            elif resume_context.get("briefing"):
                briefing = resume_context["briefing"]

            cfg_otto = config.get("otto", {})
            cfg_heitor = config.get("heitor", {})
            cfg_salles = config.get("salles", {})
            cfg_sonia = config.get("sonia", {})

            async def _run_agent_step(name: str) -> tuple[str, float] | None:
                nonlocal analise_otto, diretrizes_heitor, roteiro_salles

                if name == "otto":
                    ag = Otto()
                    modo_visual = cfg_otto.get("modo_visual", "completo")
                    res = await loop.run_in_executor(None, lambda: ag.executar(briefing, modo_visual=modo_visual))
                    analise_otto = res.get("output_tecnico", {})
                    analise_otto["briefing_original"] = briefing
                    return res.get("output_humano", ""), res.get("custo", {}).get("usd", 0)

                elif name == "heitor":
                    ag = Heitor()
                    max_buscas = int(cfg_heitor.get("max_buscas", 3))
                    cb = _make_confirmacao_callback(ws, loop, "heitor")
                    res = await loop.run_in_executor(None, lambda: ag.executar(
                        conteudo=briefing, modo="cadeia", modo_saida="log",
                        max_buscas=max_buscas, contexto_otto=analise_otto or {},
                        confirmacao_callback=cb,
                    ))
                    if res and not res.get("cancelado"):
                        diretrizes_heitor = res.get("output_tecnico")
                        return res.get("output_humano", ""), res.get("custo_total_usd", 0)
                    return "Análise de compliance cancelada.", 0

                elif name == "salles":
                    ag = Salles()
                    formato = cfg_salles.get("formato", "auto")
                    res = await loop.run_in_executor(None, lambda: ag.executar(
                        briefing=briefing, formato=formato,
                        analise_otto_existente=analise_otto, diretrizes_heitor=diretrizes_heitor,
                    ))
                    roteiro_salles = res.get("output_humano", "")
                    return roteiro_salles, res.get("custo_total_usd", 0)

                elif name == "sonia":
                    ag = Sonia()
                    roteiro = roteiro_salles or briefing
                    com_busca = bool(cfg_sonia.get("com_busca", False))
                    usar_tendencias = bool(cfg_sonia.get("usar_tendencias", True))
                    cb = _make_confirmacao_callback(ws, loop, "sonia")
                    res = await loop.run_in_executor(None, lambda: ag.executar(
                        roteiro=roteiro, modo="solo", com_busca=com_busca,
                        usar_tendencias=usar_tendencias, contexto_otto=analise_otto,
                        contexto_heitor=diretrizes_heitor, confirmacao_callback=cb,
                    ))
                    if res and not res.get("cancelado"):
                        return res.get("output_humano", ""), res.get("custo_total_usd", 0)
                    return "Análise de performance cancelada.", 0

                elif name == "aya":
                    ag = Aya()
                    nome_projeto = briefing[:60] if briefing else None
                    res = await loop.run_in_executor(None, lambda: ag.executar(nome_projeto=nome_projeto))
                    return res.get("output_humano", ""), res.get("custo_total_usd", 0)

                return None

            async def _execute_with_approval(name: str) -> bool:
                nonlocal pipeline_cancelled
                while True:
                    await ws.send_json({"type": "agent_start", "agent": name})
                    try:
                        result = await _run_agent_step(name)
                        if result is None:
                            return True
                        text, cost = result
                        respostas[name] = text
                        custos[name] = cost
                        await _stream(ws, name, text)

                        if manual_mode:
                            await ws.send_json({"type": "agent_done", "agent": name, "cost": cost, "awaiting_approval": True})
                            ctrl = await ws.receive_json()
                            if ctrl.get("type") == "cancel":
                                pipeline_cancelled = True
                                return False
                        else:
                            await ws.send_json({"type": "agent_done", "agent": name, "cost": cost})
                        return True

                    except Exception as e:
                        if manual_mode:
                            await ws.send_json({"type": "agent_error", "agent": name, "error": str(e), "awaiting_retry": True})
                            ctrl = await ws.receive_json()
                            action = ctrl.get("type", "skip")
                            if action == "retry":
                                continue
                            elif action == "cancel":
                                pipeline_cancelled = True
                                return False
                            else:
                                return True
                        else:
                            await ws.send_json({"type": "agent_error", "agent": name, "error": str(e)})
                            return True

            for name in names:
                if name == "aya":
                    continue
                ok = await _execute_with_approval(name)
                if not ok:
                    break

            if "aya" in names and not pipeline_cancelled:
                ok = await _execute_with_approval("aya")
                _ = ok

            all_agents = list(dict.fromkeys(list(resume_context.get("agentes_usados", [])) + names))
            contexto_tecnico = {
                "briefing": briefing,
                "analise_otto": analise_otto,
                "diretrizes_heitor": diretrizes_heitor,
                "roteiro_salles": roteiro_salles,
                "respostas": respostas,
                "custos_usd": custos,
                "agentes_usados": all_agents,
            }
            session_path = _salvar_sessao(briefing, all_agents, respostas, custos, contexto_tecnico)
            session_id = session_path.stem
            _sessoes_pendentes[session_id] = session_path
            if len(_sessoes_pendentes) > 200:
                oldest = next(iter(_sessoes_pendentes))
                del _sessoes_pendentes[oldest]

            await ws.send_json({"type": "pipeline_done", "session_id": session_id})

    except WebSocketDisconnect:
        pass


def _parse_mentions(text: str, agents: list[str]) -> list[str]:
    return [a for a in agents if re.search(rf'@{re.escape(a)}\b', text, re.IGNORECASE)]

def _make_agent(name: str):
    mapping = {"otto": Otto, "heitor": Heitor, "salles": Salles, "sonia": Sonia, "aya": Aya}
    cls = mapping.get(name)
    return cls() if cls else None


@app.websocket("/ws/reuniao")
async def reuniao(ws: WebSocket):
    await ws.accept()
    historico: list[dict] = []
    reun_session_id: str | None = None
    reun_session_path: Path | None = None
    reun_agentes_vistos: list[str] = []
    reun_respostas: dict[str, str] = {}
    reun_custos: dict[str, float] = {}
    reun_briefing: str = ""
    try:
        while True:
            data = await ws.receive_json()

            if data.get("type") == "reset":
                historico = []
                reun_session_id = None
                reun_session_path = None
                reun_agentes_vistos = []
                reun_respostas = {}
                reun_custos = {}
                reun_briefing = ""
                await ws.send_json({"type": "reset_ok"})
                continue

            agents: list[str] = data.get("agents", [])
            message: str = data.get("message", "").strip()
            if not message or not agents:
                continue

            historico_cliente = data.get("historico_anterior")
            if historico_cliente is not None:
                historico = list(historico_cliente)

            if not reun_briefing:
                reun_briefing = message

            manual: bool = data.get("manual", False)
            mentioned = _parse_mentions(message, agents)
            respondentes = mentioned if (mentioned or manual) else agents

            historico_anterior = list(historico)
            historico.append({"role": "user", "content": message})

            loop = asyncio.get_running_loop()
            respostas_turno: list[dict] = []

            for name in respondentes:
                ag = _make_agent(name)
                if not ag:
                    continue

                await ws.send_json({"type": "agent_start", "agent": name})
                try:
                    snap_hist = list(historico_anterior)
                    snap_turno = list(respostas_turno)
                    snap_msg = message
                    result = await loop.run_in_executor(
                        None,
                        lambda ag=ag, h=snap_hist, r=snap_turno, m=snap_msg:
                            ag.responder(m, h, r or None),
                    )
                    text = result.get("output_humano", "")
                    cost = result.get("custo_total_usd", 0)
                    historico.append({"role": name, "content": text})
                    respostas_turno.append({"role": name, "content": text})
                    reun_respostas[name] = text
                    reun_custos[name] = reun_custos.get(name, 0) + cost
                    if name not in reun_agentes_vistos:
                        reun_agentes_vistos.append(name)
                    await _stream(ws, name, text)
                    await ws.send_json({"type": "agent_done", "agent": name, "cost": cost})
                except Exception as e:
                    await ws.send_json({"type": "agent_error", "agent": name, "error": str(e)})

            if reun_respostas:
                reun_session_id, reun_session_path = _salvar_sessao_reuniao(
                    reun_session_id, reun_session_path, reun_briefing,
                    list(reun_agentes_vistos), list(historico),
                    dict(reun_respostas), dict(reun_custos),
                )

            await ws.send_json({"type": "turn_done"})

    except WebSocketDisconnect:
        pass
```

---

### 3.2 `core/agente_base.py` (completo)

```python
"""Classe base para todos os agentes Lemmon."""
import time
from abc import ABC, abstractmethod
from anthropic import Anthropic, APIError, AuthenticationError, RateLimitError
from .config import ANTHROPIC_API_KEY, MODELO_PADRAO, PROMPTS_DIR
from .custo import Custo
from .historico import Historico
from .logger import get_logger

class AgenteBase(ABC):
    nome: str = "agente_base"
    versao_prompt: str = "v1"
    modelo: str = MODELO_PADRAO
    max_tokens: int = 16384
    system_prompt_reuniao: str | None = None

    def __init__(self):
        if not ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY não configurada.")
        self.client = Anthropic(api_key=ANTHROPIC_API_KEY)
        self.logger = get_logger(f"lemmon.{self.nome}")
        self.historico = Historico(self.nome)
        self.system_prompt = self._carregar_prompt()

    def _carregar_prompt(self) -> str:
        arquivo = PROMPTS_DIR / f"{self.nome}_system_{self.versao_prompt}.md"
        if not arquivo.exists():
            raise FileNotFoundError(f"Prompt não encontrado: {arquivo}")
        return arquivo.read_text(encoding="utf-8")

    def _chamar_api(self, mensagens: list, tools: list = None,
                    tool_choice: dict = None, system_override: str = None):
        params = {
            "model": self.modelo,
            "max_tokens": self.max_tokens,
            "system": system_override or self.system_prompt,
            "messages": mensagens,
        }
        if tools:
            params["tools"] = tools
        if tool_choice:
            params["tool_choice"] = tool_choice

        inicio = time.time()
        try:
            response = self.client.messages.create(**params)
        except AuthenticationError:
            raise RuntimeError("Chave da API inválida.")
        except RateLimitError:
            raise RuntimeError("Rate limit atingido.")
        except APIError as e:
            raise RuntimeError(f"Erro da API Anthropic: {e}")

        duracao = round(time.time() - inicio, 2)
        custo = Custo.calcular(response.usage.input_tokens, response.usage.output_tokens)
        self.logger.info(f"Execução em {duracao}s | {custo.resumo()}")
        return response, custo, duracao

    def _formatar_historico_reuniao(self, historico: list[dict]) -> list[dict]:
        """Converte histórico multi-agente para formato user/assistant da API Anthropic."""
        msgs = []
        i = 0
        while i < len(historico):
            entry = historico[i]
            if entry["role"] == "user":
                msgs.append({"role": "user", "content": entry["content"]})
                i += 1
            else:
                partes = []
                while i < len(historico) and historico[i]["role"] != "user":
                    e = historico[i]
                    partes.append(f"[{e['role'].upper()}]: {e['content']}")
                    i += 1
                msgs.append({"role": "assistant", "content": "\n\n---\n\n".join(partes)})
        return msgs

    def responder(self, mensagem: str, historico_anterior: list[dict],
                  respostas_turno: list[dict] | None = None) -> dict:
        """Responde conversacionalmente em modo reunião."""
        msgs = self._formatar_historico_reuniao(historico_anterior)
        conteudo = mensagem
        if respostas_turno:
            ctx = "\n".join(
                f"[{r['role'].upper()} já respondeu]: {r['content'][:400]}..."
                if len(r['content']) > 400 else f"[{r['role'].upper()} já respondeu]: {r['content']}"
                for r in respostas_turno
            )
            conteudo = f"{mensagem}\n\n---\n{ctx}"
        msgs.append({"role": "user", "content": conteudo})
        resp, custo, duracao = self._chamar_api(msgs, system_override=self.system_prompt_reuniao or None)
        texto = next((b.text for b in resp.content if hasattr(b, "text")), "")
        return {"output_humano": texto, "custo_total_usd": custo.custo_usd, "duracao": duracao}

    @abstractmethod
    def executar(self, *args, **kwargs) -> dict:
        ...
```

---

### 3.3 `dashboard/lib/useChat.ts` (completo)

```typescript
'use client'
import { useCallback, useRef, useState } from 'react'
import type { AgentId } from './agents'
import type { HistoryDetail } from './useHistory'

export type MessageRole = 'user' | AgentId
export interface Message {
  id: string; role: MessageRole; content: string; done: boolean
  cost?: number; error?: string; hasImage?: boolean
}
export interface ImageData { base64: string; mediaType: string }
export type AgentStatus = 'idle' | 'thinking' | 'speaking' | 'done' | 'error'
export interface ApprovalRequest {
  agent: string; mode: 'approval' | 'retry' | 'confirmar'
  error?: string; mensagem?: string
}
export interface AgentConfig {
  otto: { modo_visual: 'completo' | 'resumido' | 'minimo' }
  heitor: { max_buscas: number }
  salles: { formato: 'auto' | 'reels' | 'documental' | 'mini-doc' | 'tese' | 'aftermovie' }
  sonia: { com_busca: boolean; usar_tendencias: boolean }
}

const DEFAULT_CONFIG: AgentConfig = {
  otto: { modo_visual: 'completo' },
  heitor: { max_buscas: 3 },
  salles: { formato: 'auto' },
  sonia: { com_busca: false, usar_tendencias: true },
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [agentStatus, setAgentStatus] = useState<Record<AgentId, AgentStatus>>({
    otto: 'idle', heitor: 'idle', salles: 'idle', sonia: 'idle', aya: 'idle',
  })
  const [isRunning, setIsRunning] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [avaliado, setAvaliado] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [awaitingApproval, setAwaitingApproval] = useState<ApprovalRequest | null>(null)
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(DEFAULT_CONFIG)
  const [resumedFrom, setResumedFrom] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const currentMsgId = useRef<Record<string, string>>({})
  const resumeContextRef = useRef<Record<string, unknown> | null>(null)

  const updateConfig = useCallback(<K extends keyof AgentConfig>(agent: K, patch: Partial<AgentConfig[K]>) => {
    setAgentConfig(prev => ({ ...prev, [agent]: { ...prev[agent], ...patch } }))
  }, [])

  const loadSession = useCallback((detail: HistoryDetail) => {
    wsRef.current?.close()
    const msgs: Message[] = [
      { id: 'resume-user', role: 'user', content: detail.briefing, done: true },
      ...detail.agentes_usados
        .filter(a => detail.respostas[a])
        .map(agentId => ({
          id: `resume-${agentId}`,
          role: agentId as AgentId,
          content: detail.respostas[agentId],
          done: true,
          cost: detail.custos_usd?.[agentId],
        })),
    ]
    setMessages(msgs)
    setSessionId(detail.session_id)
    setAvaliado(detail.avaliacao !== null)
    setIsRunning(false)
    setAwaitingApproval(null)
    setAgentStatus({ otto: 'idle', heitor: 'idle', salles: 'idle', sonia: 'idle', aya: 'idle' })
    setResumedFrom(detail.session_id)
    currentMsgId.current = {}
    resumeContextRef.current = (detail as HistoryDetail & { contexto_tecnico?: Record<string, unknown> }).contexto_tecnico ?? {
      briefing: detail.briefing,
      respostas: detail.respostas,
      custos_usd: detail.custos_usd,
      agentes_usados: detail.agentes_usados,
    }
  }, [])

  const send = useCallback((agents: AgentId[], userMessage: string, image?: ImageData) => {
    if (isRunning || !userMessage.trim() || agents.length === 0) return
    setSessionId(null); setAvaliado(false); setAwaitingApproval(null)
    const userId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: userId, role: 'user', content: userMessage, done: true, hasImage: !!image }])
    setAgentStatus(prev => { const next = { ...prev }; agents.forEach(a => { next[a] = 'thinking' }); return next })
    setIsRunning(true)

    const ws = new WebSocket('ws://localhost:8000/ws/chat')
    wsRef.current = ws
    const resumeCtx = resumeContextRef.current
    resumeContextRef.current = null

    ws.onopen = () => ws.send(JSON.stringify({
      agents, message: userMessage, manual_mode: manualMode, config: agentConfig,
      ...(resumeCtx && { resume_context: resumeCtx }),
      ...(image && { image_base64: image.base64, image_media_type: image.mediaType }),
    }))

    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data)
      if (data.type === 'agent_start') {
        const msgId = crypto.randomUUID()
        currentMsgId.current[data.agent] = msgId
        setMessages(prev => [...prev, { id: msgId, role: data.agent as AgentId, content: '', done: false }])
        setAgentStatus(prev => ({ ...prev, [data.agent]: 'speaking' }))
        setAwaitingApproval(null)
      }
      if (data.type === 'token') {
        const msgId = currentMsgId.current[data.agent]
        if (!msgId) return
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: m.content + data.content } : m))
      }
      if (data.type === 'agent_done') {
        const msgId = currentMsgId.current[data.agent]
        if (msgId) setMessages(prev => prev.map(m => m.id === msgId ? { ...m, done: true, cost: data.cost } : m))
        setAgentStatus(prev => ({ ...prev, [data.agent]: 'done' }))
        if (data.awaiting_approval) setAwaitingApproval({ agent: data.agent, mode: 'approval' })
      }
      if (data.type === 'agent_error') {
        const msgId = currentMsgId.current[data.agent]
        if (msgId) setMessages(prev => prev.map(m => m.id === msgId ? { ...m, done: true, error: data.error } : m))
        setAgentStatus(prev => ({ ...prev, [data.agent]: 'error' }))
        if (data.awaiting_retry) setAwaitingApproval({ agent: data.agent, mode: 'retry', error: data.error })
      }
      if (data.type === 'confirmar') setAwaitingApproval({ agent: data.agent, mode: 'confirmar', mensagem: data.mensagem })
      if (data.type === 'pipeline_done') {
        setIsRunning(false); setAwaitingApproval(null)
        if (data.session_id) setSessionId(data.session_id)
        setResumedFrom(null)
        ws.close()
      }
    }
    ws.onerror = () => { setIsRunning(false); setAwaitingApproval(null) }
    ws.onclose = () => { setIsRunning(false); setAwaitingApproval(null) }
  }, [isRunning, manualMode, agentConfig])

  const approve = useCallback((action: 'approve' | 'retry' | 'skip' | 'cancel' | 'confirmar_sim' | 'confirmar_nao') => {
    wsRef.current?.send(JSON.stringify({ type: action }))
    setAwaitingApproval(null)
    if (action === 'cancel') setIsRunning(false)
  }, [])

  const toggleManualMode = useCallback(() => setManualMode(v => !v), [])

  const avaliar = useCallback(async (nota: number, observacoes = '') => {
    if (!sessionId || avaliado) return
    try {
      await fetch('http://localhost:8000/avaliar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, nota, observacoes }),
      })
      setAvaliado(true)
    } catch { /* silencia */ }
  }, [sessionId, avaliado])

  const abort = useCallback(() => {
    wsRef.current?.close(); setIsRunning(false); setAwaitingApproval(null)
    setAgentStatus(prev => {
      const next = { ...prev }
      ;(Object.keys(next) as AgentId[]).forEach(k => {
        if (next[k] === 'thinking' || next[k] === 'speaking') next[k] = 'error'
      })
      return next
    })
  }, [])

  const reset = useCallback(() => {
    wsRef.current?.close()
    setMessages([]); setAgentStatus({ otto: 'idle', heitor: 'idle', salles: 'idle', sonia: 'idle', aya: 'idle' })
    setIsRunning(false); setSessionId(null); setAvaliado(false); setAwaitingApproval(null)
    setResumedFrom(null); resumeContextRef.current = null; currentMsgId.current = {}
  }, [])

  return {
    messages, agentStatus, isRunning, sessionId, avaliado, resumedFrom,
    manualMode, awaitingApproval, agentConfig,
    send, approve, abort, toggleManualMode, updateConfig, avaliar, reset, loadSession,
  }
}
```

---

### 3.4 `dashboard/lib/useHistory.ts` (completo)

```typescript
'use client'
import { useCallback, useState } from 'react'

export interface HistoryItem {
  session_id: string; timestamp: string; briefing: string
  agentes_usados: string[]; custo_total_usd: number
  avaliacao: number | null; origem?: 'dashboard' | 'reuniao'
}

export interface HistoryDetail extends HistoryItem {
  origem?: 'dashboard' | 'reuniao'
  respostas: Record<string, string>
  custos_usd: Record<string, number>
  observacoes_operador: string; tags: string[]
  historico?: Array<{ role: string; content: string }>
}

export function useHistory() {
  const [sessions, setSessions] = useState<HistoryItem[]>([])
  const [selected, setSelected] = useState<HistoryDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('http://localhost:8000/historico')
      setSessions(await res.json())
    } catch { setSessions([]) }
    finally { setLoading(false) }
  }, [])

  const fetchDetail = useCallback(async (sessionId: string) => {
    setLoadingDetail(true)
    try {
      const res = await fetch(`http://localhost:8000/historico/${sessionId}`)
      setSelected(await res.json())
    } catch { /* silencioso */ }
    finally { setLoadingDetail(false) }
  }, [])

  const clearSelected = useCallback(() => setSelected(null), [])
  return { sessions, selected, loading, loadingDetail, fetchSessions, fetchDetail, clearSelected }
}
```

---

### 3.5 `dashboard/lib/useReuniao.ts` (completo)

```typescript
'use client'
import { useCallback, useRef, useState } from 'react'
import { type AgentId } from './agents'
import { type Message, type AgentStatus } from './useChat'

const DEFAULT_STATUS = (): Record<AgentId, AgentStatus> => ({
  otto: 'idle', heitor: 'idle', salles: 'idle', sonia: 'idle', aya: 'idle',
})

export function useReuniao() {
  const [messages, setMessages] = useState<Message[]>([])
  const [agentStatus, setAgentStatus] = useState<Record<AgentId, AgentStatus>>(DEFAULT_STATUS())
  const [isRunning, setIsRunning] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const streamBufRef = useRef<Record<string, string>>({})
  const histRef = useRef<Array<{ role: string; content: string }>>([])

  const getOrCreateWs = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) { resolve(wsRef.current); return }
      const ws = new WebSocket('ws://localhost:8000/ws/reuniao')
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'agent_start') {
          streamBufRef.current[msg.agent] = ''
          setAgentStatus(s => ({ ...s, [msg.agent]: 'thinking' }))
          setMessages(prev => [...prev, { id: `thinking-${msg.agent}`, role: msg.agent as AgentId, content: '', done: false }])
        } else if (msg.type === 'token') {
          const buf = (streamBufRef.current[msg.agent] ?? '') + msg.content
          streamBufRef.current[msg.agent] = buf
          setAgentStatus(s => ({ ...s, [msg.agent]: 'speaking' }))
          setMessages(prev => {
            const idx = prev.findIndex(m => m.id === `thinking-${msg.agent}`)
            if (idx !== -1) { const u = [...prev]; u[idx] = { ...u[idx], content: buf }; return u }
            let sIdx = -1
            for (let i = prev.length - 1; i >= 0; i--) { if (prev[i].role === msg.agent && !prev[i].done) { sIdx = i; break } }
            if (sIdx !== -1) { const u = [...prev]; u[sIdx] = { ...u[sIdx], content: buf }; return u }
            return [...prev, { id: `reun-${msg.agent}-${Date.now()}`, role: msg.agent as AgentId, content: buf, done: false }]
          })
        } else if (msg.type === 'agent_done') {
          const finalText = streamBufRef.current[msg.agent] ?? ''
          histRef.current = [...histRef.current, { role: msg.agent, content: finalText }]
          setAgentStatus(s => ({ ...s, [msg.agent]: 'done' }))
          setMessages(prev => prev.map(m =>
            m.id === `thinking-${msg.agent}` || (m.role === msg.agent && !m.done)
              ? { ...m, done: true, cost: msg.cost } : m
          ))
          delete streamBufRef.current[msg.agent]
        } else if (msg.type === 'agent_error') {
          setAgentStatus(s => ({ ...s, [msg.agent]: 'error' }))
          setMessages(prev => {
            const filtered = prev.filter(m => m.id !== `thinking-${msg.agent}`)
            return [...filtered, { id: `err-${msg.agent}-${Date.now()}`, role: msg.agent as AgentId, content: '', done: true, error: msg.error }]
          })
        } else if (msg.type === 'turn_done') {
          setIsRunning(false)
          setTimeout(() => {
            setAgentStatus(s => {
              const next = { ...s }
              for (const k of Object.keys(next) as AgentId[]) { if (next[k] === 'done') next[k] = 'idle' }
              return next
            })
          }, 1500)
        }
      }
      ws.onclose = () => { setIsRunning(false) }
      wsRef.current = ws
      if (ws.readyState === WebSocket.OPEN) resolve(ws)
      else ws.onopen = () => resolve(ws)
    })
  }, [])

  const send = useCallback(async (agents: AgentId[], message: string, manual = false) => {
    setIsRunning(true)
    setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: 'user', content: message, done: true }])
    const historico_anterior = [...histRef.current]
    histRef.current = [...histRef.current, { role: 'user', content: message }]
    const ws = await getOrCreateWs()
    ws.send(JSON.stringify({ agents, message, historico_anterior, manual }))
  }, [getOrCreateWs])

  const reset = useCallback(() => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'reset' }))
    histRef.current = []
    setMessages([]); setAgentStatus(DEFAULT_STATUS()); setIsRunning(false)
  }, [])

  const abort = useCallback(() => {
    wsRef.current?.close(); wsRef.current = null; setIsRunning(false)
    setAgentStatus(s => {
      const next = { ...s }
      for (const k of Object.keys(next) as AgentId[]) { if (next[k] === 'thinking' || next[k] === 'speaking') next[k] = 'error' }
      return next
    })
  }, [])

  return { messages, agentStatus, isRunning, send, reset, abort }
}
```

---

## 4. FORMATO DO JSON DE SESSÃO SALVO

### Pipeline (`*_sessao.json`)
```json
{
  "timestamp": "2026-05-05T12:00:00",
  "origem": "dashboard",
  "briefing": "...",
  "agentes_usados": ["otto", "aya"],
  "respostas": { "otto": "...", "aya": "..." },
  "custos_usd": { "otto": 0.001, "aya": 0.002 },
  "custo_total_usd": 0.003,
  "contexto_tecnico": {
    "briefing": "...",
    "analise_otto": { ... },
    "diretrizes_heitor": null,
    "roteiro_salles": null,
    "respostas": { ... },
    "custos_usd": { ... },
    "agentes_usados": ["otto", "aya"]
  },
  "avaliacao": null,
  "observacoes_operador": "",
  "tags": []
}
```

### Reunião (`*_reuniao.json`)
```json
{
  "timestamp": "2026-05-05T12:00:00",
  "origem": "reuniao",
  "briefing": "primeira mensagem do usuário",
  "agentes_usados": ["otto", "aya"],
  "respostas": { "otto": "última resposta", "aya": "última resposta" },
  "custos_usd": { "otto": 0.005 },
  "custo_total_usd": 0.005,
  "historico": [
    { "role": "user", "content": "oi" },
    { "role": "otto", "content": "olá!" },
    { "role": "user", "content": "explique X" },
    { "role": "otto", "content": "..." }
  ],
  "avaliacao": null,
  "observacoes_operador": "",
  "tags": []
}
```

---

## 5. FLUXO DE RETOMADA DE SESSÃO

1. **HistoryPanel** — usuário abre histórico, clica em sessão de pipeline
2. **Botão "Retomar"** — aparece apenas para `origem === 'dashboard'` (não reunião)
3. **`handleResume(detail)`** em `page.tsx`:
   - Chama `loadSession(detail)` do `useChat`
   - Fecha painel de histórico
   - Abre chat em modo pipeline
4. **`loadSession(detail)`** em `useChat.ts`:
   - Reconstrói `messages[]` do briefing + respostas anteriores
   - Guarda `contexto_tecnico` em `resumeContextRef`
   - Define `resumedFrom` = session_id original
5. **ChatPanel** mostra banner laranja "Sessão retomada — selecione agentes e continue"
6. **Usuário seleciona agente** (ex: Aya) no header e envia mensagem
7. **`send()`** inclui `resume_context` no payload WebSocket
8. **Backend (`/ws/chat`)**:
   - Restaura `analise_otto`, `diretrizes_heitor`, `roteiro_salles` do resume_context
   - Herda `respostas` e `custos` anteriores
   - Executa apenas os novos agentes
   - Salva nova sessão mesclando dados anteriores + novos
9. **Após `pipeline_done`**: `resumedFrom` é limpo, nova `session_id` é definida

---

## 6. PROBLEMAS CONHECIDOS / PENDÊNCIAS

### Médio
- **Aya no pipeline não usa `analise_otto`**: o handler de Aya em `/ws/chat` só passa `nome_projeto = briefing[:60]`. Mesmo com retomada de sessão tendo `analise_otto` disponível, Aya não o recebe. Se a Aya precisar compilar o trabalho do Otto, isso precisa ser conectado explicitamente.
- **Avaliação de sessão retomada**: após retomar e executar novos agentes, a nova sessão tem `session_id` diferente. A avaliação por estrelas funciona, mas o `_sessoes_pendentes` só tem a nova sessão — a original permanece sem avaliação nova.
- **Historico de reunião não tem "Retomar"**: deliberado — reunião é conversacional e não tem `contexto_tecnico` estruturado. Se quiser retomar reunião, isso precisaria de design separado.

### Baixo
- `Otto`: `res.get("custo", {}).get("usd", 0)` — todos os outros agentes usam `.custo_usd` via `Custo`. Otto usa `res.get("custo", {}).get("usd", 0)` que depende do formato de retorno específico do Otto. Verificar se isso está correto ou se deveria ser `res.get("custo_total_usd", 0)`.
- `_formatar_historico_reuniao`: se o histórico começa com uma mensagem de agente (sem user primeiro), o loop cria um bloco de assistant sem user anterior — a API Anthropic exige que a primeira mensagem seja user.
- `useHistory.fetchSessions` é chamado em `useEffect` no mount do `HistoryPanel`. Se o backend estiver offline, o estado fica vazio silenciosamente.

---

## 7. WEBSOCKET — PROTOCOLO DE MENSAGENS

### `/ws/chat` (pipeline)
| Direção | Tipo | Campos |
|---|---|---|
| client → server | payload inicial | `agents`, `message`, `manual_mode`, `config`, `resume_context?`, `image_base64?`, `image_media_type?` |
| server → client | `agent_start` | `agent` |
| server → client | `token` | `agent`, `content` |
| server → client | `agent_done` | `agent`, `cost`, `awaiting_approval?` |
| server → client | `agent_error` | `agent`, `error`, `awaiting_retry?` |
| server → client | `confirmar` | `agent`, `mensagem` |
| server → client | `pipeline_done` | `session_id` |
| client → server | `{ type: 'approve' \| 'retry' \| 'skip' \| 'cancel' \| 'confirmar_sim' \| 'confirmar_nao' }` | — |

### `/ws/reuniao` (conversacional)
| Direção | Tipo | Campos |
|---|---|---|
| client → server | payload de mensagem | `agents`, `message`, `historico_anterior`, `manual` |
| client → server | reset | `{ type: 'reset' }` |
| server → client | `agent_start` | `agent` |
| server → client | `token` | `agent`, `content` |
| server → client | `agent_done` | `agent`, `cost` |
| server → client | `agent_error` | `agent`, `error` |
| server → client | `turn_done` | — |
| server → client | `reset_ok` | — |

---

## 8. FEATURES IMPLEMENTADAS (RESUMO)

- [x] Pipeline sequencial de agentes com WebSocket
- [x] Modo manual: aprovação step-by-step entre agentes
- [x] Retry / skip / cancel em erros
- [x] Confirmação interativa (Heitor, Sônia pedem confirmação antes de buscas)
- [x] Upload de imagem com descrição automática via Claude Haiku (visão)
- [x] Modo Reunião conversacional multi-turno com @menções
- [x] Auto vs. manual na reunião (manual = só responde se @mencionado)
- [x] Histórico client-side em `histRef` para sobreviver reconexões WS
- [x] Indicador visual de "pensando" (placeholder vazio animado)
- [x] Enter para enviar, Shift+Enter para nova linha
- [x] Exportar sessão como .txt
- [x] Histórico persistido em disco (pipeline: `*_sessao.json`, reunião: `*_reuniao.json`)
- [x] HistoryPanel flutuante com scroll funcional (alturas explícitas em px)
- [x] Retomada de sessão: "Retomar" carrega contexto anterior e permite continuar
- [x] Sessões de reunião salvas/atualizadas no histórico a cada turno
- [x] Diferenciação visual pipeline vs. reunião no histórico (badge roxa)
- [x] Visualização de reunião como chat linha-a-linha no histórico
- [x] Avaliação por estrelas das sessões de pipeline
- [x] Painéis flutuantes e redimensionáveis (ChatPanel + HistoryPanel)
- [x] Modo Speech-to-Text no input
- [x] Status dos agentes em tempo real (idle/thinking/speaking/done/error)
- [x] `system_prompt_reuniao` na Aya para evitar vazamento do prompt de compilação
