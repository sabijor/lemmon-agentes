"""Rota T34 — transcrição de áudio via Whisper."""
import asyncio
import os

from fastapi import APIRouter, File, HTTPException, UploadFile

from api.deps import LEMMON_EXECUTOR

router = APIRouter()


# SEC-F — limites: tamanho máximo + tipos permitidos
_MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25MB — limite Whisper
_ALLOWED_AUDIO_TYPES = {
    "audio/mpeg", "audio/mp4", "audio/m4a", "audio/wav", "audio/x-wav",
    "audio/wave", "audio/webm", "audio/ogg", "audio/opus",
}


@router.post("/transcrever")
async def transcrever_audio(audio: UploadFile = File(...)):
    """T34: Transcreve arquivo de áudio em texto (requer OPENAI_API_KEY).

    SEC-F — valida content_type + tamanho antes de carregar na RAM.
    """
    # SEC-F — content-type check
    if audio.content_type and audio.content_type not in _ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Tipo de áudio não suportado: {audio.content_type}. Use mp3/m4a/wav/webm/ogg.",
        )
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
        # SEC-F — cap de tamanho ANTES de continuar
        if len(content) > _MAX_AUDIO_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Áudio muito grande (limite 25MB). Tamanho atual: {len(content) // (1024*1024)}MB.",
            )
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Áudio vazio.")
        buf = io.BytesIO(content)
        buf.name = audio.filename or "audio.mp3"
        transcription = await asyncio.get_running_loop().run_in_executor(
            LEMMON_EXECUTOR,
            lambda: client.audio.transcriptions.create(
                model="whisper-1",
                file=buf,
                language="pt",
            ),
        )
        return {"transcricao": transcription.text}
    except HTTPException:
        raise
    except Exception as exc:
        # SEC-G — log interno + mensagem amigável (não vaza traceback do OpenAI)
        import logging
        logging.getLogger("lemmon.transcrever").error("Erro Whisper: %s", exc)
        raise HTTPException(status_code=502, detail="Não consegui transcrever o áudio. Tente novamente.") from exc
