"""Salles | Roteirista — Agente 2 do sistema Lemmon."""
import json as _json
import time
from typing import Optional
from core.agente_base import AgenteBase
from core.validador import validar_briefing
from core.custo import Custo
from core.similaridade import buscar_casos_similares
from core.discussao import (
    construir_prompt_questionamento,
    construir_prompt_resposta_otto,
    construir_prompt_rodada_extra
)
from agentes.otto import Otto

FORMATOS_VALIDOS = {
    "documental_institucional",
    "mini_doc_marca",
    "reels_vertical",
    "video_tese",
    "aftermovie_evento",
    "auto"
}

FORMATOS_CONCRETOS = FORMATOS_VALIDOS - {"auto"}

FERRAMENTA_QUESTIONAR = {
    "name": "questionar_estrategista",
    "description": "Salles questiona Otto nas dimensões obrigatórias.",
    "input_schema": {
        "type": "object",
        "properties": {
            "concordancia_tese": {"type": "string"},
            "viabilidade_tecnica": {"type": "string"},
            "foco_narrativo": {"type": "string"}
        },
        "required": ["concordancia_tese", "viabilidade_tecnica", "foco_narrativo"]
    }
}

FERRAMENTA_RESPONDER = {
    "name": "responder_roteirista",
    "description": "Otto responde aos questionamentos do Salles.",
    "input_schema": {
        "type": "object",
        "properties": {
            "resposta_concordancia": {"type": "string"},
            "resposta_viabilidade": {"type": "string"},
            "resposta_foco": {"type": "string"},
            "tese_ajustada": {"type": "string"}
        },
        "required": ["resposta_concordancia", "resposta_viabilidade",
                     "resposta_foco", "tese_ajustada"]
    }
}

FERRAMENTA_ROTEIRO = {
    "name": "produzir_roteiro_lemmon",
    "description": "Produz roteiro Lemmon completo em 2 camadas.",
    "input_schema": {
        "type": "object",
        "properties": {
            "formato_aplicado": {
                "type": "string",
                "enum": list(FORMATOS_CONCRETOS)
            },
            "titulo_roteiro": {"type": "string"},
            "tom_inicial": {"type": "string"},
            "pre_captacao": {
                "type": "object",
                "properties": {
                    "topicos_quebra_gelo": {"type": "array", "items": {"type": "string"}},
                    "informacoes_a_descobrir": {"type": "array", "items": {"type": "string"}},
                    "tom_emocional_desejado": {"type": "string"}
                },
                "required": ["topicos_quebra_gelo", "informacoes_a_descobrir", "tom_emocional_desejado"]
            },
            "blocos": {
                "type": "array",
                "minItems": 3,
                "items": {
                    "type": "object",
                    "properties": {
                        "numero": {"type": "integer"},
                        "nome_bloco": {"type": "string"},
                        "objetivo": {"type": "string"},
                        "gatilhos_direcao": {"type": "array", "items": {"type": "string"}},
                        "pontos_interrupcao": {"type": "array", "items": {"type": "string"}},
                        "sinais_de_verdade": {"type": "array", "items": {"type": "string"}},
                        "momento_de_recuo": {"type": "string"},
                        "plano_b": {"type": "array", "items": {"type": "string"}},
                        "funcao_estrategica": {
                            "type": "string",
                            "enum": ["autoridade", "lead_generation", "posicionamento",
                                     "identificacao", "autoridade_por_contagio"]
                        },
                        "potencial_edicao": {
                            "type": "object",
                            "properties": {
                                "destinos": {
                                    "type": "array",
                                    "items": {"type": "string",
                                              "enum": ["master", "reels", "story", "all"]}
                                },
                                "duracao_estimada_segundos": {"type": "integer"},
                                "ponto_in": {"type": "string"},
                                "ponto_out": {"type": "string"}
                            },
                            "required": ["destinos", "duracao_estimada_segundos", "ponto_in", "ponto_out"]
                        },
                        "imagem_cobertura": {
                            "type": "object",
                            "properties": {
                                "detalhes_ambiente": {"type": "array", "items": {"type": "string"}},
                                "gestos_close": {"type": "array", "items": {"type": "string"}},
                                "broll_separado": {"type": "array", "items": {"type": "string"}},
                                "planos_abertos": {"type": "array", "items": {"type": "string"}}
                            },
                            "required": ["detalhes_ambiente", "gestos_close", "broll_separado", "planos_abertos"]
                        }
                    },
                    "required": ["numero", "nome_bloco", "objetivo", "gatilhos_direcao",
                                 "pontos_interrupcao", "sinais_de_verdade", "momento_de_recuo",
                                 "plano_b", "funcao_estrategica", "potencial_edicao", "imagem_cobertura"]
                }
            },
            "sequencia_captacao_sugerida": {
                "type": "array",
                "items": {"type": "integer"}
            },
            "riscos_captacao": {
                "type": "array",
                "items": {"type": "string"}
            },
            "variacoes_narrativas": {
                "type": "array",
                "items": {"type": "string"}
            }
        },
        "required": ["formato_aplicado", "titulo_roteiro", "tom_inicial", "pre_captacao",
                     "blocos", "sequencia_captacao_sugerida", "riscos_captacao",
                     "variacoes_narrativas"]
    }
}

FERRAMENTA_FORMATACAO = {
    "name": "formatar_roteiro_humano",
    "description": "Formata o roteiro técnico em markdown legível no tom Lemmon, pra ser lido pelo operador.",
    "input_schema": {
        "type": "object",
        "properties": {
            "output_humano": {
                "type": "string",
                "description": (
                    "Roteiro completo formatado em markdown, no tom Lemmon. "
                    "Apresenta as 2 camadas (roteiro base + notas estratégicas) "
                    "de forma clara, com headers, bullets e parágrafos curtos."
                )
            }
        },
        "required": ["output_humano"]
    }
}


class Salles(AgenteBase):
    nome = "salles"
    versao_prompt = "v1.2"

    def __init__(self):
        super().__init__()
        self._otto_instance = None

    @property
    def otto(self):
        if self._otto_instance is None:
            self._otto_instance = Otto()
        return self._otto_instance

    def executar(self, briefing: Optional[str] = None, formato: str = "auto",
                 analise_otto_existente: Optional[dict] = None,
                 tags: Optional[list] = None,
                 diretrizes_heitor: Optional[dict] = None) -> dict:
        """
        Pipeline completo: chama Otto se necessário → discute → produz roteiro.

        Args:
            briefing: texto do briefing. Pode ser None se analise_otto_existente
                      vier preenchida (briefing será extraído dela).
            formato: um dos FORMATOS_VALIDOS
            analise_otto_existente: análise pronta do Otto. Se passada, evita
                                    nova chamada estratégica.
            tags: tags livres pra similaridade
            diretrizes_heitor: output_tecnico do Heitor (modo cadeia)
        """
        if formato not in FORMATOS_VALIDOS:
            raise ValueError(f"Formato inválido: {formato}. Use: {FORMATOS_VALIDOS}")

        custo_total = 0.0
        breakdown_custo = {}
        analise_otto = None

        # Etapa 1: garantir análise do Otto e briefing
        if analise_otto_existente is not None:
            analise_otto = analise_otto_existente
            if briefing is None:
                briefing = analise_otto.get("briefing_original", "")
                if not briefing:
                    raise ValueError(
                        "analise_otto_existente não contém briefing_original. "
                        "Passe o briefing explicitamente."
                    )
            briefing = validar_briefing(briefing)
            self.logger.info("Usando análise Otto pré-existente.")
        else:
            if briefing is None:
                raise ValueError("briefing é obrigatório quando analise_otto_existente não é passada.")
            briefing = validar_briefing(briefing)
            self.logger.info("Chamando Otto pra produzir análise estratégica...")
            resultado_otto = self.otto.executar(briefing, modo_visual="completo")
            analise_otto = resultado_otto["output_tecnico"]
            breakdown_custo["otto_inicial_usd"] = resultado_otto["custo"]["usd"]
            custo_total += resultado_otto["custo"]["usd"]

        self.logger.info(f"Salles iniciando | formato={formato} | tags={tags}")

        # Etapa 2: Salles questiona Otto
        questionamentos, custo_q = self._questionar_otto(briefing, analise_otto, formato)
        breakdown_custo["salles_questionamento_usd"] = custo_q
        custo_total += custo_q

        # Etapa 3: Otto responde
        respostas_otto, custo_r = self._otto_responde(questionamentos, analise_otto, briefing)
        breakdown_custo["otto_resposta_usd"] = custo_r
        custo_total += custo_r

        # Etapa 4: produz roteiro (2 chamadas internas: raciocínio + formatação)
        casos_similares = self._carregar_casos_similares(formato, tags or [])
        roteiro_data, custo_p = self._produzir_roteiro(
            briefing, analise_otto, questionamentos,
            respostas_otto, formato, casos_similares,
            diretrizes_heitor=diretrizes_heitor,
        )
        breakdown_custo["salles_producao_2chamadas_usd"] = custo_p
        custo_total += custo_p

        resultado_final = {
            "output_tecnico": {k: v for k, v in roteiro_data.items() if k != "output_humano"},
            "output_humano": roteiro_data["output_humano"],
            "discussao_otto_salles": {
                "questionamentos_salles": questionamentos,
                "respostas_otto": respostas_otto
            },
            "casos_similares_usados": [c.get("timestamp") for c in casos_similares],
            "formato_solicitado": formato,
            "formato_aplicado": roteiro_data["formato_aplicado"],
            "tags": tags or [],
            "custo_total_usd": round(custo_total, 6),
            "custo_total_brl_estimado": round(custo_total * 5.20, 4),
            "breakdown_custo": breakdown_custo,
            "modelo_usado": self.modelo,
            "versao_prompt": self.versao_prompt,
            "briefing_original": briefing,
            "analise_otto_usada": analise_otto
        }

        self.historico.registrar(resultado_final)
        self.logger.info(f"Salles concluído | custo total: ${custo_total:.6f}")

        return resultado_final

    def executar_isolado(self, analise_otto: dict, formato: str = "auto",
                         tags: Optional[list] = None,
                         diretrizes_heitor: Optional[dict] = None) -> dict:
        """
        Roda Salles SEM passar pela discussão Otto. Útil quando você já
        tem análise validada e só quer produzir roteiro.

        IMPORTANTE: Sem discussão = roteiro sai direto da análise sem
        questionamento. Use apenas se a análise Otto já foi validada.
        """
        if formato not in FORMATOS_VALIDOS:
            raise ValueError(f"Formato inválido: {formato}.")

        briefing = analise_otto.get("briefing_original", "")
        if not briefing:
            raise ValueError("analise_otto sem briefing_original. Não dá pra rodar isolado.")

        self.logger.info(f"Salles isolado | formato={formato}")

        casos_similares = self._carregar_casos_similares(formato, tags or [])

        discussao_falsa = {
            "concordancia_tese": "(modo isolado — sem questionamento)",
            "viabilidade_tecnica": "(modo isolado — sem questionamento)",
            "foco_narrativo": "(modo isolado — sem questionamento)"
        }
        respostas_falsas = {
            "resposta_concordancia": "(modo isolado)",
            "resposta_viabilidade": "(modo isolado)",
            "resposta_foco": analise_otto['tese_criativa']['frase_tese'],
            "tese_ajustada": analise_otto['tese_criativa']['frase_tese']
        }

        roteiro_data, custo_p = self._produzir_roteiro(
            briefing, analise_otto, discussao_falsa,
            respostas_falsas, formato, casos_similares,
            diretrizes_heitor=diretrizes_heitor,
        )

        resultado_final = {
            "output_tecnico": {k: v for k, v in roteiro_data.items() if k != "output_humano"},
            "output_humano": roteiro_data["output_humano"],
            "modo_execucao": "isolado",
            "discussao_otto_salles": None,
            "casos_similares_usados": [c.get("timestamp") for c in casos_similares],
            "formato_solicitado": formato,
            "formato_aplicado": roteiro_data["formato_aplicado"],
            "tags": tags or [],
            "custo_total_usd": round(custo_p, 6),
            "custo_total_brl_estimado": round(custo_p * 5.20, 4),
            "breakdown_custo": {"salles_producao_isolada_2chamadas_usd": custo_p},
            "modelo_usado": self.modelo,
            "versao_prompt": self.versao_prompt,
            "briefing_original": briefing,
            "analise_otto_usada": analise_otto
        }

        self.historico.registrar(resultado_final)
        return resultado_final

    def discussao_extra(self, resultado_anterior: dict, ponto_a_discutir: str) -> dict:
        """
        Roda mais uma rodada de discussão sobre um ponto específico,
        sem refazer o roteiro inteiro.

        Args:
            resultado_anterior: resultado de uma execução anterior do Salles
            ponto_a_discutir: o que você quer que Salles questione/aprofunde

        Returns:
            dict com novos questionamentos e respostas, sem produzir novo roteiro.
            Se quiser regenerar o roteiro com a nova discussão, chame
            executar() de novo passando analise_otto_existente.
        """
        self.logger.info(f"Rodada extra de discussão | ponto: {ponto_a_discutir[:80]}")

        prompt_extra = construir_prompt_rodada_extra(resultado_anterior, ponto_a_discutir)

        response, custo_q, _ = self._chamar_api(
            mensagens=[{"role": "user", "content": prompt_extra}],
            tools=[FERRAMENTA_QUESTIONAR],
            tool_choice={"type": "tool", "name": "questionar_estrategista"}
        )

        novo_questionamento = None
        for bloco in response.content:
            if bloco.type == "tool_use":
                novo_questionamento = bloco.input
                break

        if not novo_questionamento:
            raise RuntimeError("Salles não retornou questionamento extra.")

        analise_otto = resultado_anterior["analise_otto_usada"]
        briefing = resultado_anterior["briefing_original"]
        nova_resposta, custo_r = self._otto_responde(novo_questionamento, analise_otto, briefing)

        custo_total = custo_q.custo_usd + custo_r

        return {
            "tipo": "rodada_extra",
            "ponto_discutido": ponto_a_discutir,
            "questionamento": novo_questionamento,
            "resposta_otto": nova_resposta,
            "custo_total_usd": round(custo_total, 6),
            "custo_total_brl_estimado": round(custo_total * 5.20, 4),
            "rodadas_anteriores": resultado_anterior.get("discussao_otto_salles")
        }

    def _questionar_otto(self, briefing: str, analise_otto: dict, formato: str):
        prompt = construir_prompt_questionamento(analise_otto, briefing, formato)
        response, custo, _ = self._chamar_api(
            mensagens=[{"role": "user", "content": prompt}],
            tools=[FERRAMENTA_QUESTIONAR],
            tool_choice={"type": "tool", "name": "questionar_estrategista"}
        )
        for bloco in response.content:
            if bloco.type == "tool_use":
                return bloco.input, custo.custo_usd
        raise RuntimeError("Salles não retornou questionamento via tool_use.")

    def _otto_responde(self, questionamentos: dict, analise_original: dict, briefing: str):
        prompt = construir_prompt_resposta_otto(questionamentos, analise_original, briefing)

        inicio = time.time()
        response = self.otto.client.messages.create(
            model=self.otto.modelo,
            max_tokens=self.otto.max_tokens,
            system=self.otto.system_prompt,
            messages=[{"role": "user", "content": prompt}],
            tools=[FERRAMENTA_RESPONDER],
            tool_choice={"type": "tool", "name": "responder_roteirista"}
        )
        duracao = round(time.time() - inicio, 2)

        custo = Custo.calcular(
            response.usage.input_tokens,
            response.usage.output_tokens
        )
        self.logger.info(f"Otto respondeu em {duracao}s | {custo.resumo()}")

        for bloco in response.content:
            if bloco.type == "tool_use":
                return bloco.input, custo.custo_usd
        raise RuntimeError("Otto não retornou resposta via tool_use.")

    def _carregar_casos_similares(self, formato: str, tags: list) -> list:
        avaliados = self.historico.listar_avaliados(nota_minima=4)
        if not avaliados:
            return []
        caso_atual = {"formato": formato, "tags": tags}
        return buscar_casos_similares(caso_atual, avaliados, limite=3, score_minimo=0.3)

    def _produzir_roteiro(self, briefing: str, analise_otto: dict,
                          questionamentos: dict, respostas_otto: dict,
                          formato: str, casos_similares: list,
                          diretrizes_heitor: Optional[dict] = None):
        """
        Produção em 2 etapas:
        Etapa A: Salles produz JSON técnico estruturado (raciocínio)
        Etapa B: Salles formata output_humano em markdown a partir do JSON

        Retorna: (roteiro_data, custo_total_usd)
        """
        contexto_similares = self._montar_contexto_similares(casos_similares)

        formato_pra_prompt = formato
        if formato == "auto":
            formato_pra_prompt = "auto (você decide baseado na análise do Otto)"

        # Monta bloco de compliance se Heitor foi consultado
        contexto_heitor = ""
        if diretrizes_heitor:
            diretrizes = diretrizes_heitor.get("diretrizes_para_salles", [])
            termos_evitar = diretrizes_heitor.get("termos_evitar", [])
            termos_contexto = diretrizes_heitor.get("termos_permitidos_com_contexto", [])
            risco = diretrizes_heitor.get("risco_geral", "?")

            partes = [
                "\n\nDIRETRIZES DE COMPLIANCE (HEITOR):",
                f"- Risco geral identificado: {risco}",
                "- Diretrizes pro roteiro:",
            ]
            partes.extend(f"  • {d}" for d in diretrizes)
            partes.append("- Termos a evitar:")
            partes.extend(f"  • {t}" for t in termos_evitar)
            partes.append("- Termos permitidos COM CONTEXTUALIZAÇÃO:")
            partes.extend(
                f"  • {t['termo']} — {t['contexto_necessario']}"
                for t in termos_contexto
            )
            partes.append(
                "\nVocê pode discordar de Heitor. Mas se discordar, registre "
                "ressalva inline no bloco afetado (formato: "
                "'⚠️ HEITOR sinalizou:' + 'Decisão Salles:' + 'Justificativa criativa:')."
            )
            contexto_heitor = "\n".join(partes)

        # ===== ETAPA A: PRODUÇÃO DO JSON TÉCNICO =====
        prompt_raciocinio = f"""Briefing original:
{briefing}

Análise estratégica do Otto:
- Tese: {analise_otto['tese_criativa']['frase_tese']}
- Conceito: {analise_otto['conceito']['titulo']}
- Estrutura sugerida: {analise_otto['traducao_pratica']['estrutura_episodio']}
- Sistema de conteúdo: {analise_otto['traducao_pratica']['sistema_conteudo']}

Discussão Otto-Salles:
- Salles questionou tese: {questionamentos['concordancia_tese']}
- Otto respondeu: {respostas_otto['resposta_concordancia']}
- Salles questionou viabilidade: {questionamentos['viabilidade_tecnica']}
- Otto respondeu: {respostas_otto['resposta_viabilidade']}
- Foco narrativo final acordado: {respostas_otto['resposta_foco']}
- Tese final: {respostas_otto['tese_ajustada']}

FORMATO SOLICITADO PRO ROTEIRO: {formato_pra_prompt}
{contexto_similares}{contexto_heitor}

ETAPA 1 DE 2 — RACIOCÍNIO ESTRUTURADO

Produza APENAS o roteiro técnico estruturado (sem versão em markdown ainda). \
Aplique RIGOROSAMENTE o método de direção Lemmon (espelhamento, sinais de \
verdade, momento de recuo, planos B) e a regra de captação + edição combinadas.

Cada bloco deve ter TODOS os campos obrigatórios completos.

Se o formato solicitado foi "auto", use as regras de mapeamento do seu prompt \
de sistema pra escolher um formato concreto.

Use a ferramenta `produzir_roteiro_lemmon`.
"""

        response_a, custo_a, _ = self._chamar_api(
            mensagens=[{"role": "user", "content": prompt_raciocinio}],
            tools=[FERRAMENTA_ROTEIRO],
            tool_choice={"type": "tool", "name": "produzir_roteiro_lemmon"}
        )

        roteiro_tecnico = None
        for bloco in response_a.content:
            if bloco.type == "tool_use":
                roteiro_tecnico = bloco.input
                break

        if roteiro_tecnico is None:
            raise RuntimeError("Salles não retornou roteiro técnico via tool_use.")

        self.logger.info(
            f"Etapa A concluída | tokens: "
            f"{response_a.usage.input_tokens} in / {response_a.usage.output_tokens} out"
        )

        # ===== ETAPA B: FORMATAÇÃO HUMANA =====
        roteiro_json_str = _json.dumps(roteiro_tecnico, ensure_ascii=False, indent=2)

        prompt_formatacao = f"""ETAPA 2 DE 2 — FORMATAÇÃO HUMANA

Você produziu este roteiro técnico estruturado:

```json
{roteiro_json_str}
```

Agora formate este roteiro em MARKDOWN legível, no tom Lemmon, pra ser lido \
pelo operador (Calebe).

DIRETRIZES DE FORMATAÇÃO:

1. Apresente as DUAS CAMADAS claramente separadas:
   - CAMADA 1 — ROTEIRO BASE (filmável): pré-captação, tom inicial, blocos
   - CAMADA 2 — NOTAS ESTRATÉGICAS: função, edição, cobertura, riscos, variações

2. Para cada bloco, mostre de forma legível:
   - Nome e número
   - Objetivo (o que precisa sair na fala)
   - Gatilhos de direção (em bullets)
   - Pontos de interrupção (em bullets)
   - Sinais de verdade (em bullets)
   - Momento de recuo
   - Plano B (em bullets)

3. Mantenha o TOM LEMMON:
   - Frases curtas, diretas
   - Sem rodeio, sem auto-elogio
   - Use estrutura de oposição quando fizer sentido ("não X. É Y.")
   - Vocabulário Lemmon: verdade, direção, escuta, presença, recuo, gancho

4. Use markdown bem (headers ##, ###, bullets *, negrito **).

5. NÃO invente conteúdo novo — apenas formate o que está no JSON.

6. NÃO repita o JSON no markdown — transforme em prosa documental dirigida.

Use a ferramenta `formatar_roteiro_humano`.
"""

        response_b, custo_b, _ = self._chamar_api(
            mensagens=[{"role": "user", "content": prompt_formatacao}],
            tools=[FERRAMENTA_FORMATACAO],
            tool_choice={"type": "tool", "name": "formatar_roteiro_humano"}
        )

        output_humano = None
        for bloco in response_b.content:
            if bloco.type == "tool_use":
                output_humano = bloco.input.get("output_humano")
                break

        if not output_humano:
            raise RuntimeError("Salles não retornou output_humano formatado via tool_use.")

        self.logger.info(
            f"Etapa B concluída | tokens: "
            f"{response_b.usage.input_tokens} in / {response_b.usage.output_tokens} out"
        )

        roteiro_completo = dict(roteiro_tecnico)
        roteiro_completo["output_humano"] = output_humano

        custo_total_producao = custo_a.custo_usd + custo_b.custo_usd

        return roteiro_completo, custo_total_producao

    def _montar_contexto_similares(self, casos_similares: list) -> str:
        if not casos_similares:
            return ""

        contexto = "\n\nCASOS PASSADOS BEM AVALIADOS (referência de estilo):\n"
        for i, caso in enumerate(casos_similares, 1):
            contexto += f"\n--- Caso {i} ---\n"
            contexto += f"Formato: {caso.get('formato_aplicado', '?')}\n"
            obs = caso.get('observacoes_operador', '')
            if obs:
                contexto += f"Observações do operador: {obs}\n"
            cor = caso.get('correcoes_aplicadas', '')
            if cor:
                contexto += f"Correções que o operador fez ao usar: {cor}\n"
        return contexto
