"""Heitor | Compliance Meta — Agente 3 do sistema Lemmon.

Arquitetura: 3 chamadas separadas à API
1. Análise com web_search (texto livre + citações)
2. Estruturação em JSON (sem busca, tool_choice forçado)
3. Formatação humana (sem busca, tool_choice forçado)

Sistema de avisos em 3 camadas (pré, durante, pós-execução).
"""
import json as _json
import time
from typing import Optional, cast

from core.agente_base import AgenteBase
from core.config import HEITOR_MAX_BUSCAS_DEFAULT
from core.limites_heitor import (
    aviso_amarelo,
    aviso_pos_execucao,
    aviso_pre_execucao,
)
from core.tipos import AgenteResultado
from core.web_search_helper import (
    construir_tool_web_search_amplo,
    construir_tool_web_search_oficial,
    contar_buscas_realizadas,
    extrair_fontes_consultadas,
    extrair_texto_raciocinio,
)

MODOS_VALIDOS = ["solo", "cadeia", "auditor"]
MODOS_SAIDA = ["log", "analise", "auto"]


FERRAMENTA_ANALISE_HEITOR = {
    "name": "registrar_analise_compliance",
    "description": (
        "Estrutura a análise de compliance Meta em formato JSON, "
        "com classificação por elemento e fundamentação."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "nicho_identificado": {"type": "string"},
            "orgaos_relevantes": {
                "type": "array",
                "items": {"type": "string"}
            },
            "politicas_meta_aplicaveis": {
                "type": "array",
                "items": {"type": "string"}
            },
            "elementos_analisados": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "properties": {
                        "elemento": {"type": "string"},
                        "classificacao": {
                            "type": "string",
                            "enum": ["verde", "amarelo", "vermelho"]
                        },
                        "fundamentacao": {"type": "string"},
                        "recomendacao": {"type": "string"},
                        "fonte_referencia": {"type": "string"}
                    },
                    "required": [
                        "elemento", "classificacao", "fundamentacao",
                        "recomendacao", "fonte_referencia"
                    ]
                }
            },
            "diretrizes_para_salles": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Lista direta de orientações pro Salles, em frases curtas "
                    "e acionáveis. Só faz sentido se modo=cadeia."
                )
            },
            "termos_evitar": {
                "type": "array",
                "items": {"type": "string"}
            },
            "termos_permitidos_com_contexto": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "termo": {"type": "string"},
                        "contexto_necessario": {"type": "string"}
                    },
                    "required": ["termo", "contexto_necessario"]
                }
            },
            "fontes_consultadas_estruturadas": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string"},
                        "titulo": {"type": "string"},
                        "data_referencia": {"type": "string"}
                    },
                    "required": ["url", "titulo"]
                }
            },
            "incertezas": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Pontos onde não encontrou política clara."
            },
            "risco_geral": {
                "type": "string",
                "enum": ["baixo", "medio", "alto"]
            }
        },
        "required": [
            "nicho_identificado", "orgaos_relevantes", "politicas_meta_aplicaveis",
            "elementos_analisados", "termos_evitar",
            "termos_permitidos_com_contexto", "fontes_consultadas_estruturadas",
            "incertezas", "risco_geral"
        ]
    }
}


FERRAMENTA_FORMATACAO_HEITOR = {
    "name": "formatar_analise_heitor",
    "description": "Formata análise de compliance em markdown legível.",
    "input_schema": {
        "type": "object",
        "properties": {
            "output_humano": {
                "type": "string",
                "description": (
                    "Análise formatada em markdown, no tom Heitor. "
                    "Modo 'log' = curto e direto. Modo 'analise' = detalhado."
                )
            }
        },
        "required": ["output_humano"]
    }
}


class Heitor(AgenteBase):
    nome = "heitor"
    versao_prompt = "v1"

    def __init__(self):
        super().__init__()

    def executar(
        self,
        conteudo: str,
        modo: str = "solo",
        modo_saida: str = "auto",
        max_buscas: int = HEITOR_MAX_BUSCAS_DEFAULT,
        nicho_hint: Optional[str] = None,
        buscar_secundarias: bool = False,
        confirmacao_callback=None,
        contexto_otto: Optional[dict] = None,
        contexto_salles: Optional[dict] = None,
        tags: Optional[list] = None,
    ) -> AgenteResultado:
        """
        Executa análise de compliance.

        Args:
            conteudo: texto a analisar
            modo: "solo" | "cadeia" | "auditor"
            modo_saida: "log" | "analise" | "auto"
            max_buscas: limite de buscas web (default 3)
            nicho_hint: dica opcional de nicho
            buscar_secundarias: se True, libera busca fora dos domínios oficiais
            confirmacao_callback: callable() -> bool pra pedir confirmação
            contexto_otto: análise do Otto (modo cadeia)
            contexto_salles: roteiro do Salles (modo auditor)
            tags: lista de tags pra histórico
        """
        if modo not in MODOS_VALIDOS:
            raise ValueError(f"Modo inválido: {modo}. Use: {MODOS_VALIDOS}")
        if modo_saida not in MODOS_SAIDA:
            raise ValueError(f"Modo de saída inválido: {modo_saida}")

        _inicio_execucao = time.time()

        if modo_saida == "auto":
            modo_saida = "log" if modo == "cadeia" else "analise"

        if not conteudo or len(conteudo.strip()) < 30:
            raise ValueError("Conteúdo muito curto pra análise.")

        # CAMADA 1 — aviso pré-execução
        aviso_1 = aviso_pre_execucao(max_buscas, modo, modo_saida)
        self.logger.info(aviso_1["mensagem"])

        if aviso_1["precisa_confirmacao"] and confirmacao_callback:
            if not confirmacao_callback():
                self.logger.info("Execução cancelada pelo usuário (pré-execução).")
                return {"cancelado": True, "motivo": "usuario_cancelou_pre_execucao"}

        self.logger.info(
            f"Heitor iniciando | modo={modo} | saida={modo_saida} | "
            f"max_buscas={max_buscas} | secundarias={buscar_secundarias}"
        )

        # ===== CHAMADA 1: análise com web_search =====
        analise_texto, fontes, custo_1, buscas_realizadas = self._chamada_1_analise(
            conteudo, modo, nicho_hint, max_buscas, buscar_secundarias,
            contexto_otto, contexto_salles
        )

        # CAMADA 2 — aviso amarelo durante execução
        aviso_2_msg = aviso_amarelo(custo_1, "chamada 1 (análise)")
        if aviso_2_msg:
            self.logger.warning(aviso_2_msg.strip())

        # ===== CHAMADA 2: estruturação em JSON =====
        analise_json, custo_2 = self._chamada_2_estruturar(
            analise_texto, fontes, modo
        )

        # CAMADA 2 — aviso amarelo acumulado
        custo_acumulado = custo_1 + custo_2
        aviso_2b_msg = aviso_amarelo(custo_acumulado, "chamada 2 (estruturação)")
        if aviso_2b_msg:
            self.logger.warning(aviso_2b_msg.strip())

        # ===== CHAMADA 3: formatação humana =====
        output_humano, custo_3 = self._chamada_3_formatar(analise_json, modo_saida)

        custo_total = self._somar_custo(custo_1, custo_2, custo_3)

        # CAMADA 3 — aviso pós-execução
        breakdown = {
            "analise_web_usd": round(custo_1, 6),
            "estruturacao_usd": round(custo_2, 6),
            "formatacao_usd": round(custo_3, 6),
        }
        aviso_3_msg = aviso_pos_execucao(
            custo_total, breakdown, max_buscas, buscas_realizadas, modo_saida
        )
        self.logger.info(aviso_3_msg)
        self.logger.info(f"Heitor concluído | total: ${custo_total:.6f}")

        resultado = {
            "output_tecnico": analise_json,
            "output_humano": output_humano,
            "modo_execucao": modo,
            "modo_saida": modo_saida,
            "max_buscas_configurado": max_buscas,
            "buscas_realizadas": buscas_realizadas,
            "buscar_secundarias_ativo": buscar_secundarias,
            "tags": tags or [],
            "fontes_consultadas": [f["url"] for f in fontes],
            "fontes_consultadas_detalhadas": fontes,
            "web_search_requests": buscas_realizadas,
            "custo_total_usd": round(custo_total, 6),
            "custo_total_brl_estimado": round(custo_total * 5.20, 4),
            "breakdown_custo": breakdown,
            "duracao_segundos": round(time.time() - _inicio_execucao, 2),
            "modelo_usado": self.modelo,
            "versao_prompt": self.versao_prompt,
            "conteudo_analisado_preview": (
                conteudo[:500] + ("..." if len(conteudo) > 500 else "")
            ),
        }

        self.historico.registrar(resultado)

        return cast(AgenteResultado, resultado)

    def _chamada_1_analise(
        self, conteudo, modo, nicho_hint, max_buscas, buscar_secundarias,
        contexto_otto, contexto_salles
    ):
        """Chamada 1: web_search livre, retorna texto + fontes."""

        contexto_extra = ""
        if modo == "cadeia" and contexto_otto:
            contexto_extra += "\n\nCONTEXTO DO OTTO (Estrategista):\n"
            tese = contexto_otto.get("tese_criativa", {})
            conceito = contexto_otto.get("conceito", {})
            contexto_extra += f"- Tese: {tese.get('frase_tese', '?')}\n"
            contexto_extra += f"- Conceito: {conceito.get('titulo', '?')}\n"

        if modo == "auditor" and contexto_salles:
            contexto_extra += "\n\nCONTEXTO DO SALLES (Roteirista):\n"
            contexto_extra += f"- Formato: {contexto_salles.get('formato_aplicado', '?')}\n"
            contexto_extra += f"- Título: {contexto_salles.get('titulo_roteiro', '?')}\n"

        nicho_msg = ""
        if nicho_hint:
            nicho_msg = f"\nDICA DE NICHO (operador informou): {nicho_hint}\n"

        instrucao_modo = {
            "cadeia": (
                "MODO CADEIA: Otto entregou estratégia. Antecipe riscos e produza "
                "diretrizes pro Salles que vai escrever o roteiro. Foque em "
                "PREVENÇÃO de problemas."
            ),
            "solo": (
                "MODO SOLO: operador trouxe conteúdo direto. Valide conformidade. "
                "Foque em ANÁLISE DE VIABILIDADE do que foi apresentado."
            ),
            "auditor": (
                "MODO AUDITOR: roteiro pronto recebido. Audite pós-produção. "
                "Identifique problemas CONCRETOS por bloco/elemento. Sugira "
                "correções específicas. Foque em O QUE PRECISA MUDAR antes de subir."
            ),
        }[modo]

        prompt = f"""CONTEÚDO A ANALISAR:

{conteudo}
{contexto_extra}
{nicho_msg}

{instrucao_modo}

INSTRUÇÕES:

1. Identifique o nicho exato e os órgãos reguladores aplicáveis.

2. Use web_search MÚLTIPLAS VEZES (até {max_buscas}) pra buscar:
   - Política Meta atual sobre o nicho identificado
   - Resoluções recentes do conselho profissional aplicável
   - Atualizações ANVISA (se aplicável)
   - Diretrizes CONAR

3. Para cada elemento/aspecto do conteúdo, classifique:
   - Verde: pode usar livremente
   - Amarelo: pode usar com cuidados (descreva quais)
   - Vermelho: não use (descreva por quê + sugestão alternativa)

4. SEMPRE cite a fonte específica (URL e/ou nome do documento) ao afirmar algo.

5. Se não encontrar política clara sobre algo, SINALIZE INCERTEZA. Não invente.

Produza uma análise em texto livre, completa e bem fundamentada, com todas
as suas observações, fontes consultadas e classificações.
"""

        if buscar_secundarias:
            tool = construir_tool_web_search_amplo(max_buscas)
        else:
            tool = construir_tool_web_search_oficial(max_buscas)

        response, custo_obj, duracao = self._chamar_api(
            [{"role": "user", "content": prompt}],
            tools=[tool],
        )

        analise_texto = extrair_texto_raciocinio(response.content)
        if not analise_texto.strip():
            raise RuntimeError(
                "Heitor Chamada 1: modelo não retornou nenhum texto de análise. "
                "Possível problema com web_search."
            )

        fontes = extrair_fontes_consultadas(response.content)
        buscas = contar_buscas_realizadas(response.usage)
        custo_buscas = buscas * 0.01
        custo_total = custo_obj.custo_usd + custo_buscas

        self.logger.info(
            f"Chamada 1 em {duracao}s | {response.usage.input_tokens} in / "
            f"{response.usage.output_tokens} out | {buscas} buscas | "
            f"${custo_total:.6f}"
        )

        if not fontes and buscas > 0:
            self.logger.warning(
                "Buscas realizadas mas nenhuma fonte extraída — possível "
                "domínio bloqueado pela whitelist."
            )

        return analise_texto, fontes, custo_total, buscas

    def _chamada_2_estruturar(self, analise_texto, fontes, modo):
        """Chamada 2: estrutura análise em JSON via tool_choice forçado."""

        fontes_str = "\n".join([
            f"- {f.get('title', '(sem título)')} — {f['url']}"
            for f in fontes
        ]) if fontes else "(nenhuma fonte oficial extraída)"

        if modo == "cadeia":
            instrucao_diretrizes = (
                "IMPORTANTE: como o modo é 'cadeia', preencha o campo "
                "`diretrizes_para_salles` com 3-7 frases curtas e acionáveis "
                "pro Salles seguir ao escrever o roteiro."
            )
        else:
            instrucao_diretrizes = (
                "Como o modo NÃO é 'cadeia', o campo `diretrizes_para_salles` "
                "é opcional. Se preencher, mantenha curto."
            )

        prompt = f"""Você produziu esta análise técnica:

---
{analise_texto}
---

FONTES CONSULTADAS PELO web_search:
{fontes_str}

Agora estruture essa análise no formato JSON usando a ferramenta \
`registrar_analise_compliance`.

INSTRUÇÕES:
1. NÃO invente informação que não está na análise acima.
2. Se a análise não cobriu algum campo obrigatório, seja sincero (preencha \
   com lista vazia ou string indicando ausência).
3. Para `fontes_consultadas_estruturadas`, use as fontes listadas acima \
   (URLs reais, NÃO invente).
4. {instrucao_diretrizes}

Use a ferramenta `registrar_analise_compliance`.
"""

        response, custo_obj, _ = self._chamar_api(
            [{"role": "user", "content": prompt}],
            tools=[FERRAMENTA_ANALISE_HEITOR],
            tool_choice={"type": "tool", "name": "registrar_analise_compliance"},
        )

        analise_json = None
        for bloco in response.content:
            if bloco.type == "tool_use" and bloco.name == "registrar_analise_compliance":
                analise_json = bloco.input
                break

        if analise_json is None:
            raise RuntimeError("Heitor Chamada 2 não retornou tool_use estruturado.")

        return analise_json, custo_obj.custo_usd

    def _chamada_3_formatar(self, analise_json, modo_saida):
        """Chamada 3: formata em markdown via tool_choice forçado."""

        analise_str = _json.dumps(analise_json, ensure_ascii=False, indent=2)

        if modo_saida == "log":
            instrucao = (
                "MODO LOG: produza versão CURTA e direta. Liste só os pontos "
                "principais. Diretrizes pro Salles em bullets diretos. Fontes "
                "consultadas listadas no final, sem detalhar fundamentação. "
                "Tom: cirúrgico. Tamanho ideal: meia página."
            )
        else:
            instrucao = (
                "MODO ANÁLISE: produza relatório COMPLETO. Para cada elemento "
                "analisado, explique fundamentação técnica, cite fonte específica, "
                "dê recomendação alternativa quando aplicável. Inclua seção de "
                "incertezas com transparência. Tamanho: extenso, mas sem repetição."
            )

        prompt = f"""Você estruturou esta análise em JSON:

```json
{analise_str}
```

Agora formate em markdown legível no TOM HEITOR, pra leitura do operador (Calebe).

{instrucao}

DIRETRIZES DE FORMATAÇÃO:
- Tom Heitor: direto, técnico mas humano
- Sem rodeio, sem auto-elogio, sem emoji
- Headers ##, ###; bullets *; negrito ** quando importante
- Use sinalização clara pra classificação verde/amarelo/vermelho
- Cite fontes específicas ao afirmar algo
- NÃO invente informação fora do JSON
- Mantenha a estrutura: identificação de nicho → análise → diretrizes → fontes

Use a ferramenta `formatar_analise_heitor`.
"""

        response, custo_obj, _ = self._chamar_api(
            [{"role": "user", "content": prompt}],
            tools=[FERRAMENTA_FORMATACAO_HEITOR],
            tool_choice={"type": "tool", "name": "formatar_analise_heitor"},
        )

        output_humano = None
        for bloco in response.content:
            if bloco.type == "tool_use" and bloco.name == "formatar_analise_heitor":
                output_humano = bloco.input.get("output_humano", "")
                break

        if not output_humano:
            raise RuntimeError("Heitor Chamada 3 não retornou output_humano.")

        return output_humano, custo_obj.custo_usd
