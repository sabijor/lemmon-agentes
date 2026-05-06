"""Classe genérica EspelhoCliente — base para todos os agentes espelho.

Uso:
    pedro = EspelhoCliente(
        id="pedro",
        nome="Dr. Pedro Abrahão",
        material_dir=INPUTS_DIR / "clientes" / "pedro",
        max_tokens=4096,
        previsao_range_usd=(0.05, 0.20),
        aviso_vermelho_usd=0.40,
        input_max_chars=20000,
        contexto_max_chars=15000,
    )
"""
from pathlib import Path
from typing import Optional

from core.agente_base import AgenteBase
from core.limites_espelho import aviso_pre_execucao, aviso_pos_execucao
from core.config import PROMPTS_DIR


class EspelhoCliente(AgenteBase):
    """Agente espelho genérico — calibrado para um cliente específico."""

    MODOS_VALIDOS = ["validacao", "consulta", "resposta_hipotetica"]

    def __init__(
        self,
        id: str,
        nome: str,
        material_dir: Path,
        max_tokens: int = 4096,
        previsao_range_usd: tuple = (0.05, 0.20),
        aviso_vermelho_usd: float = 0.40,
        input_max_chars: int = 20000,
        contexto_max_chars: int = 15000,
        versao_prompt: str = "v1",
    ):
        self.nome = id  # AgenteBase usa self.nome para carregar prompt
        self.versao_prompt = versao_prompt
        self.max_tokens = max_tokens
        self._nome_display = nome
        self._material_dir = material_dir
        self._previsao_range = previsao_range_usd
        self._aviso_vermelho = aviso_vermelho_usd
        self._input_max = input_max_chars
        self._contexto_max = contexto_max_chars

        super().__init__()

        material = self._carregar_material_primario()
        self.system_prompt_reuniao = self.system_prompt + "\n\n---\n\n" + material

    def _carregar_prompt(self) -> str:
        """Tenta carregar prompt específico do cliente; cai em prompt genérico."""
        arquivo = PROMPTS_DIR / f"{self.nome}_system_{self.versao_prompt}.md"
        if arquivo.exists():
            return arquivo.read_text(encoding="utf-8")
        # fallback: prompt genérico de espelho
        generico = PROMPTS_DIR / f"espelho_system_{self.versao_prompt}.md"
        if generico.exists():
            return generico.read_text(encoding="utf-8")
        raise FileNotFoundError(
            f"Prompt não encontrado: {arquivo}\n"
            f"Crie {arquivo} com o system prompt do cliente."
        )

    def _carregar_material_primario(self) -> str:
        partes = []
        for nome_arq, titulo in [
            ("dossie.md", "DOSSIÊ DE POSICIONAMENTO"),
            ("transcricoes.md", "TRANSCRIÇÕES REAIS"),
        ]:
            p = self._material_dir / nome_arq
            if p.exists():
                partes.append(f"# MATERIAL PRIMÁRIO — {titulo}\n\n")
                partes.append(p.read_text(encoding="utf-8"))
                partes.append("\n\n")
            else:
                self.logger.warning(f"Material não encontrado: {p}")
        return "".join(partes)

    def executar(
        self,
        pergunta: str,
        contexto_opcional: Optional[str] = None,
        modo: str = "consulta",
        tags: Optional[list] = None,
    ) -> dict:
        if modo not in self.MODOS_VALIDOS:
            raise ValueError(f"Modo inválido: {modo}. Use: {self.MODOS_VALIDOS}")
        if not pergunta or len(pergunta.strip()) < 10:
            raise ValueError("Pergunta muito curta (mín 10 chars).")
        if len(pergunta) > self._input_max:
            self.logger.warning(f"Pergunta truncada para {self._input_max} chars.")
            pergunta = pergunta[:self._input_max]
        if contexto_opcional and len(contexto_opcional) > self._contexto_max:
            self.logger.warning("Contexto truncado.")
            contexto_opcional = contexto_opcional[:self._contexto_max]

        self.logger.info(aviso_pre_execucao(self._nome_display, modo, self._previsao_range))

        user_message = self._construir_user_message(pergunta, contexto_opcional, modo)
        response, custo, duracao = self._chamar_api(
            mensagens=[{"role": "user", "content": user_message}],
            system_override=self.system_prompt_reuniao,
        )
        resposta = next((b.text for b in response.content if hasattr(b, "text")), "")
        if not resposta.strip():
            raise RuntimeError(f"{self._nome_display} não retornou resposta.")

        custo_total = custo.custo_usd
        self.logger.info(aviso_pos_execucao(self._nome_display, custo_total,
                                             self._previsao_range, self._aviso_vermelho))

        resultado = {
            "output_tecnico": {
                "modo_aplicado": modo,
                "pergunta_preview": pergunta[:300],
                "resposta_completa": resposta,
            },
            "output_humano": resposta,
            "modo_execucao": modo,
            "tags": tags or [],
            "fontes_consultadas": [],
            "custo_total_usd": round(custo_total, 6),
            "custo_total_brl_estimado": round(custo_total * 5.20, 4),
            "breakdown_custo": {"consulta_usd": round(custo_total, 6)},
            "modelo_usado": self.modelo,
            "versao_prompt": self.versao_prompt,
        }
        self.historico.registrar(resultado)
        return resultado

    def _construir_user_message(
        self, pergunta: str, contexto: Optional[str], modo: str
    ) -> str:
        partes = []
        instrucoes_modo = {
            "validacao": (
                "MODO VALIDAÇÃO: avalia se o texto está fiel à sua voz/posicionamento. "
                "Liste o que está fiel e o que precisa ajustar (com sugestão e POR QUÊ). "
                "Não dê veredicto final — apenas observações.\n\n"
            ),
            "consulta": (
                "MODO CONSULTA: responde como você responderia, considerando seu contexto.\n\n"
            ),
            "resposta_hipotetica": (
                "MODO RESPOSTA HIPOTÉTICA: responde como você falaria nessa situação.\n\n"
            ),
        }
        partes.append(instrucoes_modo.get(modo, ""))
        partes.append(f"PERGUNTA/COMANDO:\n{pergunta}\n\n")
        if contexto:
            partes.append(f"CONTEXTO ADICIONAL:\n---\n{contexto}\n---\n\n")
        partes.append(
            "LEMBRE-SE:\n"
            "- Declare nível de confiança no final (🟢 alta / 🟡 média / 🔴 baixa)\n"
            "- Recuse zonas fora do seu escopo profissional\n"
            "- Use sua voz real\n"
        )
        return "".join(partes)
