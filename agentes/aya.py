"""Aya | Assistente Virtual — Agente 5 do sistema Lemmon.

Função: COMPILA outputs dos outros agentes em dossiê único.
NÃO interpreta, NÃO opina, NÃO sintetiza. Só organiza.

Arquitetura: 1 chamada API (cards) + montagem Python pura do markdown final.
"""
import time
import json as _json
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict
from anthropic import APIError, AuthenticationError, RateLimitError

from core.agente_base import AgenteBase
from core.custo import Custo
from core.historico import Historico
from core.limites_aya import (
    aviso_pre_execucao_aya,
    aviso_pos_execucao_aya,
)
from core.config import (
    AYA_AGENTES_PADRAO,
    AYA_OUTPUT_AGENTE_MAX_CHARS,
    AYA_DOSSIE_MAX_CHARS_TOTAL,
    AYA_RESUMO_AGENTE_MAX_CHARS,
    OUTPUTS_DIR,
)


# Schema da chamada única — apenas cards de resumo, sem síntese narrativa
FERRAMENTA_DOSSIE_AYA = {
    "name": "compilar_resumos_lemmon",
    "description": (
        "Produz resumos curtos extraídos dos outputs dos agentes Lemmon "
        "que rodaram. Não interpreta, não conecta, não opina."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "card_otto": {
                "type": "object",
                "description": (
                    "Resumo extraído do output do Otto. Se Otto não rodou, "
                    "preencher presente=false e demais campos vazios."
                ),
                "properties": {
                    "presente": {"type": "boolean"},
                    "resumo": {
                        "type": "string",
                        "description": (
                            "Até 400 chars. Estrutura: 'Tese: [tese literal]. "
                            "Conceito: [conceito].' Use frases literais quando "
                            "possível. NÃO interprete."
                        )
                    }
                },
                "required": ["presente", "resumo"]
            },
            "card_heitor": {
                "type": "object",
                "description": (
                    "Resumo extraído do output do Heitor. Se Heitor não rodou, "
                    "preencher presente=false e demais campos vazios."
                ),
                "properties": {
                    "presente": {"type": "boolean"},
                    "resumo": {
                        "type": "string",
                        "description": (
                            "Até 400 chars. Estrutura: 'Risco: [verde/amarelo/"
                            "vermelho]. Termos críticos: X, Y, Z.' NÃO interprete."
                        )
                    }
                },
                "required": ["presente", "resumo"]
            },
            "card_salles": {
                "type": "object",
                "description": (
                    "Resumo extraído do output do Salles. Se Salles não rodou, "
                    "preencher presente=false e demais campos vazios."
                ),
                "properties": {
                    "presente": {"type": "boolean"},
                    "resumo": {
                        "type": "string",
                        "description": (
                            "Até 400 chars. Estrutura: 'Formato: X. Título: Y. "
                            "Blocos: N.' NÃO interprete."
                        )
                    }
                },
                "required": ["presente", "resumo"]
            },
            "card_sonia": {
                "type": "object",
                "description": (
                    "Resumo extraído do output da Sonia. Se Sonia não rodou, "
                    "preencher presente=false e demais campos vazios."
                ),
                "properties": {
                    "presente": {"type": "boolean"},
                    "resumo": {
                        "type": "string",
                        "description": (
                            "Até 400 chars. Estrutura: 'Nota master: X/10. "
                            "Cortes gerados: N. Peça destaque: [nome].' NÃO interprete."
                        )
                    }
                },
                "required": ["presente", "resumo"]
            }
        },
        "required": ["card_otto", "card_heitor", "card_salles", "card_sonia"]
    }
}


class Aya(AgenteBase):
    nome = "aya"
    versao_prompt = "v1"
    system_prompt_reuniao = (
        "Você é Aya, assistente virtual da Lemmon Produções. "
        "Em reuniões conversacionais você responde de forma natural, direta e prestativa. "
        "Você conhece bem os outros agentes da equipe: Otto (estratégia), Heitor (compliance), "
        "Salles (roteiro) e Sônia (performance). "
        "Quando solicitada a compilar outputs de uma sessão, informe que isso é feito automaticamente "
        "ao final do pipeline. Seja concisa e útil."
    )

    def __init__(self):
        super().__init__()

    def executar(
        self,
        nome_projeto: Optional[str] = None,
        arquivos_especificos: Optional[Dict[str, str]] = None,
        tags: Optional[list] = None,
        outputs_diretos: Optional[Dict[str, dict]] = None,
    ) -> dict:
        """
        Compila dossiê dos últimos outputs dos agentes Lemmon.

        Args:
            nome_projeto: nome opcional pra incluir no arquivo final
            arquivos_especificos: dict {agente: caminho_arquivo} pra forçar
                arquivos específicos (sobrescreve auto-detecção)
            tags: tags pra histórico
            outputs_diretos: dict {agente: {"output_humano": str, "output_tecnico": dict}}
                passado pelo pipeline para evitar leitura de disco e garantir contexto correto
        """
        outputs_detectados = self._detectar_outputs(arquivos_especificos, outputs_diretos)

        num_presentes = sum(1 for v in outputs_detectados.values() if v is not None)

        if num_presentes == 0:
            raise RuntimeError(
                "Aya não encontrou nenhum output de agente pra compilar. "
                "Rode pelo menos um agente antes."
            )

        print(aviso_pre_execucao_aya(num_presentes))

        self.logger.info(
            f"Aya iniciando | agentes detectados: {num_presentes}/4 | "
            f"projeto: {nome_projeto or '(sem nome)'}"
        )

        # ===== CHAMADA ÚNICA: produz apenas cards de resumo =====
        cards_estruturados, custo = self._chamada_compilar(outputs_detectados)

        # ===== MONTAGEM FINAL EM PYTHON PURO =====
        markdown_final = self._montar_markdown(
            cards_estruturados, outputs_detectados, nome_projeto
        )

        if len(markdown_final) > AYA_DOSSIE_MAX_CHARS_TOTAL:
            self.logger.warning(
                f"Dossiê grande ({len(markdown_final)} chars)."
            )

        aviso_final = aviso_pos_execucao_aya(custo, num_presentes)
        print(aviso_final)
        self.logger.info(f"Aya concluída | total: ${custo:.6f}")

        resultado = {
            "output_tecnico": cards_estruturados,
            "output_humano": markdown_final,
            "agentes_detectados": [k for k, v in outputs_detectados.items() if v is not None],
            "agentes_ausentes": [k for k, v in outputs_detectados.items() if v is None],
            "nome_projeto": nome_projeto or "(sem nome)",
            "tags": tags or [],
            "fontes_consultadas": [],
            "custo_total_usd": round(custo, 6),
            "custo_total_brl_estimado": round(custo * 5.20, 4),
            "breakdown_custo": {"compilacao_usd": round(custo, 6)},
            "modelo_usado": self.modelo,
            "versao_prompt": self.versao_prompt,
            "tamanho_dossie_chars": len(markdown_final),
        }

        self.historico.registrar(resultado)
        return resultado

    def _detectar_outputs(
        self,
        arquivos_especificos: Optional[dict],
        outputs_diretos: Optional[Dict[str, dict]] = None,
    ) -> Dict[str, Optional[dict]]:
        """Detecta últimos outputs de cada agente em historico/."""
        outputs = {}

        for agente in AYA_AGENTES_PADRAO:
            if outputs_diretos and agente in outputs_diretos:
                outputs[agente] = outputs_diretos[agente]
                continue

            if arquivos_especificos and agente in arquivos_especificos:
                caminho = Path(arquivos_especificos[agente])
                if caminho.exists():
                    try:
                        outputs[agente] = _json.loads(caminho.read_text(encoding="utf-8"))
                        continue
                    except Exception as e:
                        self.logger.warning(f"Erro ao ler {caminho}: {e}")

            try:
                hist = Historico(agente)
                ultimas = hist.listar(limite=1)
                if ultimas:
                    outputs[agente] = ultimas[0]
                else:
                    outputs[agente] = None
                    self.logger.info(f"Nenhum histórico de {agente} encontrado.")
            except Exception as e:
                self.logger.warning(f"Erro ao detectar {agente}: {e}")
                outputs[agente] = None

        return outputs

    def _chamada_compilar(self, outputs_detectados: Dict[str, Optional[dict]]):
        """Chamada única: produz cards de resumo (sem síntese narrativa)."""

        prompt_partes = []
        prompt_partes.append("OUTPUTS DOS AGENTES PRA EXTRAIR RESUMOS:\n")
        prompt_partes.append("=" * 50 + "\n")

        for agente, output in outputs_detectados.items():
            if output is None:
                prompt_partes.append(f"\n## {agente.upper()}: AUSENTE (presente=false, resumo='')\n")
                continue

            output_humano = output.get("output_humano", "")
            output_tecnico = output.get("output_tecnico", {})

            if len(output_humano) > AYA_OUTPUT_AGENTE_MAX_CHARS:
                output_humano = (
                    output_humano[:AYA_OUTPUT_AGENTE_MAX_CHARS]
                    + f"\n\n[TRUNCADO]"
                )

            prompt_partes.append(f"\n## {agente.upper()}\n")
            prompt_partes.append(f"\n### Output técnico (resumido):\n")
            prompt_partes.append(_json.dumps(
                self._resumir_output_tecnico(agente, output_tecnico),
                ensure_ascii=False, indent=2
            ))
            prompt_partes.append(f"\n\n### Output humano:\n{output_humano}\n")
            prompt_partes.append("-" * 50 + "\n")

        prompt = "".join(prompt_partes) + f"""

INSTRUÇÕES (LEIA COM ATENÇÃO):

1. Pra cada agente PRESENTE acima, preencha o card correspondente:
   - presente=true
   - resumo: até {AYA_RESUMO_AGENTE_MAX_CHARS} chars, FACTUAL, EXTRAÍDO direto do output.

2. Pra cada agente AUSENTE, preencha:
   - presente=false
   - resumo='' (string vazia)

3. NÃO INTERPRETE. NÃO CONECTE. NÃO ESCREVA INTRODUÇÃO. NÃO ESCREVA CONCLUSÃO.

4. Use frases LITERAIS dos outputs sempre que possível.

5. Estrutura sugerida pra cada resumo:
   - Otto: "Tese: [frase]. Conceito: [título]."
   - Heitor: "Risco: [verde/amarelo/vermelho]. Termos críticos: X, Y, Z."
   - Salles: "Formato: X. Título: Y. Blocos: N."
   - Sonia: "Nota master: X/10. Cortes: N. Peça destaque: [nome]."

Use `compilar_resumos_lemmon`.
"""

        try:
            response = self.client.messages.create(
                model=self.modelo,
                max_tokens=self.max_tokens,
                system=self.system_prompt,
                messages=[{"role": "user", "content": prompt}],
                tools=[FERRAMENTA_DOSSIE_AYA],
                tool_choice={"type": "tool", "name": "compilar_resumos_lemmon"}
            )
        except AuthenticationError:
            raise RuntimeError("Chave API inválida.")
        except RateLimitError as e:
            raise RuntimeError(f"Rate limit Aya: {e}\nAguarde e tente de novo.")
        except APIError as e:
            raise RuntimeError(f"Erro API Aya: {e}")

        cards = None
        for bloco in response.content:
            if bloco.type == "tool_use" and bloco.name == "compilar_resumos_lemmon":
                cards = bloco.input
                break

        if cards is None:
            raise RuntimeError("Aya: tool_use não retornado.")

        custo = Custo.calcular(
            response.usage.input_tokens, response.usage.output_tokens
        )
        self.logger.info(f"Chamada Aya | {custo.resumo()}")

        return cards, custo.custo_usd

    def _resumir_output_tecnico(self, agente: str, output_tecnico: dict) -> dict:
        """Extrai apenas campos relevantes pra economizar tokens."""
        if not isinstance(output_tecnico, dict):
            return {}

        if agente == "otto":
            return {
                "tese_criativa": output_tecnico.get("tese_criativa", {}),
                "conceito": output_tecnico.get("conceito", {}),
            }
        elif agente == "heitor":
            return {
                "risco_geral": output_tecnico.get("risco_geral", ""),
                "termos_evitar": output_tecnico.get("termos_evitar", [])[:8],
            }
        elif agente == "salles":
            return {
                "formato_aplicado": output_tecnico.get("formato_aplicado", ""),
                "titulo_roteiro": output_tecnico.get("titulo_roteiro", ""),
                "num_blocos": len(output_tecnico.get("blocos", [])),
            }
        elif agente == "sonia":
            analise = output_tecnico.get("analise_master", {})
            consolidada = output_tecnico.get("analise_consolidada", {})
            return {
                "nota_master": analise.get("nota_geral", 0),
                "num_cortes": len(output_tecnico.get("cortes_autonomos", [])),
                "peca_destaque": consolidada.get("peca_provavel_destaque", ""),
            }
        return {}

    def _montar_markdown(self, cards: dict, outputs: Dict[str, Optional[dict]],
                         nome_projeto: Optional[str]) -> str:
        """Montagem Python pura do markdown final.

        REGRA DE OURO: agentes ausentes NÃO aparecem.
        """
        ts = datetime.now().strftime("%d/%m/%Y às %H:%M")
        projeto_str = nome_projeto or "(sem nome)"

        partes = []

        # CABEÇALHO MÍNIMO
        partes.append(f"# Dossiê — {projeto_str}\n")
        partes.append(f"*Compilado em {ts}*\n\n")
        partes.append("---\n\n")

        # ÍNDICE — só lista agentes presentes
        partes.append("## Índice\n\n")
        partes.append("- [Resumo dos agentes](#resumo-dos-agentes)\n")

        secao_num = 1
        if outputs.get("otto"):
            partes.append(f"- [{secao_num}. Otto — Estratégia](#{secao_num}-otto-estratégia)\n")
            secao_num += 1
        if outputs.get("heitor"):
            partes.append(f"- [{secao_num}. Heitor — Compliance](#{secao_num}-heitor-compliance)\n")
            secao_num += 1
        if outputs.get("salles"):
            partes.append(f"- [{secao_num}. Salles — Roteiro](#{secao_num}-salles-roteiro)\n")
            secao_num += 1
        if outputs.get("sonia"):
            partes.append(f"- [{secao_num}. Sonia — Performance](#{secao_num}-sonia-performance)\n")

        partes.append("\n---\n\n")

        # PÁGINA 1 — RESUMO DOS AGENTES (só presentes)
        partes.append("## Resumo dos agentes\n\n")

        co = cards.get("card_otto", {})
        if co.get("presente") and outputs.get("otto"):
            partes.append("### Otto — Estratégia\n\n")
            partes.append(f"{co.get('resumo', '')}\n\n")

        ch = cards.get("card_heitor", {})
        if ch.get("presente") and outputs.get("heitor"):
            partes.append("### Heitor — Compliance\n\n")
            partes.append(f"{ch.get('resumo', '')}\n\n")

        cs = cards.get("card_salles", {})
        if cs.get("presente") and outputs.get("salles"):
            partes.append("### Salles — Roteiro\n\n")
            partes.append(f"{cs.get('resumo', '')}\n\n")

        cson = cards.get("card_sonia", {})
        if cson.get("presente") and outputs.get("sonia"):
            partes.append("### Sonia — Performance\n\n")
            partes.append(f"{cson.get('resumo', '')}\n\n")

        partes.append("---\n\n")

        # PÁGINAS COMPLETAS (só agentes presentes, na ordem Otto → Heitor → Salles → Sonia)
        secao_num = 1

        if outputs.get("otto"):
            partes.append(f"## {secao_num}. Otto — Estratégia\n\n")
            partes.append(str(outputs["otto"].get("output_humano", "(sem output humano)")) + "\n\n")
            partes.append("---\n\n")
            secao_num += 1

        if outputs.get("heitor"):
            partes.append(f"## {secao_num}. Heitor — Compliance\n\n")
            partes.append(str(outputs["heitor"].get("output_humano", "(sem output humano)")) + "\n\n")
            partes.append("---\n\n")
            secao_num += 1

        if outputs.get("salles"):
            partes.append(f"## {secao_num}. Salles — Roteiro\n\n")
            partes.append(str(outputs["salles"].get("output_humano", "(sem output humano)")) + "\n\n")
            partes.append("---\n\n")
            secao_num += 1

        if outputs.get("sonia"):
            partes.append(f"## {secao_num}. Sonia — Performance\n\n")
            partes.append(str(outputs["sonia"].get("output_humano", "(sem output humano)")) + "\n\n")
            partes.append("---\n\n")

        # RODAPÉ MÍNIMO
        partes.append(f"\n*Compilado por Aya | Lemmon Produções | {ts}*\n")

        return "".join(partes)
