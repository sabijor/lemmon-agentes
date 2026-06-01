from dotenv import load_dotenv
# T185.8 — override=True garante que o .env sobrescreva vars vazias do shell
# (sem isso, ANTHROPIC_API_KEY="" do shell ganhava do .env e o cliente Anthropic falhava)
load_dotenv(override=True)

from api.main import app  # noqa: F401,E402
