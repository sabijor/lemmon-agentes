"""Rota T34 — transcrição de áudio via Whisper."""
import asyncio
import os

from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter()


@router.post("/transcrever")
async def transcrever_audio(audio: UploadFile = File(...)):
    """T34: Transcreve arquivo de áudio .mp3/.m4a/.wav em texto (requer OPENAI_API_KEY)."""
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY não configurada. Adicione ao .env para usar transcrição de áudio.",
        )
    try:
        import io

        import openai as _openai  # type: ignore[import]
        client = _openai.OpenAI(api_key=openai_key)
        content = await audio.read()
        buf = io.BytesIO(content)
        buf.name = audio.filename or "audio.mp3"
        transcription = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: client.audio.transcriptions.create(
                model="whisper-1",
                file=buf,
                language="pt",
            ),
        )
        return {"transcricao": transcription.text}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro na transcrição: {exc}") from exc
