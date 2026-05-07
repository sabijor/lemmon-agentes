"""WebSocket /ws/chat — pipeline principal de agentes."""
import asyncio
import re
from collections import Counter

from fastapi import WebSocket, WebSocketDisconnect

from agentes.aya import Aya
from agentes.heitor import Heitor
from agentes.otto import Otto
from agentes.pedro_abrahao import PedroAbrahao
from agentes.renata import Renata
from agentes.salles import Salles
from agentes.sonia import Sonia
from api.deps import _anthropic_client, _log
from api.storage import _salvar_sessao
from api.ws_helpers import _make_confirmacao_callback, _stream


async def chat(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_json()
            names: list[str] = data.get("agents", [])
            briefing: str = data.get("message", "").strip()
            if not briefing or not names:
                continue

            # Se houver imagem anexada, descreve com visão e injeta no briefing
            image_base64: str | None = data.get("image_base64")
            image_media_type: str = data.get("image_media_type", "image/jpeg")
            if image_base64:
                try:
                    _resp = _anthropic_client.messages.create(
                        model="claude-haiku-4-5-20251001",
                        max_tokens=600,
                        messages=[{
                            "role": "user",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": image_media_type,
                                        "data": image_base64,
                                    },
                                },
                                {
                                    "type": "text",
                                    "text": (
                                        "Descreva esta imagem com detalhes relevantes para "
                                        "criação de conteúdo de vídeo/marketing. Inclua: "
                                        "elementos visuais, texto visível, cores, contexto "
                                        "e mood/atmosfera. Seja objetivo e completo."
                                    ),
                                },
                            ],
                        }],
                    )
                    descricao = _resp.content[0].text
                    briefing = (
                        f"{briefing}\n\n"
                        f"[CONTEXTO VISUAL — Imagem enviada pelo operador]\n"
                        f"{descricao}\n"
                        f"[FIM DO CONTEXTO VISUAL]"
                    )
                except Exception:
                    pass  # não bloqueia se a visão falhar

            manual_mode: bool = data.get("manual_mode", False)
            fast_track: bool = data.get("fast_track", False)
            sandbox: bool = data.get("sandbox", False)
            custo_cap_usd: float | None = data.get("custo_cap_usd") or None
            config: dict = data.get("config", {})
            loop = asyncio.get_running_loop()

            # Retomada de sessão anterior: restaura contexto técnico
            resume_context: dict = data.get("resume_context") or {}
            analise_otto = resume_context.get("analise_otto") or None
            diretrizes_heitor = resume_context.get("diretrizes_heitor") or None
            roteiro_salles = resume_context.get("roteiro_salles") or None

            # Herda respostas anteriores para que a sessão salva fique completa
            respostas: dict[str, str] = dict(resume_context.get("respostas", {}))
            custos: dict[str, float] = dict(resume_context.get("custos_usd", {}))
            duracoes: dict[str, float] = {}
            pipeline_cancelled = False
            heitor_risco_vermelho = False  # T29: roteamento condicional

            # Se resume_context tem briefing e o usuário não digitou nada novo, mantém o original
            if resume_context.get("briefing") and briefing == resume_context["briefing"]:
                pass  # briefing já é o original
            elif resume_context.get("briefing") and briefing:
                briefing = f"{resume_context['briefing']}\n\n[INSTRUÇÃO ADICIONAL]: {briefing}"
            elif resume_context.get("briefing"):
                briefing = resume_context["briefing"]

            # Config helpers
            cfg_otto   = config.get("otto", {})
            cfg_heitor = config.get("heitor", {})
            cfg_salles = config.get("salles", {})
            cfg_sonia  = config.get("sonia", {})
            cfg_renata = config.get("renata", {})

            # T26: Fast-track força Otto resumido
            if fast_track:
                cfg_otto = {**cfg_otto, "modo_visual": "resumido"}

            async def _run_agent_step(name: str) -> tuple[str, float] | None:
                """Executa um agente e retorna (text, cost) ou None se cancelado/pulado."""
                nonlocal analise_otto, diretrizes_heitor, roteiro_salles

                if name == "otto":
                    ag = Otto()
                    modo_visual = cfg_otto.get("modo_visual", "completo")
                    res = await loop.run_in_executor(
                        None, lambda: ag.executar(briefing, modo_visual=modo_visual)
                    )
                    analise_otto = res.get("output_tecnico", {})
                    analise_otto["briefing_original"] = briefing
                    return res.get("output_humano", ""), res.get("custo_total_usd", 0)

                elif name == "heitor":
                    nonlocal heitor_risco_vermelho
                    ag = Heitor()
                    max_buscas = int(cfg_heitor.get("max_buscas", 3))
                    cb = _make_confirmacao_callback(ws, loop, "heitor")
                    res = await loop.run_in_executor(
                        None,
                        lambda: ag.executar(
                            conteudo=briefing,
                            modo="cadeia",
                            modo_saida="log",
                            max_buscas=max_buscas,
                            contexto_otto=analise_otto or {},
                            confirmacao_callback=cb,
                        ),
                    )
                    if res and not res.get("cancelado"):
                        diretrizes_heitor = res.get("output_tecnico")
                        output_humano = res.get("output_humano", "")
                        # T29: detectar risco vermelho para routing condicional
                        _risco = (diretrizes_heitor or {}).get("risco_geral", "") if isinstance(diretrizes_heitor, dict) else ""
                        if _risco.lower() in ("vermelho", "red", "high") or "🔴" in output_humano:
                            heitor_risco_vermelho = True
                            await ws.send_json({"type": "routing_condicional", "motivo": "heitor_risco_vermelho",
                                                "mensagem": "🔴 Risco vermelho detectado — Salles será instruído a adotar modo seguro automaticamente."})
                        return output_humano, res.get("custo_total_usd", 0)
                    return "Análise de compliance cancelada.", 0

                elif name == "salles":
                    ag = Salles()
                    formato = cfg_salles.get("formato", "auto")
                    # T29: modo seguro se Heitor sinalizou risco vermelho
                    briefing_salles = briefing
                    if heitor_risco_vermelho:
                        briefing_salles = (
                            briefing + "\n\n[MODO SEGURO ATIVADO POR RISCO HEITOR]: "
                            "Evite qualquer claim terapêutico, promessa de resultado, "
                            "linguagem de antes/depois. Use linguagem de awareness e educação "
                            "apenas. Heitor identificou risco vermelho de compliance neste briefing."
                        )
                    res = await loop.run_in_executor(
                        None,
                        lambda: ag.executar(
                            briefing=briefing_salles,
                            formato=formato,
                            analise_otto_existente=analise_otto,
                            diretrizes_heitor=diretrizes_heitor,
                        ),
                    )
                    roteiro_salles = res.get("output_humano", "")
                    return roteiro_salles, res.get("custo_total_usd", 0)

                elif name == "sonia":
                    ag = Sonia()
                    roteiro = roteiro_salles or briefing
                    com_busca = bool(cfg_sonia.get("com_busca", False))
                    usar_tendencias = bool(cfg_sonia.get("usar_tendencias", True))
                    cb = _make_confirmacao_callback(ws, loop, "sonia")
                    res = await loop.run_in_executor(
                        None,
                        lambda: ag.executar(
                            roteiro=roteiro,
                            modo="solo",
                            com_busca=com_busca,
                            usar_tendencias=usar_tendencias,
                            contexto_otto=analise_otto,
                            contexto_heitor=diretrizes_heitor,
                            confirmacao_callback=cb,
                        ),
                    )
                    if res and not res.get("cancelado"):
                        return res.get("output_humano", ""), res.get("custo_total_usd", 0)
                    return "Análise de performance cancelada.", 0

                elif name == "aya":
                    ag = Aya()
                    nome_projeto = briefing[:60] if briefing else None
                    # Sempre passa os 4 agentes; None = ausente nesta sessão
                    # (Aya não vai buscar no disco para os ausentes)
                    snap_outputs: dict[str, dict | None] = {
                        "otto": {
                            "output_humano": respostas.get("otto", ""),
                            "output_tecnico": analise_otto,
                        } if analise_otto is not None else None,
                        "heitor": {
                            "output_humano": respostas.get("heitor", ""),
                            "output_tecnico": diretrizes_heitor or {},
                        } if diretrizes_heitor else None,
                        "salles": {
                            "output_humano": roteiro_salles,
                            "output_tecnico": {},
                        } if roteiro_salles else None,
                        "sonia": {
                            "output_humano": respostas.get("sonia", ""),
                            "output_tecnico": {},
                        } if "sonia" in respostas else None,
                    }
                    res = await loop.run_in_executor(
                        None,
                        lambda: ag.executar(
                            nome_projeto=nome_projeto,
                            outputs_diretos=snap_outputs,
                        ),
                    )
                    return res.get("output_humano", ""), res.get("custo_total_usd", 0)

                elif name == "renata":
                    ag = Renata()
                    duracao_dias = int(cfg_renata.get("duracao_dias", 14))
                    # cliente_id: detecta de resume_context ou config
                    _cliente_id = (
                        resume_context.get("cliente_id")
                        or cfg_renata.get("cliente_id")
                        or None
                    )
                    # Dossiê da Aya nesta sessão tem prioridade; fallback: auto-detect no historico
                    _dossie_aya = respostas.get("aya") or None
                    _rot_salles = roteiro_salles or None
                    _an_sonia   = respostas.get("sonia") or None
                    _dir_heitor = diretrizes_heitor or None
                    # Se não há contexto de pipeline, cai em modo solo com o briefing
                    _has_pipeline_context = bool(_dossie_aya or _rot_salles)
                    _modo = "pipeline" if _has_pipeline_context else "solo"
                    _ctx_solo = briefing if not _has_pipeline_context else None
                    res = await loop.run_in_executor(
                        None,
                        lambda: ag.executar(
                            modo=_modo,
                            duracao_dias=duracao_dias,
                            dossie_aya=_dossie_aya,
                            roteiro_salles=_rot_salles,
                            analise_sonia=_an_sonia,
                            diretrizes_heitor=_dir_heitor,
                            cliente_id=_cliente_id,
                            contexto_solo=_ctx_solo,
                        ),
                    )
                    return res.get("output_humano", ""), res.get("custo_total_usd", 0)

                return None

            async def _execute_with_approval(name: str) -> bool:
                """Executa agente com loop de retry em modo manual. Retorna False se pipeline cancelado."""
                nonlocal pipeline_cancelled
                while True:
                    await ws.send_json({"type": "agent_start", "agent": name})
                    try:
                        _t0 = asyncio.get_event_loop().time()
                        result = await _run_agent_step(name)
                        if result is None:
                            return True
                        text, cost = result
                        duracoes[name] = round(asyncio.get_event_loop().time() - _t0, 1)
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
                                continue  # reinicia o while
                            elif action == "cancel":
                                pipeline_cancelled = True
                                return False
                            else:  # skip
                                return True
                        else:
                            await ws.send_json({"type": "agent_error", "agent": name, "error": str(e)})
                            return True

            async def _run_gate_espelho() -> bool:
                """Roda Pedro como gate de qualidade após Salles. Retorna False se pipeline cancelado."""
                nonlocal pipeline_cancelled
                gate_mode = cfg_salles.get("gate_espelho", "off")
                if gate_mode == "off" or not roteiro_salles:
                    return True
                await ws.send_json({"type": "agent_start", "agent": "gate_espelho"})
                try:
                    pedro = PedroAbrahao()
                    gate_res = await loop.run_in_executor(
                        None,
                        lambda: pedro.executar(
                            pergunta="Valide se o roteiro abaixo está fiel à minha voz, posicionamento e tom.",
                            contexto_opcional=roteiro_salles,
                            modo="validacao",
                            tags=["gate_pipeline"],
                        ),
                    )
                    gate_text = gate_res.get("output_humano", "")
                    gate_cost = gate_res.get("custo_total_usd", 0)
                    veredicto = "verde"
                    if "🔴" in gate_text:
                        veredicto = "vermelho"
                    elif "🟡" in gate_text:
                        veredicto = "amarelo"
                    respostas["gate_espelho"] = gate_text
                    custos["gate_espelho"] = gate_cost
                    await ws.send_json({
                        "type": "gate_espelho_result",
                        "veredicto": veredicto,
                        "cost": gate_cost,
                    })
                    await _stream(ws, "gate_espelho", gate_text)
                    await ws.send_json({"type": "agent_done", "agent": "gate_espelho", "cost": gate_cost})
                    # Bloqueia se vermelho em modo auto, ou sempre em modo manual
                    if veredicto == "vermelho" or gate_mode == "manual":
                        emoji = "🔴" if veredicto == "vermelho" else "🟡"
                        msg = (
                            f"{emoji} Gate Espelho — veredicto {veredicto}.\n"
                            f"Pedro flagrou problemas de voz/posicionamento.\n\n"
                            f"{gate_text[:500]}\n\nContinuar para Sônia mesmo assim?"
                        )
                        await ws.send_json({"type": "confirmar", "agent": "gate_espelho", "mensagem": msg})
                        ctrl = await ws.receive_json()
                        if ctrl.get("type") != "confirmar_sim":
                            pipeline_cancelled = True
                            return False
                    return True
                except Exception as e:
                    await ws.send_json({"type": "agent_error", "agent": "gate_espelho", "error": str(e)})
                    return True  # gate falhou, não bloqueia

            custo_cap_autorizado = custo_cap_usd  # pode ser aumentado por autorizações

            async def _verificar_custo_cap() -> bool:
                """T30: verifica custo acumulado vs cap. Retorna False se pipeline cancelado."""
                nonlocal pipeline_cancelled, custo_cap_autorizado
                if custo_cap_autorizado is None:
                    return True
                total_atual = sum(custos.values())
                pct = total_atual / custo_cap_autorizado
                if pct >= 0.8 and pct < 1.0:
                    await ws.send_json({
                        "type": "custo_aviso",
                        "total_atual": round(total_atual, 5),
                        "cap": custo_cap_autorizado,
                        "pct": round(pct * 100),
                    })
                elif pct >= 1.0:
                    await ws.send_json({
                        "type": "custo_cap_atingido",
                        "total_atual": round(total_atual, 5),
                        "cap": custo_cap_autorizado,
                    })
                    ctrl = await ws.receive_json()
                    if ctrl.get("type") == "autorizar_custo":
                        custo_cap_autorizado += max(0.1, float(ctrl.get("valor", 0.5)))
                    else:
                        pipeline_cancelled = True
                        return False
                return True

            async def _run_salles_alternativas() -> bool:
                """T24: roda Salles 3x com variações e combina para Sônia. Retorna False se cancelado."""
                nonlocal roteiro_salles, pipeline_cancelled
                variacoes = [
                    ("padrão", ""),
                    ("impactante e direto", " [VARIAÇÃO: estilo mais impactante, hooks agressivos, ritmo acelerado, foco em conversão]"),
                    ("emocional e pessoal", " [VARIAÇÃO: estilo emocional e testemunhal, tom íntimo, foco em conexão humana]"),
                ]
                formato = cfg_salles.get("formato", "auto")
                todos_textos: list[str] = []
                for idx, (label, hint) in enumerate(variacoes):
                    variant_id = f"salles_v{idx+1}"
                    bv = briefing + hint
                    await ws.send_json({"type": "agent_start", "agent": variant_id})
                    try:
                        ag_s = Salles()
                        res_s = await loop.run_in_executor(
                            None,
                            lambda bv=bv: ag_s.executar(
                                briefing=bv,
                                formato=formato,
                                analise_otto_existente=analise_otto,
                                diretrizes_heitor=diretrizes_heitor,
                            ),
                        )
                        texto_s = f"**Variante {idx+1} — {label}**\n\n" + res_s.get("output_humano", "")
                        custo_s = res_s.get("custo_total_usd", 0)
                        todos_textos.append(res_s.get("output_humano", ""))
                        custos[f"salles_v{idx+1}"] = custo_s
                        await _stream(ws, variant_id, texto_s)
                        if manual_mode and idx == len(variacoes) - 1:
                            await ws.send_json({"type": "agent_done", "agent": variant_id, "cost": custo_s, "awaiting_approval": True})
                            ctrl = await ws.receive_json()
                            if ctrl.get("type") == "cancel":
                                pipeline_cancelled = True
                                return False
                        else:
                            await ws.send_json({"type": "agent_done", "agent": variant_id, "cost": custo_s})
                    except Exception as e:
                        await ws.send_json({"type": "agent_error", "agent": variant_id, "error": str(e)})
                        return True
                roteiro_salles = "\n\n---\n\n".join(
                    [f"## Variante {i+1}\n\n{t}" for i, t in enumerate(todos_textos)]
                )
                respostas["salles"] = roteiro_salles
                return True

            for name in names:
                if name in ("aya", "renata"):  # executadas fora do loop, em ordem garantida
                    continue

                # T26: Fast-track — pula Heitor com aviso
                if fast_track and name == "heitor":
                    aviso = "⚡ **Fast-track ativo** — Heitor pulado. Valide compliance manualmente antes de publicar."
                    respostas["heitor"] = aviso
                    await ws.send_json({"type": "agent_start", "agent": "heitor"})
                    await _stream(ws, "heitor", aviso)
                    await ws.send_json({"type": "agent_done", "agent": "heitor", "cost": 0})
                    continue

                # T24: A/B alternativas para Salles
                if name == "salles" and int(cfg_salles.get("alternativas", 0)) >= 3 and not pipeline_cancelled:
                    ok = await _run_salles_alternativas()
                else:
                    ok = await _execute_with_approval(name)
                if not ok:
                    break
                # T30: verificar custo-cap após cada agente
                if not await _verificar_custo_cap():
                    break
                # Gate de espelho Pedro entre Salles e Sônia (skip em fast_track)
                if name == "salles" and not pipeline_cancelled and not fast_track:
                    ok = await _run_gate_espelho()
                    if not ok:
                        break

            # Aya compila os outputs dos outros agentes (sempre por último)
            if "aya" in names and not pipeline_cancelled:
                ok = await _execute_with_approval("aya")
                _ = ok

            # Renata produz linha editorial (após Aya, se incluída via config ou selecionada)
            if ("renata" in names or cfg_renata.get("incluir", False)) and not pipeline_cancelled:
                ok = await _execute_with_approval("renata")
                _ = ok

            # Salva sessão completa e envia o ID para o frontend avaliar
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
            # T27: sandbox — não salva no histórico
            if not sandbox:
                session_path = _salvar_sessao(briefing, all_agents, respostas, custos, contexto_tecnico, duracoes=duracoes)
                session_id = session_path.stem
            else:
                session_id = None

            # Sugerir tags automaticamente via Aya (T15) — nunca em sandbox
            if not pipeline_cancelled and respostas and not sandbox:
                try:
                    _haiku = _anthropic_client.messages.create(
                        model="claude-haiku-4-5-20251001",
                        max_tokens=120,
                        messages=[{
                            "role": "user",
                            "content": (
                                f"Briefing: {briefing[:300]}\n"
                                f"Agentes: {', '.join(all_agents)}\n\n"
                                "Liste 3 a 5 tags curtas (1-3 palavras cada) que descrevem esta sessão. "
                                "Responda APENAS as tags separadas por vírgula, sem explicação. "
                                "Ex: reels, hator, compliance, tese-identidade"
                            ),
                        }],
                    )
                    raw_tags = next((b.text for b in _haiku.content if hasattr(b, "text")), "")
                    tags_sugeridas = [t.strip().lower().replace(" ", "-") for t in raw_tags.split(",") if t.strip()][:5]
                    await ws.send_json({"type": "tags_sugeridas", "tags": tags_sugeridas, "session_id": session_id})
                except Exception as _tag_err:
                    _log.warning("tags_sugeridas falhou (%s): %s", type(_tag_err).__name__, _tag_err)
                    # fallback heurístico: palavras mais frequentes do briefing
                    _STOPWORDS = {"de", "da", "do", "e", "o", "a", "os", "as", "em", "um", "uma",
                                  "para", "com", "que", "se", "por", "na", "no", "ao", "mais",
                                  "este", "essa", "isso", "como", "mas", "ou", "seu", "sua"}
                    _palavras = [w.lower() for w in re.findall(r'\b[a-záéíóúãõâêîôûç]{4,}\b', briefing)]
                    _freq = Counter(w for w in _palavras if w not in _STOPWORDS)
                    _tags_fb = [f"auto:{w}" for w, _ in _freq.most_common(3)]
                    if _tags_fb:
                        await ws.send_json({"type": "tags_sugeridas", "tags": _tags_fb, "session_id": session_id})
                    await ws.send_json({"type": "tags_sugeridas_falhou", "detail": str(_tag_err)[:200]})

            await ws.send_json({"type": "pipeline_done", "session_id": session_id})

    except WebSocketDisconnect:
        pass
