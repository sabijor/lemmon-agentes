"""Renata | Social Media — Agente 7 do sistema Lemmon.

Função: pegar output da Aya e produzir linha editorial Instagram com
narrativa conectada (1-2 páginas que o cliente entende em 2 minutos).

Plataforma: apenas Instagram (Reels, Carrossel, Stories).
Cadência: 1 post por dia, igual à duracao_dias.

Arquitetura: 1 chamada API (tool_use forçado) + validação pós + saves em disco.
"""
import json as _json
import time as _time
from datetime import date, datetime, timedelta
from typing import Optional, cast

from core.agente_base import AgenteBase
from core.calendario_br import datas_na_janela
from core.config import (
    ESPELHO_CLIENTES_DIR,
    OUTPUTS_DIR,
    RENATA_DOSSIE_MAX_CHARS,
    RENATA_DURACAO_MAX_DIAS,
    RENATA_HEITOR_MAX_CHARS,
    RENATA_OUTPUT_MAX_CHARS,
    RENATA_PREVISAO_RANGE_USD,
    RENATA_ROTEIRO_MAX_CHARS,
    RENATA_SONIA_MAX_CHARS,
    RENATA_VOZ_CLIENTE_MAX_CHARS,
)
from core.tipos import AgenteResultado

MODOS_VALIDOS = ["pipeline", "solo"]

FERRAMENTA_LINHA_EDITORIAL = {
    "name": "registrar_linha_editorial",
    "description": (
        "Registra a linha editorial Instagram produzida pela Renata. "
        "Tool_use forçado — preencher todos os campos obrigatórios."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "modo_execucao": {
                "type": "string",
                "enum": ["pipeline", "solo"],
            },
            "linha_narrativa": {
                "type": "object",
                "properties": {
                    "premissa_central": {"type": "string", "maxLength": 200},
                    "arco":             {"type": "string", "maxLength": 400},
                    "escalada":         {"type": "string", "maxLength": 200},
                    "tem_arco": {
                        "type": "boolean",
                        "description": "false = campanha avulsa/institucional sem storytelling",
                    },
                },
                "required": ["tem_arco"],
            },
            "duracao_dias": {"type": "integer", "minimum": 1},
            "publicacoes": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "properties": {
                        "ordem":              {"type": "integer"},
                        "data_sugerida":      {"type": "string"},
                        "horario_recomendado":{"type": "string"},
                        "formato": {
                            "type": "string",
                            "enum": ["reels", "carrossel", "stories"],
                        },
                        "papel_na_narrativa": {"type": "string"},
                        "hook": {
                            "type": "string",
                            "maxLength": 200,
                        },
                        "legenda": {
                            "type": "string",
                            "maxLength": 800,
                            "description": (
                                "Legenda COMPLETA pronta para publicar, na voz do cliente. "
                                "Estrutura: hook (1ª linha) + corpo (2-4 parágrafos curtos, "
                                "linguagem simples, 1ª pessoa) + CTA. "
                                "Sem hashtags. Máx 800 chars."
                            ),
                        },
                        "descricao_cliente": {
                            "type": "string",
                            "maxLength": 250,
                            "description": "Orientação de produção para o cliente (o que filmar/criar, tom, visual).",
                        },
                        "cta": {"type": "string", "maxLength": 100},
                        "deriva_de": {
                            "type": "string",
                            "description": (
                                "Origem do conteúdo: 'roteiro_salles_3', "
                                "'corte_sonia_2', 'novo_para_outubro_rosa', etc."
                            ),
                        },
                        "gancho_anterior":  {"type": "string"},
                        "gancho_proxima":   {"type": "string"},
                        "contexto_sazonal": {"type": "string"},
                    },
                    "required": [
                        "ordem", "data_sugerida", "formato",
                        "hook", "legenda", "cta", "deriva_de",
                    ],
                },
            },
            "descartes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "origem":        {"type": "string"},
                        "justificativa": {"type": "string"},
                    },
                    "required": ["origem", "justificativa"],
                },
            },
            "estatisticas_mix": {
                "type": "object",
                "properties": {
                    "reels_pct":     {"type": "integer"},
                    "carrossel_pct": {"type": "integer"},
                    "stories_pct":   {"type": "integer"},
                },
            },
            "output_humano": {
                "type": "string",
                "description": "Markdown formatado para o cliente. Máx 5000 chars.",
            },
            "perguntas_clarificacao": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Somente em modo solo com contexto raso. "
                    "Vazio ([]) se gerou o editorial direto."
                ),
            },
        },
        "required": [
            "modo_execucao", "duracao_dias",
            "publicacoes", "output_humano",
        ],
    },
}


class Renata(AgenteBase):
    nome = "renata"
    versao_prompt = "v1"
    system_prompt_reuniao = (
        "Você é a Renata, Social Media da Lemmon Produções. "
        "Em reuniões você responde sobre calendário editorial, linha narrativa e estratégia "
        "de publicação no Instagram. Se o contexto for raso, faça as 3 perguntas padrão "
        "DE UMA VEZ (material disponível, cliente/duração, objetivo central). "
        "Seja direta e objetiva."
    )

    def __init__(self):
        super().__init__()

    def executar(
        self,
        modo: str,
        duracao_dias: int,
        data_inicio: Optional[date] = None,
        # Modo pipeline
        dossie_aya: Optional[str] = None,
        roteiro_salles: Optional[str] = None,
        analise_sonia: Optional[str] = None,
        diretrizes_heitor: Optional[dict] = None,
        # Modo solo
        contexto_solo: Optional[str] = None,
        # Comum
        cliente_id: Optional[str] = None,
        eventos_cliente: Optional[list] = None,
        tags: Optional[list] = None,
    ) -> AgenteResultado:
        """
        Produz linha editorial Instagram de duracao_dias dias.

        Pipeline: requer dossie_aya OU (roteiro_salles + analise_sonia).
        Solo: contexto_solo (pode ser raso — retorna perguntas).
        """
        _inicio = _time.time()

        self._validar_inputs(modo, duracao_dias, dossie_aya,
                             roteiro_salles, contexto_solo)

        if data_inicio is None:
            data_inicio = date.today() + timedelta(days=7)
        data_fim = data_inicio + timedelta(days=duracao_dias - 1)

        nichos = self._extrair_nichos_cliente(cliente_id)
        voz_cliente = self._extrair_voz_cliente(cliente_id)
        datas_comemorativas = datas_na_janela(data_inicio, data_fim, nichos)

        cmin, cmax = RENATA_PREVISAO_RANGE_USD
        self.logger.info(
            f"Renata iniciando | modo={modo} | dias={duracao_dias} | "
            f"cliente={cliente_id or '(nenhum)'} | nichos={nichos} | "
            f"voz_cliente={'sim' if voz_cliente else 'não'} | "
            f"datas_relevantes={len(datas_comemorativas)} | "
            f"custo previsto: ${cmin:.2f}–${cmax:.2f}"
        )

        prompt = self._montar_prompt(
            modo=modo,
            duracao_dias=duracao_dias,
            data_inicio=data_inicio,
            dossie_aya=dossie_aya,
            roteiro_salles=roteiro_salles,
            analise_sonia=analise_sonia,
            diretrizes_heitor=diretrizes_heitor,
            contexto_solo=contexto_solo,
            cliente_id=cliente_id,
            voz_cliente=voz_cliente,
            eventos_cliente=eventos_cliente or [],
            datas_comemorativas=datas_comemorativas,
        )

        resultado_bruto, custo = self._chamar_tool(prompt)

        resultado_validado = self._validar_resultado(resultado_bruto, duracao_dias)

        # Garante que output_humano contenha as perguntas quando modo solo retornar clarificação
        perguntas = resultado_validado.get("perguntas_clarificacao") or []
        if perguntas and "?" not in resultado_validado.get("output_humano", ""):
            resultado_validado["output_humano"] = "\n".join(
                f"{i + 1}. {p}" for i, p in enumerate(perguntas)
            )

        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        descartes_path = self._salvar_descartes(resultado_validado, ts)

        self.logger.info(f"Renata concluída | ${custo:.6f}")

        saida = {
            "output_humano":            resultado_validado["output_humano"],
            "output_tecnico":           resultado_validado,
            "modo":                     modo,
            "duracao_dias":             duracao_dias,
            "cliente_id":               cliente_id or "",
            "tags":                     tags or [],
            "fontes_consultadas":       [],
            "custo_total_usd":          round(custo, 6),
            "custo_total_brl_estimado": round(custo * 5.20, 4),
            "breakdown_custo":          {"editorial_usd": round(custo, 6)},
            "duracao_segundos":         round(_time.time() - _inicio, 2),
            "modelo_usado":             self.modelo,
            "versao_prompt":            self.versao_prompt,
            "descartes_path":           descartes_path,
            "data_inicio":              data_inicio.isoformat(),
            "data_fim":                 data_fim.isoformat(),
        }
        self.historico.registrar(saida)
        return cast(AgenteResultado, saida)

    # ── helpers privados ─────────────────────────────────────────────────────

    def _validar_inputs(
        self,
        modo: str,
        duracao_dias: int,
        dossie_aya: Optional[str],
        roteiro_salles: Optional[str],
        contexto_solo: Optional[str],
    ) -> None:
        if modo not in MODOS_VALIDOS:
            raise ValueError(f"Modo inválido: {modo!r}. Use: {MODOS_VALIDOS}")
        if not (1 <= duracao_dias <= RENATA_DURACAO_MAX_DIAS):
            raise ValueError(
                f"duracao_dias deve ser entre 1 e {RENATA_DURACAO_MAX_DIAS}."
            )
        if modo == "pipeline" and not (dossie_aya or roteiro_salles):
            raise ValueError(
                "Modo pipeline requer dossie_aya ou roteiro_salles."
            )

    def _extrair_nichos_cliente(self, cliente_id: Optional[str]) -> list[str]:
        """Lê nichos_calendario do dossie.md do cliente.

        Retorna ["nacional"] como mínimo seguro quando nenhum nicho é encontrado,
        evitando que datas_na_janela devolva todo o calendário para clientes sem config.
        """
        if not cliente_id:
            return ["nacional"]
        dossie = ESPELHO_CLIENTES_DIR / cliente_id / "dossie.md"
        if not dossie.exists():
            self.logger.warning(
                f"Renata: dossiê não encontrado para cliente '{cliente_id}' — usando nicho nacional."
            )
            return ["nacional"]
        for linha in dossie.read_text(encoding="utf-8").splitlines():
            if linha.strip().lower().startswith("nichos_calendario:"):
                raw = linha.split(":", 1)[1].strip()
                nichos = [n.strip() for n in raw.split(",") if n.strip()]
                if nichos:
                    return nichos
        self.logger.warning(
            f"Renata: nichos_calendario não definido no dossiê de '{cliente_id}' — usando nacional."
        )
        return ["nacional"]

    def _extrair_voz_cliente(self, cliente_id: Optional[str]) -> Optional[str]:
        """Lê trecho das transcrições do cliente para calibrar a voz nas descricao_cliente.

        Prioriza transcricoes.md (fala real). Fallback: primeiros chars do dossie.md.
        Retorna None se não há material disponível.
        """
        if not cliente_id:
            return None
        base = ESPELHO_CLIENTES_DIR / cliente_id
        for nome_arq in ("transcricoes.md", "dossie.md"):
            arq = base / nome_arq
            if arq.exists():
                texto = arq.read_text(encoding="utf-8")
                if len(texto) > RENATA_VOZ_CLIENTE_MAX_CHARS:
                    texto = texto[:RENATA_VOZ_CLIENTE_MAX_CHARS] + "\n[...trecho inicial]"
                return texto.strip()
        return None

    def _montar_prompt(
        self,
        modo: str,
        duracao_dias: int,
        data_inicio: date,
        dossie_aya: Optional[str],
        roteiro_salles: Optional[str],
        analise_sonia: Optional[str],
        diretrizes_heitor: Optional[dict],
        contexto_solo: Optional[str],
        cliente_id: Optional[str],
        voz_cliente: Optional[str],
        eventos_cliente: list,
        datas_comemorativas: list,
    ) -> str:
        partes: list[str] = []

        partes.append(f"MODO: {modo.upper()}\n")
        partes.append(f"DURAÇÃO: {duracao_dias} dias\n")
        partes.append(
            f"JANELA: {data_inicio.strftime('%d/%m/%Y')} a "
            f"{(data_inicio + timedelta(days=duracao_dias-1)).strftime('%d/%m/%Y')}\n"
        )
        if cliente_id:
            partes.append(f"CLIENTE: {cliente_id}\n")

        if voz_cliente:
            partes.append(
                f"\n── VOZ DO CLIENTE (use nas descricao_cliente de cada peça) ──\n"
                f"{voz_cliente}\n"
                f"── FIM DA VOZ DO CLIENTE ──\n"
            )

        if datas_comemorativas:
            partes.append("\n── DATAS COMEMORATIVAS NA JANELA ──\n")
            for d in datas_comemorativas:
                partes.append(
                    f"  {d['data'].strftime('%d/%m')} — {d['nome']} "
                    f"[{', '.join(d['tags'])}]\n"
                )

        if eventos_cliente:
            partes.append("\n── AGENDA DO CLIENTE ──\n")
            for ev in eventos_cliente:
                partes.append(f"  {ev}\n")

        if modo == "pipeline":
            if dossie_aya:
                texto = dossie_aya[:RENATA_DOSSIE_MAX_CHARS]
                if len(dossie_aya) > RENATA_DOSSIE_MAX_CHARS:
                    texto += "\n[TRUNCADO]"
                partes.append(f"\n── DOSSIÊ AYA ──\n{texto}\n")
            if roteiro_salles:
                partes.append(f"\n── ROTEIRO SALLES ──\n{roteiro_salles[:RENATA_ROTEIRO_MAX_CHARS]}\n")
            if analise_sonia:
                partes.append(f"\n── ANÁLISE SÔNIA ──\n{analise_sonia[:RENATA_SONIA_MAX_CHARS]}\n")
            if diretrizes_heitor:
                partes.append(
                    f"\n── DIRETRIZES HEITOR ──\n"
                    f"{_json.dumps(diretrizes_heitor, ensure_ascii=False, indent=2)[:RENATA_HEITOR_MAX_CHARS]}\n"
                )
        else:
            partes.append(
                f"\n── CONTEXTO OPERADOR ──\n{contexto_solo or '(não informado)'}\n"
            )

        partes.append(f"""
── INSTRUÇÕES ──
1. Produza exatamente {duracao_dias} publicações (1 por dia).
2. Mix sugerido: ~50% reels, ~30% carrossel, ~20% stories.
3. Nenhum formato deve passar de 80% do total.
4. Toda publicação deve ter `legenda` preenchida — copy completa pronta para publicar, na voz do cliente.
5. output_humano deve incluir a legenda de cada peça e ter no máximo {RENATA_OUTPUT_MAX_CHARS} chars.
6. Toda publicação deve ter deriva_de preenchido.
7. CTA específico por peça — sem hashtags.
8. Se há datas comemorativas relevantes na janela, use contexto_sazonal.
9. Se modo solo E contexto raso: retorne perguntas_clarificacao com as 3 perguntas padrão.

Use `registrar_linha_editorial`.
""")
        return "".join(partes)

    def _chamar_tool(self, prompt: str) -> tuple[dict, float]:
        """Chamada única com tool_use forçado."""
        response, custo_obj, _ = self._chamar_api(
            mensagens=[{"role": "user", "content": prompt}],
            tools=[FERRAMENTA_LINHA_EDITORIAL],
            tool_choice={"type": "tool", "name": "registrar_linha_editorial"},
        )

        resultado = None
        for bloco in response.content:
            if (
                bloco.type == "tool_use"
                and bloco.name == "registrar_linha_editorial"
            ):
                resultado = bloco.input
                break

        if resultado is None:
            raise RuntimeError("Renata: tool_use não retornado.")

        self.logger.info(f"Chamada Renata | {custo_obj.resumo()}")
        return resultado, custo_obj.custo_usd

    def _validar_resultado(self, resultado: dict, duracao_dias: int) -> dict:
        """Validações pós-execução conforme spec."""
        pubs = resultado.get("publicacoes", [])
        # Guard: model ocasionalmente serializa o array como string JSON
        if isinstance(pubs, str):
            try:
                pubs = _json.loads(pubs)
                resultado["publicacoes"] = pubs
                self.logger.warning("Renata: publicacoes chegou como string — deserializado com sucesso.")
            except Exception:
                self.logger.error("Renata: publicacoes como string inválida — publicacoes zeradas.")
                pubs = []
                resultado["publicacoes"] = pubs
        total = len(pubs)

        if total != duracao_dias:
            self.logger.warning(
                f"Renata: esperava {duracao_dias} publicações, recebeu {total}."
            )

        tem_arco = resultado.get("linha_narrativa", {}).get("tem_arco", False)
        if tem_arco:
            max_ordem = max((p.get("ordem", 0) for p in pubs), default=0)
            for pub in pubs:
                o = pub.get("ordem", 0)
                if o >= 2 and not pub.get("gancho_anterior", "").strip():
                    self.logger.warning(
                        f"Renata: publicação {o} sem gancho_anterior (tem_arco=true)."
                    )
                if o < max_ordem and not pub.get("gancho_proxima", "").strip():
                    self.logger.warning(
                        f"Renata: publicação {o} sem gancho_proxima (tem_arco=true)."
                    )

        for pub in pubs:
            if not pub.get("deriva_de", "").strip():
                self.logger.warning(
                    f"Renata: publicação {pub.get('ordem')} sem deriva_de."
                )

        # Validar mix
        mix = resultado.get("estatisticas_mix", {})
        for fmt, pct_key in [("reels", "reels_pct"), ("carrossel", "carrossel_pct"), ("stories", "stories_pct")]:
            pct = mix.get(pct_key, 0)
            if pct > 80:
                self.logger.warning(
                    f"Renata: formato '{fmt}' com {pct}% (máx sugerido: 80%)."
                )
        soma = (mix.get("reels_pct", 0) + mix.get("carrossel_pct", 0)
                + mix.get("stories_pct", 0))
        if soma and abs(soma - 100) > 2:
            self.logger.warning(f"Renata: soma dos pcts do mix = {soma} (esperado ~100).")

        # Truncar output_humano se necessário
        oh = resultado.get("output_humano", "")
        if len(oh) > RENATA_OUTPUT_MAX_CHARS:
            self.logger.warning(
                f"Renata: output_humano truncado de {len(oh)} para {RENATA_OUTPUT_MAX_CHARS} chars."
            )
            resultado["output_humano"] = oh[:RENATA_OUTPUT_MAX_CHARS]

        return resultado

    def _salvar_descartes(self, resultado: dict, ts: str) -> Optional[str]:
        """Salva descartes em outputs/renata/estoque/<ts>_descartes.txt.

        Retorna o path absoluto do arquivo gerado, ou None se não havia descartes.
        """
        descartes = resultado.get("descartes", [])
        if not descartes:
            return None
        estoque_dir = OUTPUTS_DIR / "renata" / "estoque"
        estoque_dir.mkdir(parents=True, exist_ok=True)
        arquivo = estoque_dir / f"{ts}_descartes.txt"
        linhas = [f"DESCARTES — {ts}\n", "=" * 50 + "\n"]
        for d in descartes:
            linhas.append(f"\nOrigem: {d.get('origem', '')}\n")
            linhas.append(f"Justificativa: {d.get('justificativa', '')}\n")
        arquivo.write_text("".join(linhas), encoding="utf-8")
        self.logger.info(f"Descartes salvos: {arquivo}")
        return str(arquivo)
