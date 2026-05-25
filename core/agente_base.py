"""Classe base para todos os agentes Lemmon."""
import time
from abc import ABC, abstractmethod
from typing import Callable

from anthropic import Anthropic, APIConnectionError, APIError, AuthenticationError, RateLimitError

from .config import ANTHROPIC_API_KEY, MODELO_PADRAO, PROMPTS_DIR, resolver_modelo
from .custo import Custo
from .exemplares import formatar_exemplares_para_prompt
from .historico import Historico
from .logger import get_logger
from .tipos import AgenteResultado


def formatar_erro_anthropic(e: Exception) -> str:
    """Converte exceções do SDK Anthropic em mensagem pt-BR sem vazar internos."""
    s = str(getattr(e, "message", "") or e).lower()
    if "overloaded" in s:
        return "API Anthropic temporariamente sobrecarregada. Tente em 30 segundos."
    if "rate_limit" in s or "rate limit" in s:
        return "Limite de chamadas atingido. Aguarde alguns segundos."
    if "authentication" in s or "invalid api key" in s or "api key" in s:
        return "Chave da API inválida. Verifique ANTHROPIC_API_KEY."
    if "connection" in s or "timeout" in s:
        return "Sem conexão com a API Anthropic. Verifique sua internet."
    msg = str(getattr(e, "message", "") or e)
    return f"Erro temporário da API: {msg[:200]}"


class AgenteBase(ABC):
    nome: str = "agente_base"
    versao_prompt: str = "v1"
    max_tokens: int = 16384
    system_prompt_reuniao: str | None = None  # se definido, usado no modo conversacional
    modelo: str  # setado em __init__ via resolver_modelo(self.nome)

    def __init__(self):
        if not ANTHROPIC_API_KEY:
            raise RuntimeError(
                "ANTHROPIC_API_KEY não configurada. "
                "Verifique seu arquivo .env"
            )
        # Resolve modelo por agente (env var LEMMON_MODELO_<NOME> > MODELO_PADRAO).
        # Subclasse pode forçar um modelo específico sobrescrevendo após super().__init__().
        self.modelo = resolver_modelo(self.nome)
        self.client = Anthropic(api_key=ANTHROPIC_API_KEY)
        self.logger = get_logger(f"lemmon.{self.nome}")
        self.historico = Historico(self.nome)
        self.system_prompt = self._carregar_prompt()
        exemplares = formatar_exemplares_para_prompt(self.nome)
        if exemplares:
            self.system_prompt += exemplares

    def _carregar_prompt(self) -> str:
        arquivo = PROMPTS_DIR / f"{self.nome}_system_{self.versao_prompt}.md"
        if not arquivo.exists():
            raise FileNotFoundError(f"Prompt não encontrado: {arquivo}")
        return arquivo.read_text(encoding="utf-8")

    def _chamar_api(self, mensagens: list, tools: list = None,
                    tool_choice: dict = None, system_override: str = None):
        params = {
            "model": self.modelo,
            "max_tokens": self.max_tokens,
            "system": system_override or self.system_prompt,
            "messages": mensagens,
        }
        if tools:
            params["tools"] = tools
        if tool_choice:
            params["tool_choice"] = tool_choice

        inicio = time.time()
        try:
            response = self.client.messages.create(**params)
        except (AuthenticationError, RateLimitError, APIConnectionError, APIError) as e:
            raise RuntimeError(formatar_erro_anthropic(e))

        duracao = round(time.time() - inicio, 2)
        custo = Custo.calcular(
            response.usage.input_tokens,
            response.usage.output_tokens,
            modelo=self.modelo,
        )
        self.logger.info(f"Execução em {duracao}s | {custo.resumo()}")

        return response, custo, duracao

    def _chamar_api_chain(self, chamadas: list[dict]) -> tuple[list, float, float]:
        """Executa N chamadas INDEPENDENTES (mesma entrada, sem depender do output anterior).

        Use quando todas as chamadas podem ser descritas upfront (ex: 3 análises paralelas
        sobre o mesmo briefing). Para chamadas DEPENDENTES (output N-1 alimenta N),
        use _chamar_api() individualmente e some custos com _somar_custo().
        """
        responses, custo_total, dur_total = [], 0.0, 0.0
        for kwargs in chamadas:
            resp, custo, dur = self._chamar_api(**kwargs)
            responses.append(resp)
            custo_total += custo.custo_usd
            dur_total += dur
        return responses, custo_total, dur_total

    def _somar_custo(self, *custos_usd: float) -> float:
        """Soma custos de N chamadas _chamar_api() dependentes (onde cada uma usa o output da anterior)."""
        return sum(custos_usd)

    def _chamar_api_stream(self, mensagens: list, on_token: Callable[[str], None],
                           tools: list = None, tool_choice: dict = None,
                           system_override: str = None):
        """Como _chamar_api, mas chama on_token(text) para cada delta de texto."""
        params = {
            "model": self.modelo,
            "max_tokens": self.max_tokens,
            "system": system_override or self.system_prompt,
            "messages": mensagens,
        }
        if tools:
            params["tools"] = tools
        if tool_choice:
            params["tool_choice"] = tool_choice

        inicio = time.time()
        try:
            with self.client.messages.stream(**params) as stream:
                for text in stream.text_stream:
                    on_token(text)
                response = stream.get_final_message()
        except (AuthenticationError, RateLimitError, APIConnectionError, APIError) as e:
            raise RuntimeError(formatar_erro_anthropic(e))

        duracao = round(time.time() - inicio, 2)
        custo = Custo.calcular(
            response.usage.input_tokens,
            response.usage.output_tokens,
            modelo=self.modelo,
        )
        self.logger.info(f"Stream em {duracao}s | {custo.resumo()}")
        return response, custo, duracao

    def _formatar_historico_reuniao(self, historico: list[dict]) -> list[dict]:
        """Converte histórico multi-agente para formato user/assistant da API Anthropic."""
        msgs = []
        i = 0
        while i < len(historico):
            entry = historico[i]
            if entry["role"] == "user":
                msgs.append({"role": "user", "content": entry["content"]})
                i += 1
            else:
                partes = []
                while i < len(historico) and historico[i]["role"] != "user":
                    e = historico[i]
                    partes.append(f"[{e['role'].upper()}]: {e['content']}")
                    i += 1
                msgs.append({"role": "assistant", "content": "\n\n---\n\n".join(partes)})
        return msgs

    def responder(self, mensagem: str, historico_anterior: list[dict],
                  respostas_turno: list[dict] | None = None,
                  on_token: Callable[[str], None] | None = None) -> dict:
        """Responde conversacionalmente em modo reunião. Sem tool use forçado."""
        msgs = self._formatar_historico_reuniao(historico_anterior)

        conteudo = mensagem
        if respostas_turno:
            ctx = "\n".join(
                f"[{r['role'].upper()} já respondeu]: {r['content'][:400]}..."
                if len(r['content']) > 400 else f"[{r['role'].upper()} já respondeu]: {r['content']}"
                for r in respostas_turno
            )
            conteudo = f"{mensagem}\n\n---\n{ctx}"

        msgs.append({"role": "user", "content": conteudo})

        if on_token is not None:
            resp, custo, duracao = self._chamar_api_stream(
                msgs, on_token, system_override=self.system_prompt_reuniao or None
            )
        else:
            resp, custo, duracao = self._chamar_api(
                msgs, system_override=self.system_prompt_reuniao or None
            )
        texto = next((b.text for b in resp.content if hasattr(b, "text")), "")
        return {"output_humano": texto, "custo_total_usd": custo.custo_usd, "duracao": duracao}

    @abstractmethod
    def executar(self, *args, **kwargs) -> AgenteResultado:
        ...
