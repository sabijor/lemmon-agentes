"""Persistência de histórico (Camada 2 — base para RAG futuro)."""
import json
from datetime import datetime
from pathlib import Path

from .config import HISTORICO_DIR


class Historico:
    def __init__(self, agente_nome: str):
        self.agente_nome = agente_nome
        self.dir = HISTORICO_DIR / agente_nome
        self.dir.mkdir(parents=True, exist_ok=True)

    def registrar(self, registro: dict) -> Path:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        registro["timestamp"] = datetime.now().isoformat()
        registro["agente"] = self.agente_nome

        registro.setdefault("observacoes_operador", "")
        registro.setdefault("avaliacao", None)
        registro.setdefault("favorito", False)
        registro.setdefault("correcoes_aplicadas", "")
        registro.setdefault("tags", [])
        registro.setdefault("fontes_consultadas", [])  # Heitor
        registro.setdefault("web_search_requests", 0)  # Heitor

        arquivo = self.dir / f"{timestamp}.json"
        arquivo.write_text(
            json.dumps(registro, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        return arquivo

    def listar(self, limite: int = 10) -> list:
        arquivos = sorted(self.dir.glob("*.json"), reverse=True)[:limite]
        return [json.loads(a.read_text(encoding="utf-8")) for a in arquivos]

    def listar_favoritas(self) -> list:
        todos = self.listar(limite=1000)
        return [r for r in todos if r.get("favorito") is True]

    def buscar_pendentes_avaliacao(self) -> list:
        todos = self.listar(limite=1000)
        return [r for r in todos if r.get("avaliacao") is None]

    def atualizar_avaliacao(self, timestamp: str, avaliacao: int,
                            observacoes: str = "", correcoes: str = "",
                            tags: list = None):
        for arq in self.dir.glob("*.json"):
            if arq.stem.startswith(timestamp[:15]):
                dados = json.loads(arq.read_text(encoding="utf-8"))
                dados["avaliacao"] = avaliacao
                dados["observacoes_operador"] = observacoes
                dados["correcoes_aplicadas"] = correcoes
                if tags is not None:
                    dados["tags"] = tags
                arq.write_text(
                    json.dumps(dados, ensure_ascii=False, indent=2),
                    encoding="utf-8"
                )
                return arq
        return None
