"""Logger unificado para todos os agentes."""
import logging
import sys

from .config import BASE_DIR, LOG_LEVEL


def get_logger(nome: str) -> logging.Logger:
    logger = logging.getLogger(nome)
    if logger.handlers:
        return logger

    logger.setLevel(LOG_LEVEL)

    formato = logging.Formatter(
        "%(asctime)s | %(name)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    # Stdout
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(formato)
    logger.addHandler(sh)

    # Arquivo
    log_dir = BASE_DIR / "historico"
    log_dir.mkdir(exist_ok=True)
    fh = logging.FileHandler(log_dir / "lemmon.log", encoding="utf-8")
    fh.setFormatter(formato)
    logger.addHandler(fh)

    return logger
