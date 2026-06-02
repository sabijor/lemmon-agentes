"""Logger unificado para todos os agentes."""
import logging
import sys
from logging.handlers import RotatingFileHandler

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

    # Arquivo com rotação (Q-04 — antes era FileHandler sem rotação:
    # em 1 mês de uso o arquivo virava GBs. Agora 10MB max × 5 backups = 50MB teto).
    log_dir = BASE_DIR / "historico"
    log_dir.mkdir(exist_ok=True)
    fh = RotatingFileHandler(
        log_dir / "lemmon.log",
        maxBytes=10 * 1024 * 1024,  # 10 MB
        backupCount=5,
        encoding="utf-8",
    )
    fh.setFormatter(formato)
    logger.addHandler(fh)

    return logger
