"""Banco de datas comemorativas BR filtradas por nicho — uso exclusivo da Renata."""
from datetime import date
from typing import Optional

# Datas fixas: (MM-DD, nome, tags)
DATAS_FIXAS: list[dict] = [
    # ── Nacional ──────────────────────────────────────────
    {"data": "01-01", "nome": "Confraternização Universal", "tags": ["nacional"]},
    {"data": "02-14", "nome": "Dia dos Namorados (BR)", "tags": ["nacional", "mulher"]},
    {"data": "03-08", "nome": "Dia Internacional da Mulher", "tags": ["mulher", "saude"]},
    {"data": "04-22", "nome": "Dia do Descobrimento do Brasil", "tags": ["nacional"]},
    {"data": "05-01", "nome": "Dia do Trabalho", "tags": ["nacional"]},
    {"data": "05-11", "nome": "Dia das Mães", "tags": ["mulher", "nacional"]},
    {"data": "06-12", "nome": "Dia dos Namorados (oficial)", "tags": ["nacional"]},
    {"data": "06-28", "nome": "Dia do Orgulho LGBTQIA+", "tags": ["nacional"]},
    {"data": "07-20", "nome": "Dia do Amigo", "tags": ["nacional"]},
    {"data": "08-10", "nome": "Dia do Médico", "tags": ["saude", "medico"]},
    {"data": "08-11", "nome": "Dia do Estudante", "tags": ["nacional"]},
    {"data": "09-07", "nome": "Independência do Brasil", "tags": ["nacional"]},
    {"data": "10-02", "nome": "Dia do Idoso", "tags": ["saude", "medico"]},
    {"data": "10-05", "nome": "Dia do Professor", "tags": ["nacional"]},
    {"data": "10-12", "nome": "Nossa Senhora Aparecida / Dia das Crianças", "tags": ["nacional"]},
    {"data": "11-02", "nome": "Finados", "tags": ["nacional"]},
    {"data": "11-15", "nome": "Proclamação da República", "tags": ["nacional"]},
    {"data": "11-20", "nome": "Consciência Negra", "tags": ["nacional"]},
    {"data": "12-25", "nome": "Natal", "tags": ["nacional"]},
    {"data": "12-31", "nome": "Réveillon", "tags": ["nacional"]},
    # ── Saúde ─────────────────────────────────────────────
    {"data": "02-04", "nome": "Dia Mundial do Câncer", "tags": ["saude", "medico"]},
    {"data": "03-24", "nome": "Dia Mundial da Tuberculose", "tags": ["saude"]},
    {"data": "04-07", "nome": "Dia Mundial da Saúde", "tags": ["saude", "medico"]},
    {"data": "04-17", "nome": "Dia Nacional do Combate ao Tabagismo", "tags": ["saude"]},
    {"data": "05-05", "nome": "Dia Mundial da Higiene das Mãos", "tags": ["saude"]},
    {"data": "05-29", "nome": "Dia Nacional de Controle da Hipertensão", "tags": ["saude", "medico"]},
    {"data": "06-26", "nome": "Dia Nacional de Combate às Drogas", "tags": ["saude"]},
    {"data": "07-28", "nome": "Dia Mundial da Hepatite", "tags": ["saude"]},
    {"data": "08-01", "nome": "Semana Mundial do Aleitamento Materno", "tags": ["saude", "mulher"]},
    {"data": "09-29", "nome": "Dia Mundial do Coração", "tags": ["saude", "medico"]},
    {"data": "10-14", "nome": "Dia Mundial do Diabetes Tipo 1", "tags": ["saude", "medico"]},
    {"data": "10-29", "nome": "Dia Mundial do AVC", "tags": ["saude", "medico"]},
    {"data": "11-14", "nome": "Dia Mundial do Diabetes", "tags": ["saude", "medico"]},
    {"data": "11-19", "nome": "Dia Mundial da Diabetes Tipo 2", "tags": ["saude", "medico"]},
    {"data": "12-01", "nome": "Dia Mundial da AIDS", "tags": ["saude"]},
    # ── Mulher / Feminino ─────────────────────────────────
    {"data": "05-28", "nome": "Dia Internacional de Ação pela Saúde da Mulher", "tags": ["mulher", "saude"]},
    {"data": "06-01", "nome": "Início do junho — atenção para violência de gênero", "tags": ["mulher"]},
    {"data": "08-09", "nome": "Dia das Avós", "tags": ["mulher"]},
    {"data": "09-06", "nome": "Dia da Beleza", "tags": ["mulher", "beleza"]},
    {"data": "11-25", "nome": "Dia Internacional pelo Fim da Violência contra Mulheres", "tags": ["mulher"]},
    # ── Médico / Especialidades ───────────────────────────
    {"data": "01-20", "nome": "Dia da Medicina (Brasil)", "tags": ["medico", "saude"]},
    {"data": "03-14", "nome": "Dia do Ortopedista", "tags": ["medico", "saude"]},
    {"data": "04-18", "nome": "Dia do Nutricionista", "tags": ["medico", "saude"]},
    {"data": "07-11", "nome": "Dia do Endocrinologista", "tags": ["medico", "saude"]},
    {"data": "09-23", "nome": "Dia do Psicólogo", "tags": ["medico", "saude"]},
    {"data": "10-01", "nome": "Dia do Médico de Família", "tags": ["medico", "saude"]},
    # ── Esporte / Performance ─────────────────────────────
    {"data": "04-06", "nome": "Dia do Esporte", "tags": ["esporte", "saude"]},
    {"data": "06-23", "nome": "Dia do Atleta (Dia do Esporte)", "tags": ["esporte"]},
    # ── Beleza ────────────────────────────────────────────
    {"data": "09-06", "nome": "Dia da Beleza", "tags": ["beleza"]},
    {"data": "10-10", "nome": "Dia Nacional da Estética", "tags": ["beleza"]},
]

# Datas móveis pré-calculadas (feriados que mudam ano a ano)
DATAS_MOVEIS: dict[int, dict[str, str]] = {
    2026: {
        "carnaval":      "2026-02-17",
        "pascoa":        "2026-04-05",
        "corpus_christi":"2026-06-04",
        "tiradentes":    "2026-04-21",
    },
    2027: {
        "carnaval":      "2027-03-02",
        "pascoa":        "2027-03-28",
        "corpus_christi":"2027-05-27",
        "tiradentes":    "2027-04-21",
    },
}
DATAS_MOVEIS_TAGS: dict[str, list[str]] = {
    "carnaval":       ["nacional"],
    "pascoa":         ["nacional"],
    "corpus_christi": ["nacional"],
    "tiradentes":     ["nacional"],
}

# Campanhas de mês inteiro: (MM-DD início, MM-DD fim, tags)
CAMPANHAS_MES_INTEIRO: dict[str, tuple[str, str, list[str]]] = {
    "outubro_rosa":      ("10-01", "10-31", ["mulher", "saude"]),
    "novembro_azul":     ("11-01", "11-30", ["medico", "saude"]),
    "setembro_amarelo":  ("09-01", "09-30", ["saude"]),
    "agosto_dourado":    ("08-01", "08-31", ["saude", "mulher"]),  # amamentação
    "fevereiro_roxo":    ("02-01", "02-29", ["saude"]),            # Alzheimer
    "marco_lilas":       ("03-01", "03-31", ["mulher", "saude"]),  # Endometriose
    "julho_amarelo":     ("07-01", "07-31", ["saude"]),            # Hepatites virais
}


def datas_na_janela(
    inicio: date,
    fim: date,
    nichos: Optional[list[str]] = None,
) -> list[dict]:
    """
    Retorna datas comemorativas na janela [inicio, fim] filtradas por nichos.

    Args:
        inicio: data de início da campanha
        fim: data de fim da campanha
        nichos: lista de tags pra filtrar (ex: ["saude", "mulher"])
                Se None ou vazio, retorna todas as datas.

    Returns:
        Lista de dicts com: data (date), nome (str), tags (list), tipo (str)
    """
    nichos_set = set(nichos or [])
    ano = inicio.year
    resultado: list[dict] = []

    def _relevante(tags: list[str]) -> bool:
        if not nichos_set:
            return True
        return bool(nichos_set.intersection(tags))

    def _na_janela(d: date) -> bool:
        return inicio <= d <= fim

    # Datas fixas
    for item in DATAS_FIXAS:
        if not _relevante(item["tags"]):
            continue
        mes, dia = item["data"].split("-")
        for ano_ref in {inicio.year, fim.year}:
            try:
                d = date(ano_ref, int(mes), int(dia))
                if _na_janela(d):
                    resultado.append({
                        "data": d,
                        "nome": item["nome"],
                        "tags": item["tags"],
                        "tipo": "data_fixa",
                    })
            except ValueError:
                pass  # ex: 02-29 em ano não bissexto

    # Datas móveis
    moveis_ano = DATAS_MOVEIS.get(ano, {})
    for chave, data_str in moveis_ano.items():
        tags = DATAS_MOVEIS_TAGS.get(chave, ["nacional"])
        if not _relevante(tags):
            continue
        try:
            d = date.fromisoformat(data_str)
            if _na_janela(d):
                resultado.append({
                    "data": d,
                    "nome": chave.replace("_", " ").title(),
                    "tags": tags,
                    "tipo": "data_movel",
                })
        except ValueError:
            pass

    # Campanhas de mês inteiro (anota apenas o primeiro dia visível na janela)
    for campanha, (inicio_str, fim_str, tags) in CAMPANHAS_MES_INTEIRO.items():
        if not _relevante(tags):
            continue
        mes_i, dia_i = inicio_str.split("-")
        mes_f, dia_f = fim_str.split("-")
        for ano_ref in {inicio.year, fim.year}:
            try:
                c_inicio = date(ano_ref, int(mes_i), int(dia_i))
                c_fim = date(ano_ref, int(mes_f), min(int(dia_f), 28 if int(mes_f) == 2 else 31))
                # sobreposição com a janela?
                if c_inicio <= fim and c_fim >= inicio:
                    dia_rep = max(c_inicio, inicio)
                    resultado.append({
                        "data": dia_rep,
                        "nome": campanha.replace("_", " ").title(),
                        "tags": tags,
                        "tipo": "campanha_mes",
                        "campanha_fim": c_fim,
                    })
            except ValueError:
                pass

    # Deduplicar por data+nome e ordenar
    vistos: set[tuple] = set()
    dedup: list[dict] = []
    for r in sorted(resultado, key=lambda x: x["data"]):
        chave_unica = (r["data"], r["nome"])
        if chave_unica not in vistos:
            vistos.add(chave_unica)
            dedup.append(r)

    return dedup
