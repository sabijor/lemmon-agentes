"""Modelos Pydantic compartilhados do Lemmon API."""
from pydantic import BaseModel, Field


class AvaliacaoPayload(BaseModel):
    session_id: str
    nota: int          # 1–5
    observacoes: str = ""
    tags: list[str] = []


class ExportarPayload(BaseModel):
    session_id: str
    agente: str = "aya"


class FavoritarPayload(BaseModel):
    session_id: str
    favorito: bool


class ExemplarPayload(BaseModel):
    agente: str
    trecho: str
    contexto: str = ""
    session_id: str = ""


class TagsPayload(BaseModel):
    session_id: str
    tags: list[str] = []


class BriefingReversoPayload(BaseModel):
    transcricao: str


class CortesProntosPayload(BaseModel):
    transcricao: str
    duracoes: list[int] = [15, 30, 60]


class ComentarioPayload(BaseModel):
    autor: str = Field(default="Cliente", max_length=80)
    texto: str = Field(..., max_length=2000)


class SharePayload(BaseModel):
    session_id: str


class FeedbackPedroPayload(BaseModel):
    session_id: str
    elemento: str
    predicao_ia: str
    feedback_real: str
    nota_acerto: int
