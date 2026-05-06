"""Otto | Estrategista — Agente 1 do sistema Lemmon."""
from core.agente_base import AgenteBase
from core.validador import validar_briefing, validar_modo_visual

# Schema da ferramenta forçada (structured output via tool use)
FERRAMENTA_ANALISE = {
    "name": "registrar_analise_estrategica",
    "description": (
        "Registra análise estratégica completa do briefing seguindo "
        "o método Lemmon. Use SEMPRE esta ferramenta para responder."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "leitura_estrategica": {
                "type": "object",
                "properties": {
                    "o_que_cliente_pediu": {"type": "string"},
                    "o_que_cliente_nao_disse": {"type": "string"},
                    "conflito_central": {"type": "string"},
                    "inseguranca_do_cliente": {"type": "string"},
                    "armadilha_do_obvio": {"type": "string"}
                },
                "required": ["o_que_cliente_pediu", "o_que_cliente_nao_disse",
                             "conflito_central", "inseguranca_do_cliente",
                             "armadilha_do_obvio"]
            },
            "tese_criativa": {
                "type": "object",
                "properties": {
                    "frase_tese": {"type": "string"},
                    "principio_norteador": {"type": "string"},
                    "ruptura_proposta": {"type": "string"}
                },
                "required": ["frase_tese", "principio_norteador", "ruptura_proposta"]
            },
            "conceito": {
                "type": "object",
                "properties": {
                    "titulo": {"type": "string"},
                    "descricao": {"type": "string"},
                    "papel_da_marca": {"type": "string"}
                },
                "required": ["titulo", "descricao", "papel_da_marca"]
            },
            "mecanismo_estrategico": {
                "type": "object",
                "properties": {
                    "por_que_funciona": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 3
                    }
                },
                "required": ["por_que_funciona"]
            },
            "traducao_pratica": {
                "type": "object",
                "properties": {
                    "estrutura_episodio": {
                        "type": "array",
                        "items": {"type": "string"}
                    },
                    "direcao_criativa": {
                        "type": "array",
                        "items": {"type": "string"}
                    },
                    "sistema_conteudo": {"type": "string"}
                },
                "required": ["estrutura_episodio", "direcao_criativa", "sistema_conteudo"]
            },
            "objetivo_real": {"type": "string"},
            "metadata": {
                "type": "object",
                "properties": {
                    "complexidade_briefing": {
                        "type": "string",
                        "enum": ["simples", "media", "complexa"]
                    },
                    "modo_recomendado": {
                        "type": "string",
                        "enum": ["resumo", "completo"]
                    }
                },
                "required": ["complexidade_briefing", "modo_recomendado"]
            },
            "output_humano": {
                "type": "string",
                "description": (
                    "Versão formatada para leitura humana, no tom Lemmon. "
                    "Conforme o modo_visual solicitado: 'resumo' = só tese + "
                    "conceito; 'completo' = tudo. Use markdown leve."
                )
            }
        },
        "required": ["leitura_estrategica", "tese_criativa", "conceito",
                     "mecanismo_estrategico", "traducao_pratica",
                     "objetivo_real", "metadata", "output_humano"]
    }
}

class Otto(AgenteBase):
    nome = "otto"
    versao_prompt = "v3"

    def executar(self, briefing: str, modo_visual: str = "auto",
                 contexto_extra: str = "") -> dict:
        briefing = validar_briefing(briefing)
        modo_visual = validar_modo_visual(modo_visual)

        self.logger.info(f"Executando Otto | modo={modo_visual} | "
                         f"briefing={len(briefing)} chars")

        mensagem = self._construir_mensagem(briefing, modo_visual, contexto_extra)

        response, custo, duracao = self._chamar_api(
            mensagens=[{"role": "user", "content": mensagem}],
            tools=[FERRAMENTA_ANALISE],
            tool_choice={"type": "tool", "name": "registrar_analise_estrategica"}
        )

        # Extrai tool_use block
        analise = None
        for bloco in response.content:
            if bloco.type == "tool_use" and bloco.name == "registrar_analise_estrategica":
                analise = bloco.input
                break

        if analise is None:
            raise RuntimeError(
                "Otto não retornou análise via tool_use. "
                "Resposta inesperada da API."
            )

        resultado = {
            "output_tecnico": {k: v for k, v in analise.items() if k != "output_humano"},
            "output_humano": analise["output_humano"],
            "modo_solicitado": modo_visual,
            "modo_efetivo": analise["metadata"]["modo_recomendado"] if modo_visual == "auto" else modo_visual,
            "custo": {
                "tokens_input": custo.tokens_input,
                "tokens_output": custo.tokens_output,
                "usd": custo.custo_usd,
                "brl_estimado": custo.custo_brl_estimado
            },
            "custo_total_usd": custo.custo_usd,
            "duracao_segundos": duracao,
            "modelo_usado": self.modelo,
            "versao_prompt": self.versao_prompt,
            "briefing_original": briefing
        }

        # Camada 2: salva histórico
        arquivo_hist = self.historico.registrar(resultado)
        self.logger.info(f"Histórico salvo em: {arquivo_hist.name}")

        return resultado

    def _construir_mensagem(self, briefing: str, modo_visual: str,
                            contexto_extra: str) -> str:
        partes = [
            "Você recebeu o seguinte briefing de cliente:",
            "---",
            briefing,
            "---",
            f"\nMODO VISUAL SOLICITADO: {modo_visual}"
        ]
        if contexto_extra:
            partes.append(f"\nCONTEXTO ADICIONAL: {contexto_extra}")
        partes.append(
            "\nProcesse esse briefing usando seu método Lemmon completo "
            "e registre a análise via ferramenta `registrar_analise_estrategica`."
        )
        return "\n".join(partes)
