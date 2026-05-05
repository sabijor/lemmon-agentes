"""Wrapper para uso do web_search tool da Anthropic.

IMPORTANTE:
- Versão usada: web_search_20250305 (estável, GA desde set/2025)
- Funciona com Sonnet 4.6 (testado em teste_websearch.py)
- Custo: $10/1000 buscas + tokens normais de processamento
"""
from typing import List, Dict
from core.config import HEITOR_DOMINIOS_OFICIAIS


def construir_tool_web_search_oficial(max_uses: int = 3) -> Dict:
    """
    Web search restrito a domínios oficiais (Meta + órgãos reguladores BR).

    Args:
        max_uses: máximo de buscas por execução
    """
    return {
        "type": "web_search_20250305",
        "name": "web_search",
        "max_uses": max_uses,
        "allowed_domains": HEITOR_DOMINIOS_OFICIAIS,
        "user_location": {
            "type": "approximate",
            "country": "BR",
            "city": "São Paulo",
            "region": "São Paulo",
            "timezone": "America/Sao_Paulo"
        }
    }


def construir_tool_web_search_amplo(max_uses: int = 6) -> Dict:
    """
    Web search SEM restrição de domínio.
    Usado quando operador autoriza explicitamente busca em fontes secundárias.
    """
    return {
        "type": "web_search_20250305",
        "name": "web_search",
        "max_uses": max_uses,
        "user_location": {
            "type": "approximate",
            "country": "BR",
            "city": "São Paulo",
            "region": "São Paulo",
            "timezone": "America/Sao_Paulo"
        }
    }


def extrair_fontes_consultadas(response_content: list) -> List[Dict]:
    """
    Extrai URLs e títulos das fontes consultadas pelo web_search.

    O response.content vem com blocos intercalados:
    - text (raciocínio)
    - tool_use (chamada do web_search)
    - web_search_tool_result (resultados)

    Retorna lista de {url, title} extraídos dos resultados.
    """
    fontes = []
    for bloco in response_content:
        if bloco.type == "web_search_tool_result":
            if hasattr(bloco, "content") and bloco.content:
                for resultado in bloco.content:
                    if hasattr(resultado, "url"):
                        fonte = {
                            "url": resultado.url,
                            "title": getattr(resultado, "title", ""),
                        }
                        if hasattr(resultado, "page_age"):
                            fonte["page_age"] = resultado.page_age
                        fontes.append(fonte)
    return fontes


def extrair_texto_raciocinio(response_content: list) -> str:
    """
    Extrai todo o texto produzido pelo modelo (raciocínio + análise final).
    Ignora tool_use blocks. Retorna string concatenada.
    """
    textos = []
    for bloco in response_content:
        if bloco.type == "text" and hasattr(bloco, "text"):
            textos.append(bloco.text)
    return "\n\n".join(textos)


def contar_buscas_realizadas(usage) -> int:
    """
    Lê quantas buscas foram realmente feitas (vem em usage.server_tool_use).
    Retorna 0 se não houver web_search.
    """
    if hasattr(usage, "server_tool_use"):
        return getattr(usage.server_tool_use, "web_search_requests", 0)
    return 0
