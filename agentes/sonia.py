"""Sonia | Performance — Agente 4 do sistema Lemmon.

Arquitetura: 3 chamadas separadas.
1. Análise (com web_search opcional)
2. Estruturação JSON
3. Formatação humana

Sistema de avisos em 3 camadas.
"""
import time
import json as _json
from pathlib import Path
from typing import Optional
from anthropic import APIError, AuthenticationError, RateLimitError

from core.agente_base import AgenteBase
from core.custo import Custo
from core.web_search_helper import (
    extrair_fontes_consultadas,
    extrair_texto_raciocinio,
    contar_buscas_realizadas,
)
from core.limites_sonia import (
    aviso_pre_execucao_sonia,
    aviso_amarelo_sonia,
    aviso_pos_execucao_sonia,
)
from core.config import (
    SONIA_MAX_BUSCAS_DEFAULT,
    SONIA_DOMINIOS_OFICIAIS,
    SONIA_TENDENCIAS_MAX_CHARS,
    SONIA_ROTEIRO_MAX_CHARS,
    SONIA_HEITOR_CONTEXTO_MAX_TERMOS,
    SONIA_CORTES_MIN,
    SONIA_CORTES_MAX,
    INPUTS_DIR,
)


MODOS_VALIDOS = ["cadeia", "solo", "cortes_apenas"]


def construir_tool_web_search_sonia(max_uses: int = 3) -> dict:
    """Web search da Sonia — domínios próprios."""
    return {
        "type": "web_search_20250305",
        "name": "web_search",
        "max_uses": max_uses,
        "allowed_domains": SONIA_DOMINIOS_OFICIAIS,
        "user_location": {
            "type": "approximate",
            "country": "BR",
            "city": "São Paulo",
            "region": "São Paulo",
            "timezone": "America/Sao_Paulo"
        }
    }


def _truncar_contexto_heitor(contexto_heitor: dict) -> dict:
    """Trunca contexto Heitor pra evitar prompt gigante na Chamada 1."""
    if not isinstance(contexto_heitor, dict):
        return {}

    termos_evitar = contexto_heitor.get("termos_evitar", [])
    if not isinstance(termos_evitar, list):
        termos_evitar = []
    termos_evitar = termos_evitar[:SONIA_HEITOR_CONTEXTO_MAX_TERMOS]

    termos_contexto = contexto_heitor.get("termos_permitidos_com_contexto", [])
    if not isinstance(termos_contexto, list):
        termos_contexto = []
    termos_contexto_limpo = []
    for item in termos_contexto[:SONIA_HEITOR_CONTEXTO_MAX_TERMOS]:
        if isinstance(item, dict):
            termos_contexto_limpo.append({
                "termo": item.get("termo", "?"),
                "contexto_necessario": item.get("contexto_necessario", "")
            })

    return {
        "risco_geral": contexto_heitor.get("risco_geral", "?"),
        "termos_evitar": termos_evitar,
        "termos_permitidos_com_contexto": termos_contexto_limpo,
        "diretrizes_para_salles": contexto_heitor.get("diretrizes_para_salles", [])[:10],
    }


# Schema da estruturação (Chamada 2)
FERRAMENTA_PLANO_PERFORMANCE = {
    "name": "registrar_plano_performance",
    "description": (
        "Estrutura plano de performance Lemmon: análise master + versão "
        "otimizada (preencher 'N/A' em cortes_apenas) + cortes autônomos + "
        "análise consolidada."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "modo_aplicado": {
                "type": "string",
                "enum": MODOS_VALIDOS
            },
            "analise_master": {
                "type": "object",
                "properties": {
                    "nota_geral": {"type": "number", "minimum": 0, "maximum": 10},
                    "comentario": {"type": "string"},
                    "dimensao_dominante": {
                        "type": "string",
                        "enum": ["alcance", "retencao", "engajamento_qualificado"],
                        "description": "Qual das 3 dimensões pesou mais na nota"
                    },
                    "pontos_fortes": {
                        "type": "array",
                        "items": {"type": "string"}
                    },
                    "pontos_fracos": {
                        "type": "array",
                        "items": {"type": "string"}
                    }
                },
                "required": ["nota_geral", "comentario", "dimensao_dominante",
                             "pontos_fortes", "pontos_fracos"]
            },
            "versao_otimizada": {
                "type": "object",
                "description": (
                    "Versão otimizada do master. Em modo 'cortes_apenas', preencha "
                    "estrutura='N/A — modo cortes_apenas', mudancas_aplicadas=[], "
                    "ressalvas_compliance=[]."
                ),
                "properties": {
                    "estrutura": {"type": "string"},
                    "mudancas_aplicadas": {
                        "type": "array",
                        "items": {"type": "string"}
                    },
                    "ressalvas_compliance": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "heitor_sinalizou": {"type": "string"},
                                "decisao_sonia": {"type": "string"},
                                "justificativa_performance": {"type": "string"}
                            },
                            "required": ["heitor_sinalizou", "decisao_sonia", "justificativa_performance"]
                        }
                    }
                },
                "required": ["estrutura", "mudancas_aplicadas", "ressalvas_compliance"]
            },
            "cortes_autonomos": {
                "type": "array",
                "minItems": SONIA_CORTES_MIN,
                "maxItems": SONIA_CORTES_MAX,
                "items": {
                    "type": "object",
                    "properties": {
                        "tipo": {
                            "type": "string",
                            "description": (
                                "Formato sugerido pra peça. Exemplos: 'reels_30s', "
                                "'reels_60s', 'reels_90s', 'stories_carrossel', "
                                "'stories_unico', 'carousel_estatico', 'reels_15s', "
                                "'feed_video_curto'. Escreva livremente o formato "
                                "que faz mais sentido."
                            )
                        },
                        "titulo_interno": {"type": "string"},
                        "hook": {"type": "string"},
                        "estrutura": {"type": "string"},
                        "cta_implicito": {"type": "string"},
                        "nota_performance_prevista": {
                            "type": "number", "minimum": 0, "maximum": 10
                        },
                        "dimensao_dominante": {
                            "type": "string",
                            "enum": ["alcance", "retencao", "engajamento_qualificado"]
                        },
                        "comentario_sonia": {"type": "string"},
                        "ressalvas_compliance": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "heitor_sinalizou": {"type": "string"},
                                    "decisao_sonia": {"type": "string"},
                                    "justificativa_performance": {"type": "string"}
                                },
                                "required": ["heitor_sinalizou", "decisao_sonia", "justificativa_performance"]
                            }
                        }
                    },
                    "required": ["tipo", "titulo_interno", "hook", "estrutura",
                                 "cta_implicito", "nota_performance_prevista",
                                 "dimensao_dominante", "comentario_sonia"]
                }
            },
            "analise_consolidada": {
                "type": "object",
                "properties": {
                    "peca_provavel_destaque": {"type": "string"},
                    "peca_queima_estoque": {"type": "string"},
                    "peca_potencial_viral": {"type": "string"},
                    "comentario_estrategico": {"type": "string"}
                },
                "required": ["peca_provavel_destaque", "comentario_estrategico"]
            },
            "tendencias_aplicadas": {
                "type": "array",
                "items": {"type": "string"}
            },
            "tendencias_ignoradas": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "tendencia": {"type": "string"},
                        "motivo": {"type": "string"}
                    },
                    "required": ["tendencia", "motivo"]
                }
            },
            "fontes_consultadas": {
                "type": "array",
                "items": {"type": "string"}
            }
        },
        "required": ["modo_aplicado", "analise_master", "versao_otimizada",
                     "cortes_autonomos", "analise_consolidada",
                     "tendencias_aplicadas", "tendencias_ignoradas",
                     "fontes_consultadas"]
    }
}


# Schema de formatação (Chamada 3)
FERRAMENTA_FORMATACAO_SONIA = {
    "name": "formatar_plano_sonia",
    "description": "Formata plano de performance em markdown.",
    "input_schema": {
        "type": "object",
        "properties": {
            "output_humano": {
                "type": "string",
                "description": (
                    "Plano formatado em markdown, tom Sonia. 4 seções: análise "
                    "master, versão otimizada (ou pular se cortes_apenas), "
                    "cortes autônomos, análise consolidada."
                )
            }
        },
        "required": ["output_humano"]
    }
}


class Sonia(AgenteBase):
    nome = "sonia"
    versao_prompt = "v1"

    def __init__(self):
        super().__init__()

    def executar(
        self,
        roteiro: str,
        modo: str = "solo",
        com_busca: bool = False,
        max_buscas: int = SONIA_MAX_BUSCAS_DEFAULT,
        usar_tendencias: bool = True,
        contexto_otto: Optional[dict] = None,
        contexto_salles: Optional[dict] = None,
        contexto_heitor: Optional[dict] = None,
        contexto_salles_ressalvas: Optional[list] = None,
        confirmacao_callback=None,
        tags: Optional[list] = None,
    ) -> dict:
        if modo not in MODOS_VALIDOS:
            raise ValueError(f"Modo inválido: {modo}. Use: {MODOS_VALIDOS}")

        if not roteiro or len(roteiro.strip()) < 100:
            raise ValueError("Roteiro muito curto pra análise (mín 100 chars).")

        if len(roteiro) > SONIA_ROTEIRO_MAX_CHARS:
            self.logger.warning(
                f"Roteiro muito grande ({len(roteiro)} chars). "
                f"Truncando pra {SONIA_ROTEIRO_MAX_CHARS}."
            )
            roteiro = roteiro[:SONIA_ROTEIRO_MAX_CHARS]

        # Carrega tendências
        tendencias_texto = ""
        if usar_tendencias:
            arquivo_tendencias = INPUTS_DIR / "tendencias_atuais.md"
            if arquivo_tendencias.exists():
                tendencias_raw = arquivo_tendencias.read_text(encoding="utf-8")
                if len(tendencias_raw) > SONIA_TENDENCIAS_MAX_CHARS:
                    self.logger.warning(
                        f"Tendências muito grandes ({len(tendencias_raw)} chars). "
                        f"Truncando."
                    )
                    tendencias_raw = tendencias_raw[:SONIA_TENDENCIAS_MAX_CHARS]
                tendencias_texto = tendencias_raw
            else:
                self.logger.info("Arquivo de tendências não existe — Sonia roda só com princípios.")

        # Trunca Heitor
        heitor_safe = _truncar_contexto_heitor(contexto_heitor) if contexto_heitor else None

        # Aviso pré-execução
        modo_busca_descricao = "tendências + atualizações Meta" if com_busca else ""
        aviso_1 = aviso_pre_execucao_sonia(
            com_busca, max_buscas, modo, modo_busca_descricao
        )
        print(aviso_1["mensagem"])

        if aviso_1["precisa_confirmacao"] and confirmacao_callback:
            if not confirmacao_callback():
                self.logger.info("Sonia cancelada pelo operador.")
                return {"cancelado": True, "motivo": "usuario_cancelou_pre_execucao"}

        self.logger.info(
            f"Sonia iniciando | modo={modo} | com_busca={com_busca} | "
            f"max_buscas={max_buscas} | tendencias={'sim' if tendencias_texto else 'não'}"
        )

        # ===== CHAMADA 1: análise =====
        analise_texto, fontes, custo_1, buscas_realizadas = self._chamada_1(
            roteiro, modo, tendencias_texto, com_busca, max_buscas,
            contexto_otto, contexto_salles, heitor_safe,
            contexto_salles_ressalvas
        )

        aviso = aviso_amarelo_sonia(custo_1, "chamada 1 (análise)")
        if aviso:
            print(aviso)
            self.logger.warning(aviso.strip())

        # ===== CHAMADA 2: estruturação =====
        plano_json, custo_2 = self._chamada_2(analise_texto, fontes, modo)

        custo_acumulado = custo_1 + custo_2
        aviso = aviso_amarelo_sonia(custo_acumulado, "chamada 2 (estruturação)")
        if aviso:
            print(aviso)
            self.logger.warning(aviso.strip())

        # ===== CHAMADA 3: formatação =====
        output_humano, custo_3 = self._chamada_3(plano_json, modo)

        custo_total = custo_1 + custo_2 + custo_3

        breakdown = {
            "analise_usd": round(custo_1, 6),
            "estruturacao_usd": round(custo_2, 6),
            "formatacao_usd": round(custo_3, 6),
        }
        aviso_final = aviso_pos_execucao_sonia(
            custo_total, breakdown, com_busca, max_buscas, buscas_realizadas, modo
        )
        print(aviso_final)
        self.logger.info(f"Sonia concluída | total: ${custo_total:.6f}")

        resultado = {
            "output_tecnico": plano_json,
            "output_humano": output_humano,
            "modo_execucao": modo,
            "com_busca": com_busca,
            "buscas_realizadas": buscas_realizadas,
            "tendencias_usadas": bool(tendencias_texto),
            "tags": tags or [],
            "fontes_consultadas": [f["url"] for f in fontes],
            "fontes_consultadas_detalhadas": fontes,
            "web_search_requests": buscas_realizadas,
            "custo_total_usd": round(custo_total, 6),
            "custo_total_brl_estimado": round(custo_total * 5.20, 4),
            "breakdown_custo": breakdown,
            "modelo_usado": self.modelo,
            "versao_prompt": self.versao_prompt,
            "roteiro_preview": roteiro[:500] + ("..." if len(roteiro) > 500 else ""),
        }

        self.historico.registrar(resultado)
        return resultado

    def _chamada_1(self, roteiro, modo, tendencias_texto, com_busca,
                   max_buscas, contexto_otto, contexto_salles, heitor_safe,
                   contexto_salles_ressalvas):
        """Chamada 1: análise (com web_search opcional)."""

        contexto_extra = ""
        if contexto_otto and isinstance(contexto_otto, dict):
            tese = contexto_otto.get("tese_criativa", {}) if isinstance(contexto_otto.get("tese_criativa"), dict) else {}
            conceito = contexto_otto.get("conceito", {}) if isinstance(contexto_otto.get("conceito"), dict) else {}
            contexto_extra += f"\n\nCONTEXTO OTTO:\n"
            contexto_extra += f"- Tese: {tese.get('frase_tese', '?')}\n"
            contexto_extra += f"- Conceito: {conceito.get('titulo', '?')}\n"

        if contexto_salles and isinstance(contexto_salles, dict):
            contexto_extra += f"\n\nCONTEXTO SALLES:\n"
            contexto_extra += f"- Formato: {contexto_salles.get('formato_aplicado', '?')}\n"
            contexto_extra += f"- Título: {contexto_salles.get('titulo_roteiro', '?')}\n"

        if heitor_safe:
            contexto_extra += f"\n\nCONTEXTO HEITOR (compliance):\n"
            contexto_extra += f"- Risco geral: {heitor_safe['risco_geral']}\n"
            contexto_extra += f"- Termos a evitar: {heitor_safe['termos_evitar']}\n"
            termos_ctx = heitor_safe['termos_permitidos_com_contexto']
            if termos_ctx:
                contexto_extra += "- Termos com contexto necessário:\n"
                for t in termos_ctx[:10]:
                    contexto_extra += f"  • {t['termo']} → {t['contexto_necessario']}\n"
            contexto_extra += "\nVocê pode discordar do Heitor, mas deve registrar ressalva inline em cada elemento afetado."

        if contexto_salles_ressalvas and isinstance(contexto_salles_ressalvas, list):
            if contexto_salles_ressalvas:
                contexto_extra += f"\n\nRESSALVAS QUE SALLES JÁ APLICOU vs HEITOR:\n"
                for r in contexto_salles_ressalvas[:5]:
                    if isinstance(r, dict):
                        contexto_extra += f"- Salles manteve: {r.get('item', '?')}\n"
                contexto_extra += "Considere essas decisões. Não desfaça o que Salles decidiu manter conscientemente."

        tendencias_bloco = ""
        if tendencias_texto:
            tendencias_bloco = f"\n\nARQUIVO DE TENDÊNCIAS DO OPERADOR:\n---\n{tendencias_texto}\n---\n"

        instrucao_modo = ""
        if modo == "cadeia":
            instrucao_modo = (
                "MODO CADEIA: roteiro completo do Salles. Faça:\n"
                "1) Análise crítica do master sob ótica algoritmo Meta\n"
                "2) Versão otimizada do master (mantendo essência)\n"
                "3) Cortes autônomos\n"
                "4) Análise consolidada"
            )
        elif modo == "solo":
            instrucao_modo = (
                "MODO SOLO: roteiro genérico recebido. Faça:\n"
                "1) Análise crítica\n"
                "2) Versão otimizada\n"
                "3) Cortes autônomos\n"
                "4) Análise consolidada"
            )
        elif modo == "cortes_apenas":
            instrucao_modo = (
                "MODO CORTES_APENAS: roteiro pronto recebido. NÃO produza versão "
                "otimizada do master. Faça:\n"
                "1) Análise crítica\n"
                "2) [PULAR versão otimizada — preencha 'N/A' no JSON]\n"
                "3) Cortes autônomos\n"
                "4) Análise consolidada"
            )

        instrucao_busca = ""
        if com_busca:
            instrucao_busca = (
                f"\nBUSCAS PERMITIDAS: até {max_buscas} buscas. Use pra:\n"
                "- Atualizações de feature Meta (Reels Carousel? duração Stories?)\n"
                "- Análises recentes em sites confiáveis\n"
                "NÃO BUSCAR vídeos em alta no Instagram/TikTok (não acessível)."
            )
        else:
            instrucao_busca = "\nBuscas web DESATIVADAS. Use só princípios + tendências do arquivo."

        prompt = f"""ROTEIRO A OTIMIZAR:

{roteiro}
{contexto_extra}
{tendencias_bloco}

{instrucao_modo}
{instrucao_busca}

PRODUZA SUA ANÁLISE EM TEXTO LIVRE, COMPLETA E FUNDAMENTADA. Inclua:
- Análise da peça master (nota 0-10 + comentário + dimensão dominante: alcance/retenção/engajamento)
- {'Versão otimizada do master' if modo != 'cortes_apenas' else '[PULAR — modo cortes_apenas]'}
- Cortes autônomos (entre {SONIA_CORTES_MIN} e {SONIA_CORTES_MAX}, você decide quantos)
- Análise consolidada
- Liste tendências do arquivo que aplicou e quais decidiu ignorar (com motivo)

Se receber diretrizes do Heitor e decidir discordar, registre ressalva inline.
"""

        tools = []
        if com_busca:
            tools = [construir_tool_web_search_sonia(max_buscas)]

        kwargs = {
            "model": self.modelo,
            "max_tokens": self.max_tokens,
            "system": self.system_prompt,
            "messages": [{"role": "user", "content": prompt}],
        }
        if tools:
            kwargs["tools"] = tools

        inicio = time.time()
        try:
            response = self.client.messages.create(**kwargs)
        except AuthenticationError:
            raise RuntimeError("Chave API inválida.")
        except RateLimitError as e:
            raise RuntimeError(
                f"Rate limit Chamada 1: {e}\n"
                f"Aguarde 60-90 segundos e tente de novo."
            )
        except APIError as e:
            raise RuntimeError(f"Erro API Chamada 1: {e}")

        duracao = round(time.time() - inicio, 2)

        analise_texto = extrair_texto_raciocinio(response.content)
        if not analise_texto.strip():
            raise RuntimeError("Sonia Chamada 1: modelo não retornou análise.")

        fontes = extrair_fontes_consultadas(response.content) if com_busca else []
        buscas = contar_buscas_realizadas(response.usage) if com_busca else 0

        custo_modelo = Custo.calcular(
            response.usage.input_tokens, response.usage.output_tokens
        )
        custo_buscas = buscas * 0.01
        custo_total = custo_modelo.custo_usd + custo_buscas

        self.logger.info(
            f"Chamada 1 em {duracao}s | "
            f"{response.usage.input_tokens} in / {response.usage.output_tokens} out | "
            f"{buscas} buscas | ${custo_total:.6f}"
        )

        if com_busca and not fontes and buscas > 0:
            self.logger.warning(
                "Buscas realizadas mas nenhuma fonte extraída — possível "
                "domínio bloqueado pela whitelist."
            )

        return analise_texto, fontes, custo_total, buscas

    def _chamada_2(self, analise_texto, fontes, modo):
        """Chamada 2: estruturação JSON."""
        fontes_str = "\n".join([
            f"- {f.get('title', '(sem título)')} — {f['url']}" for f in fontes
        ]) if fontes else "(nenhuma — busca desligada ou sem resultado)"

        instrucao_versao = ""
        if modo == "cortes_apenas":
            instrucao_versao = (
                "IMPORTANTE: modo é 'cortes_apenas'. No campo `versao_otimizada`, "
                "preencha estrutura='N/A — modo cortes_apenas', "
                "mudancas_aplicadas=[] (lista vazia), "
                "ressalvas_compliance=[] (lista vazia). NÃO deixe campos vazios "
                "fora desses."
            )
        else:
            instrucao_versao = (
                "Preencha completamente o campo `versao_otimizada` com base "
                "na análise."
            )

        prompt = f"""Você produziu esta análise de performance:

---
{analise_texto}
---

FONTES CONSULTADAS:
{fontes_str}

Estruture essa análise no formato JSON usando `registrar_plano_performance`.

INSTRUÇÕES:
1. NÃO invente conteúdo fora da análise acima
2. {instrucao_versao}
3. Para `cortes_autonomos`, mínimo {SONIA_CORTES_MIN}, máximo {SONIA_CORTES_MAX}
4. Cada corte tem nota_performance_prevista (0-10) e dimensao_dominante \
(alcance/retencao/engajamento_qualificado)
5. `tipo` do corte é texto livre (escreva o formato apropriado)
6. Em `tendencias_aplicadas`, liste tendências do arquivo que usou
7. Em `tendencias_ignoradas`, liste tendências que decidiu não usar e por quê
8. Em `fontes_consultadas`, use as URLs reais listadas acima

Use `registrar_plano_performance`.
"""

        try:
            response = self.client.messages.create(
                model=self.modelo,
                max_tokens=self.max_tokens,
                system=self.system_prompt,
                messages=[{"role": "user", "content": prompt}],
                tools=[FERRAMENTA_PLANO_PERFORMANCE],
                tool_choice={"type": "tool", "name": "registrar_plano_performance"}
            )
        except RateLimitError as e:
            raise RuntimeError(
                f"Rate limit Chamada 2: {e}\nAguarde e tente de novo."
            )
        except APIError as e:
            raise RuntimeError(f"Erro API Chamada 2: {e}")

        plano = None
        for bloco in response.content:
            if bloco.type == "tool_use" and bloco.name == "registrar_plano_performance":
                plano = bloco.input
                break

        if plano is None:
            raise RuntimeError("Sonia Chamada 2: tool_use não retornado.")

        custo = Custo.calcular(
            response.usage.input_tokens, response.usage.output_tokens
        )
        self.logger.info(f"Chamada 2 | {custo.resumo()}")

        return plano, custo.custo_usd

    def _chamada_3(self, plano_json, modo):
        """Chamada 3: formatação humana."""
        plano_str = _json.dumps(plano_json, ensure_ascii=False, indent=2)

        instrucao_versao = ""
        if modo == "cortes_apenas":
            instrucao_versao = (
                "Modo cortes_apenas: PULE a seção 'Versão otimizada do master'. "
                "Mantenha apenas: análise master, cortes autônomos, análise "
                "consolidada."
            )
        else:
            instrucao_versao = "Inclua a seção 'Versão otimizada do master' completa."

        prompt = f"""Você estruturou este plano:

```json
{plano_str}
```

Formate em markdown legível no TOM SONIA (híbrido brasileiro: analítica nos
dados, brasileira na linguagem).

ESTRUTURA OBRIGATÓRIA:
1. **Análise da peça master** — nota + dimensão dominante + comentário em prosa + pontos fortes/fracos
2. **Versão otimizada do master** — {instrucao_versao}
3. **Cortes autônomos** — cada um com tipo, hook, estrutura, CTA, nota, dimensão dominante, comentário
4. **Análise consolidada** — peça destaque, queima estoque, potencial viral, comentário

DIRETRIZES:
- Tom Sonia: direta, brasileira, ironia leve quando algo é genérico
- Notas SEMPRE acompanhadas de comentário em prosa indicando qual dimensão pesou
- Headers ##, ###; bullets *; negrito **
- Ressalvas vs Heitor (se houver) no formato:
  > ⚠️ HEITOR sinalizou: [...]
  > Decisão Sonia: [...]
  > Justificativa de performance: [...]
- Se houver tendências aplicadas/ignoradas, mencione no fim de cada seção relevante
- NÃO invente conteúdo fora do JSON

Use `formatar_plano_sonia`.
"""

        try:
            response = self.client.messages.create(
                model=self.modelo,
                max_tokens=self.max_tokens,
                system=self.system_prompt,
                messages=[{"role": "user", "content": prompt}],
                tools=[FERRAMENTA_FORMATACAO_SONIA],
                tool_choice={"type": "tool", "name": "formatar_plano_sonia"}
            )
        except RateLimitError as e:
            raise RuntimeError(
                f"Rate limit Chamada 3: {e}\nAguarde e tente de novo."
            )
        except APIError as e:
            raise RuntimeError(f"Erro API Chamada 3: {e}")

        output = None
        for bloco in response.content:
            if bloco.type == "tool_use" and bloco.name == "formatar_plano_sonia":
                output = bloco.input.get("output_humano", "")
                break

        if not output:
            raise RuntimeError("Sonia Chamada 3: output_humano não retornado.")

        custo = Custo.calcular(
            response.usage.input_tokens, response.usage.output_tokens
        )
        self.logger.info(f"Chamada 3 | {custo.resumo()}")

        return output, custo.custo_usd
