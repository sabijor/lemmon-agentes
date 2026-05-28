"""Configuração centralizada do sistema Lemmon."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Paths
BASE_DIR = Path(__file__).parent.parent
PROMPTS_DIR = BASE_DIR / "prompts"
OUTPUTS_DIR = BASE_DIR / "outputs"
HISTORICO_DIR = BASE_DIR / "historico"
INPUTS_DIR = BASE_DIR / "inputs"
ESPELHO_CLIENTES_DIR = INPUTS_DIR / "clientes"  # inputs/clientes/<id>/

# API
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
MODELO_PADRAO = os.getenv("LEMMON_MODELO_PADRAO", "claude-sonnet-4-6")

# Custos (USD por 1M tokens) — Sonnet 4.6 (preservado por compatibilidade)
CUSTO_INPUT_USD_POR_MILHAO = 3.00
CUSTO_OUTPUT_USD_POR_MILHAO = 15.00

# Tabela de preços por modelo (USD por 1M tokens)
# Atualizar quando Anthropic mudar preços.
PRECOS_POR_MODELO: dict[str, dict[str, float]] = {
    "claude-opus-4-7":   {"input": 15.00, "output": 75.00},
    "claude-sonnet-4-6": {"input":  3.00, "output": 15.00},
    "claude-haiku-4-5":  {"input":  0.80, "output":  4.00},
}


def precos_do_modelo(modelo: str) -> dict[str, float]:
    """Retorna {input, output} em USD/1M tokens. Fallback = Sonnet 4.6."""
    return PRECOS_POR_MODELO.get(modelo, PRECOS_POR_MODELO["claude-sonnet-4-6"])


def resolver_modelo(nome_agente: str) -> str:
    """Resolve modelo do agente: `LEMMON_MODELO_<AGENTE>` > MODELO_PADRAO.

    Permite usar Opus pros agentes "pensadores" (Otto, Salles) e
    Sonnet pros "operacionais" via env var, sem alterar código.
    """
    env_var = f"LEMMON_MODELO_{nome_agente.upper()}"
    return os.getenv(env_var) or MODELO_PADRAO

# Validação de input
BRIEFING_MIN_CARACTERES = 50
BRIEFING_MAX_CARACTERES = 15000

# Logging
LOG_LEVEL = os.getenv("LEMMON_LOG_LEVEL", "INFO")

# ============================================================================
# LIMITES DO HEITOR (COMPLIANCE)
# ============================================================================

# Número padrão de buscas web por execução
HEITOR_MAX_BUSCAS_DEFAULT = 3

# Número de buscas em modo profundo (--profundo)
HEITOR_MAX_BUSCAS_PROFUNDO = 6

# Faixa de custo previsto por execução (pra estimativa pré-execução)
HEITOR_PREVISAO_RANGE_USD = (0.20, 0.40)

# Threshold de aviso amarelo durante execução
HEITOR_AVISO_AMARELO_USD = 0.50

# Threshold pra pedir confirmação antes de executar
# (None = nunca pede; valor = pede se previsão > esse valor)
HEITOR_PEDIR_CONFIRMACAO_ACIMA_USD = 0.50

# Threshold de aviso vermelho pós-execução
HEITOR_AVISO_VERMELHO_USD = 0.70

# Domínios oficiais permitidos pra busca
HEITOR_DOMINIOS_OFICIAIS = [
    # Meta oficial
    "transparency.meta.com",
    "transparency.fb.com",
    "facebook.com",
    "business.facebook.com",
    "help.instagram.com",
    "about.fb.com",
    # Órgãos brasileiros
    "gov.br",
    "anvisa.gov.br",
    "consultas.anvisa.gov.br",
    "conar.org.br",
    "portal.cfm.org.br",
    "cfm.org.br",
    "cfo.org.br",
    "cro.org.br",
    "crmsp.org.br",
    "crmrj.org.br",
    "cfn.org.br",
    "cff.org.br",
    "crfsp.org.br",    "cfp.org.br",
    "cfbio.gov.br",
    "coffito.gov.br",
]

# ============================================================================
# LIMITES DA SONIA (PERFORMANCE)
# ============================================================================

# Web search é opt-in
SONIA_WEB_SEARCH_DEFAULT = False

# Buscas
SONIA_MAX_BUSCAS_DEFAULT = 3
SONIA_MAX_BUSCAS_PROFUNDO = 5

# Faixa de custo previsto
SONIA_PREVISAO_RANGE_USD_SEM_BUSCA = (0.15, 0.25)
SONIA_PREVISAO_RANGE_USD_COM_BUSCA = (0.30, 0.50)

# Thresholds de aviso
SONIA_AVISO_AMARELO_USD = 0.40
SONIA_PEDIR_CONFIRMACAO_ACIMA_USD = 0.40
SONIA_AVISO_VERMELHO_USD = 0.65

# Cortes (Sonia decide quantos, dentro desses limites)
SONIA_CORTES_MIN = 1
SONIA_CORTES_MAX = 6

# Limites de tamanho (proteção contra prompt gigante)
SONIA_TENDENCIAS_MAX_CHARS = 8000
SONIA_ROTEIRO_MAX_CHARS = 30000
SONIA_HEITOR_CONTEXTO_MAX_TERMOS = 30  # trunca lista de termos do Heitor

# Threshold pra aviso de pipeline caro (somando todos os agentes)
PIPELINE_AVISO_CUSTO_TOTAL_USD = 1.00

# Domínios pra busca da Sonia
# IMPORTANTE: lista CONSERVADORA. Anthropic confirmadamente bloqueia jornais
# (estadao, valor, g1). Outros sites de marketing podem falhar — se acontecer,
# operador remove da lista.
SONIA_DOMINIOS_OFICIAIS = [
    # Meta oficial (sempre funciona)
    "transparency.meta.com",
    "transparency.fb.com",
    "facebook.com",
    "business.facebook.com",
    "help.instagram.com",
    "about.fb.com",
    "developers.facebook.com",
    "creators.facebook.com",
    "creators.instagram.com",
    # Análise de marketing (testar antes — pode falhar)
    "socialmediatoday.com",
    "buffer.com",
    "later.com",
    "hubspot.com",
    "sproutsocial.com",
]

# ============================================================================
# LIMITES DA AYA (ASSISTENTE VIRTUAL — COMPILADORA)
# ============================================================================

AYA_PREVISAO_RANGE_USD = (0.05, 0.20)
AYA_AVISO_AMARELO_USD = 0.25
AYA_AVISO_VERMELHO_USD = 0.40
AYA_PEDIR_CONFIRMACAO_ACIMA_USD = None

# Limites de tamanho
AYA_OUTPUT_AGENTE_MAX_CHARS = 15000
AYA_DOSSIE_MAX_CHARS_TOTAL = 100000

# Agentes que Aya tenta detectar (em ordem de aparição no dossiê)
AYA_AGENTES_PADRAO = ["otto", "heitor", "salles", "sonia"]

# Tamanho do resumo de cada agente na página 1 (chars máximos)
AYA_RESUMO_AGENTE_MAX_CHARS = 400

# ============================================================================
# LIMITES DO PEDRO (CONSULTOR CLIENTE — Dr. Pedro Abrahão / Hator Clinic)
# ============================================================================

PEDRO_PREVISAO_RANGE_USD = (0.05, 0.20)
PEDRO_AVISO_AMARELO_USD = 0.25
PEDRO_AVISO_VERMELHO_USD = 0.40
PEDRO_PEDIR_CONFIRMACAO_ACIMA_USD = None

# Limites de tamanho
PEDRO_INPUT_MAX_CHARS = 20000
PEDRO_CONTEXTO_OPCIONAL_MAX_CHARS = 15000
PEDRO_RESPOSTA_MAX_TOKENS = 4096

# Pasta com material primário do cliente (legado — novo padrão: ESPELHO_CLIENTES_DIR / "pedro")
PEDRO_MATERIAL_DIR = ESPELHO_CLIENTES_DIR / "pedro"

# ============================================================================
# AYA EXPORT v1.1 (HTML + PDF) — Design System AURA
# ============================================================================

# Caminho do design system AURA (referência visual)
AYA_DESIGN_SYSTEM_PATH = BASE_DIR / "design_system.html"

# Configurações de export
AYA_GERAR_HTML = True
AYA_GERAR_PDF = True

# Engine de PDF: 'weasyprint' (padrão) | 'playwright' (fallback)
AYA_PDF_ENGINE = "weasyprint"

# Tamanho máximo aceitável do PDF (alerta se passar)
AYA_PDF_MAX_SIZE_MB = 10

# ============================================================================
# LIMITES DA RENATA (DISTRIBUIÇÃO MULTI-PLATAFORMA)
# ============================================================================

# ============================================================================
# LIMITES DOS AGENTES ADMINISTRATIVOS HATOR — T166
# ============================================================================
# Ana Maria (CFO), Prichina (admin+RH), Caíto (COO), Kelly (contábil-tributária).
# Padrão simples: chamada API única, output markdown. Sem tool_use forçado.

ADMIN_BRIEFING_MAX_CHARS = 15000
ADMIN_CONTEXTO_MAX_CHARS = 20000
ADMIN_OUTPUT_MAX_TOKENS = 4096

# Faixas de custo — todos rodam Sonnet 4.6, similar custo
ADMIN_PREVISAO_RANGE_USD = (0.05, 0.20)
ADMIN_AVISO_AMARELO_USD = 0.25
ADMIN_AVISO_VERMELHO_USD = 0.40

# ============================================================================
# LIMITES DO CARLOS (ROTEIRISTA PUBLICITÁRIO — T161)
# ============================================================================

CARLOS_PREVISAO_RANGE_USD = (0.05, 0.20)
CARLOS_AVISO_AMARELO_USD = 0.25
CARLOS_AVISO_VERMELHO_USD = 0.40
CARLOS_PEDIR_CONFIRMACAO_ACIMA_USD = None

# Limites de input (proteção contra prompt gigante)
CARLOS_BRIEFING_MAX_CHARS = 15000
CARLOS_CONTEXTO_OTTO_MAX_CHARS = 20000
CARLOS_CONTEXTO_HEITOR_MAX_CHARS = 5000

# Tamanho típico do output (markdown)
CARLOS_OUTPUT_MAX_TOKENS = 4096

# ============================================================================
# LIMITES DA RENATA (DISTRIBUIÇÃO MULTI-PLATAFORMA)
# ============================================================================

RENATA_PREVISAO_RANGE_USD = (0.10, 0.25)
RENATA_AVISO_AMARELO_USD = 0.30
RENATA_AVISO_VERMELHO_USD = 0.50
RENATA_PEDIR_CONFIRMACAO_ACIMA_USD = None

# Tamanho máximo do dossiê enviado para a Renata (proteção contra prompt gigante)
RENATA_DOSSIE_MAX_CHARS = 80000

# Output_humano máximo (spec: ≤ 5000 chars)
RENATA_OUTPUT_MAX_CHARS = 5000

# Duração padrão de campanha em dias
RENATA_DURACAO_PADRAO_DIAS = 14
RENATA_DURACAO_MAX_DIAS = 60

# Limites de contexto injetado no prompt (proteção contra prompts gigantes)
RENATA_ROTEIRO_MAX_CHARS = 20000
RENATA_SONIA_MAX_CHARS = 10000
RENATA_HEITOR_MAX_CHARS = 5000
RENATA_VOZ_CLIENTE_MAX_CHARS = 3000  # trecho de transcrições para calibrar a voz do cliente
