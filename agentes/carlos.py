"""Carlos | Roteirista Publicitário — alternativo ao Salles.

Função: entrega FALAS LITERAIS (o que sai da boca de quem grava) com hook +
corpo + CTA + variações de hook A/B/C. Ideal pra cliente solo, ad pago,
narração ou conteúdo de marca que não passa por entrevista documental.

Não substitui o Salles — é alternativo. O auto-roteador escolhe:
- Salles: entrevista documental, set, captação dirigida
- Carlos: solo/falado/narrado, fala literal, ad pago

Arquitetura: 1 chamada API com texto livre (markdown). Sem tool_use forçado —
o output é prosa estruturada que o operador lê e usa.
"""
from typing import Optional

from core.agente_base import AgenteBase
from core.config import (
    CARLOS_BRIEFING_MAX_CHARS,
    CARLOS_CONTEXTO_HEITOR_MAX_CHARS,
    CARLOS_CONTEXTO_OTTO_MAX_CHARS,
    CARLOS_OUTPUT_MAX_TOKENS,
)
from core.tipos import AgenteResultado


class Carlos(AgenteBase):
    nome = "carlos"
    versao_prompt = "v1"
    max_tokens = CARLOS_OUTPUT_MAX_TOKENS

    papel_curto = "Roteirista publicitário — falas literais com hook + CTA"
    quando_usar = [
        "conteúdo solo do cliente (não-entrevista) — dono atua/narra",
        "ad pago com fala/narração",
        "post de marca com texto literal pra gravar",
        "voiceover sobre b-roll",
        "criador externo que precisa de fala pronta pra decorar",
    ]
    quando_nao_usar = [
        "entrevista documental com personagem real (use Salles em vez)",
        "captação de set com direção de conversa",
        "calendário editorial sem conteúdo específico",
    ]
    categoria = "conteudo"
    custo_medio_usd = 0.10

    def executar(
        self,
        briefing: str,
        contexto_otto: Optional[str] = None,
        contexto_heitor: Optional[str] = None,
        formato: str = "auto",
    ) -> AgenteResultado:
        """Produz roteiro literal a partir do briefing + análise estratégica.

        Args:
            briefing: pedido do operador.
            contexto_otto: output_humano do Otto (tese + conceito + tradução prática).
            contexto_heitor: output_humano do Heitor (compliance Meta), opcional.
            formato: 'auto' deixa Carlos decidir (Reels, Story, Ad, Voiceover, Post).
        """
        briefing = (briefing or "").strip()[:CARLOS_BRIEFING_MAX_CHARS]
        if not briefing:
            raise ValueError("briefing é obrigatório")

        self.logger.info(f"Carlos iniciando | formato={formato} | briefing={len(briefing)} chars")

        # Monta a mensagem do user com todos os contextos disponíveis
        partes = [f"## Briefing do operador\n\n{briefing}"]
        if contexto_otto:
            partes.append(
                f"## Análise estratégica do Otto\n\n"
                f"{contexto_otto[:CARLOS_CONTEXTO_OTTO_MAX_CHARS]}"
            )
        if contexto_heitor:
            partes.append(
                f"## Diretrizes de compliance do Heitor\n\n"
                f"{contexto_heitor[:CARLOS_CONTEXTO_HEITOR_MAX_CHARS]}\n\n"
                "Considere essas diretrizes. Quando precisar discordar, "
                "registre ressalva INLINE no bloco correspondente."
            )
        partes.append(
            f"## Formato solicitado\n\n"
            f"{formato}\n\n"
            "Se 'auto', escolha o formato que mais respeita a tese do Otto "
            "(Reels, Story, Ad, Voiceover, Post). Identifique o formato no "
            "topo do output."
        )
        partes.append(
            "Agora produza o roteiro completo seguindo seu prompt de sistema: "
            "conceito rápido + roteiro literal por cenas + 3 variações de hook. "
            "Toda fala entre aspas, sem 'fale sobre...'. Entregue a fala."
        )

        mensagens = [{"role": "user", "content": "\n\n---\n\n".join(partes)}]

        response, custo, duracao = self._chamar_api(mensagens)

        # Extrai texto da resposta
        texto = ""
        for bloco in response.content:
            if hasattr(bloco, "text"):
                texto += bloco.text
        texto = texto.strip()

        if not texto:
            raise RuntimeError("Carlos não retornou conteúdo.")

        # Salva no histórico próprio do agente
        try:
            self.historico.salvar(
                input_resumido=briefing[:300],
                output={
                    "formato_solicitado": formato,
                    "output_humano": texto,
                    "tem_contexto_otto": bool(contexto_otto),
                    "tem_contexto_heitor": bool(contexto_heitor),
                },
                custo=custo,
                duracao_segundos=duracao,
            )
        except Exception as exc:  # noqa: BLE001
            self.logger.warning("Falha ao salvar histórico do Carlos: %s", exc)

        self.logger.info(f"Carlos concluído | {duracao}s | ${custo.custo_usd:.4f}")

        return {
            "agente": self.nome,
            "output_humano": texto,
            "output_tecnico": {
                "formato_solicitado": formato,
                "tem_contexto_otto": bool(contexto_otto),
                "tem_contexto_heitor": bool(contexto_heitor),
            },
            "custo_total_usd": custo.custo_usd,
            "duracao_segundos": duracao,
            "modelo_usado": self.modelo,
            "versao_prompt": self.versao_prompt,
        }
