"""Base compartilhada dos agentes administrativos da Hator (T166).

Ana Maria, Prichina, Caíto e Kelly seguem o mesmo padrão:
- Recebem briefing do operador
- Aceitam contextos opcionais (planilhas coladas no chat, outputs de outros
  admin agents quando aplicável)
- Fazem 1 chamada API e retornam markdown estruturado

Sem tool_use forçado — output é prosa que o operador lê. Tributação e
contexto Hator já estão embutidos no prompt de sistema de cada um.
"""
from typing import Optional

from core.agente_base import AgenteBase
from core.config import (
    ADMIN_BRIEFING_MAX_CHARS,
    ADMIN_CONTEXTO_MAX_CHARS,
    ADMIN_OUTPUT_MAX_TOKENS,
)
from core.tipos import AgenteResultado


class AgenteAdminBase(AgenteBase):
    """Comportamento padrão dos 4 agentes administrativos."""

    max_tokens = ADMIN_OUTPUT_MAX_TOKENS
    categoria = "administrativo"
    custo_medio_usd = 0.10

    # Cada subclasse define:
    # nome, versao_prompt, papel_curto, quando_usar, quando_nao_usar

    def executar(
        self,
        briefing: str,
        contexto_extra: Optional[str] = None,
        contextos_agentes: Optional[dict[str, str]] = None,
    ) -> AgenteResultado:
        """Padrão administrativo: briefing + contexto opcional → markdown.

        Args:
            briefing: pedido do operador.
            contexto_extra: planilha colada, lista de NFs, observações livres.
            contextos_agentes: outputs de outros admin agents pra correlacionar
                (ex: Caíto recebe outputs de Ana Maria, Prichina e Kelly).
        """
        briefing = (briefing or "").strip()[:ADMIN_BRIEFING_MAX_CHARS]
        if not briefing:
            raise ValueError("briefing é obrigatório")

        self.logger.info(f"{self.nome.capitalize()} iniciando | briefing={len(briefing)} chars")

        partes = [f"## Pergunta do operador (Calebe)\n\n{briefing}"]

        if contexto_extra:
            partes.append(
                f"## Contexto adicional fornecido\n\n"
                f"{contexto_extra[:ADMIN_CONTEXTO_MAX_CHARS]}"
            )

        if contextos_agentes:
            for ag, out in contextos_agentes.items():
                if not out:
                    continue
                partes.append(
                    f"## Insumo recente do agente {ag.replace('_', ' ').capitalize()}\n\n"
                    f"{out[:ADMIN_CONTEXTO_MAX_CHARS]}"
                )

        partes.append(
            "Agora responda seguindo seu prompt de sistema. "
            "Direto, com números na ponta quando aplicável. "
            "Se faltar dado crítico, peça em vez de chutar."
        )

        mensagens = [{"role": "user", "content": "\n\n---\n\n".join(partes)}]

        response, custo, duracao = self._chamar_api(mensagens)

        texto = ""
        for bloco in response.content:
            if hasattr(bloco, "text"):
                texto += bloco.text
        texto = texto.strip()

        if not texto:
            raise RuntimeError(f"{self.nome.capitalize()} não retornou conteúdo.")

        try:
            self.historico.salvar(
                input_resumido=briefing[:300],
                output={
                    "output_humano": texto,
                    "tem_contexto_extra": bool(contexto_extra),
                    "agentes_referenciados": list((contextos_agentes or {}).keys()),
                },
                custo=custo,
                duracao_segundos=duracao,
            )
        except Exception as exc:  # noqa: BLE001
            self.logger.warning("Falha ao salvar histórico de %s: %s", self.nome, exc)

        self.logger.info(f"{self.nome.capitalize()} concluído | {duracao}s | ${custo.custo_usd:.4f}")

        return {
            "agente": self.nome,
            "output_humano": texto,
            "output_tecnico": {
                "tem_contexto_extra": bool(contexto_extra),
                "agentes_referenciados": list((contextos_agentes or {}).keys()),
            },
            "custo_total_usd": custo.custo_usd,
            "duracao_segundos": duracao,
            "modelo_usado": self.modelo,
            "versao_prompt": self.versao_prompt,
        }
