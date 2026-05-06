#!/usr/bin/env python3
"""Wizard de onboarding de novo cliente espelho.

Uso:
    python onboard_cliente.py
    python onboard_cliente.py --id marina --nome "Marina Costa" --nicho "nutrição"

Cria:
    inputs/clientes/<id>/dossie.md
    inputs/clientes/<id>/transcricoes.md
    prompts/<id>_system_v1.md
    outputs/<id>/   (pasta de outputs)

E imprime o snippet TypeScript para colar em dashboard/lib/agents.ts.
"""
import argparse
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent
INPUTS_DIR = BASE_DIR / "inputs"
PROMPTS_DIR = BASE_DIR / "prompts"
OUTPUTS_DIR = BASE_DIR / "outputs"
CLIENTES_DIR = INPUTS_DIR / "clientes"

DOSSIE_TEMPLATE = """\
# Dossiê de Posicionamento — {nome}

> Preencha cada seção antes de ativar o agente.
> Quanto mais rico o dossiê, mais fiel o espelho.

---

## Quem é {nome}?

<!-- Escreva 2-3 parágrafos descrevendo a pessoa: formação, trajetória, o que faz hoje. -->

---

## Nicho e público

- **Nicho:** {nicho}
- **Público-alvo:** <!-- ex: mulheres 35-55, executivos C-level, pais de crianças 0-5 -->
- **Dor principal do público:** <!-- o que tira o sono deles -->

---

## Posicionamento

- **O que {nome} faz de diferente:** <!-- o que só ele/ela entrega -->
- **Tom de voz:** <!-- ex: técnico mas humano, inspirador, direto, didático -->
- **Palavras e expressões frequentes:** <!-- cacoetes, vocabulário próprio -->
- **O que nunca diz:** <!-- termos, abordagens ou temas que fogem da identidade -->

---

## Zonas de recusa do espelho IA

O agente espelho de {nome} NUNCA deve:
- Dar diagnósticos individuais
- Comprometer-se com resultados específicos sem contexto
- Falar sobre decisões estratégicas grandes sem dados
- <!-- Adicione outras zonas aqui -->

---

## Projetos e contexto atual

<!-- Quais são os projetos/temas em pauta para {nome} agora? -->

---

## Nível de confiança padrão

- 🟢 Alta confiança: temas de <!-- lista -->
- 🟡 Média confiança: temas de <!-- lista -->
- 🔴 Baixa confiança / recusa: <!-- lista -->
"""

TRANSCRICOES_TEMPLATE = """\
# Transcrições Reais — {nome}

> Cole aqui transcrições de vídeos, entrevistas, podcasts, posts longos.
> Quanto mais material real, mais fiel a voz do espelho.
> Formato sugerido: data, fonte, trecho.

---

## [Data] [Fonte — ex: Instagram, podcast X]

<!-- Cole a transcrição aqui -->

---

## [Data] [Fonte]

<!-- Cole a transcrição aqui -->
"""

SYSTEM_PROMPT_TEMPLATE = """\
# Você é {nome} (versão consultor IA da Lemmon Produções)

Você é AGENTE ESPELHO de {nome}, {nicho}. Você existe como CONSULTOR para
Calebe Alves (Lemmon Produções) usar quando produz conteúdo para {nome}.

Você NÃO é {nome_curto} real. Você é uma APROXIMAÇÃO baseada em material que
ele/ela aprovou + transcrições reais.

---

## QUEM VOCÊ É

<!-- Complete com as informações do dossiê após preenchê-lo -->
- Nome: {nome}
- Nicho: {nicho}
- Público: (preencher após dossiê)
- Tom de voz: (preencher após dossiê)

---

## COMO VOCÊ RESPONDE

1. **Fala na primeira pessoa** como {nome_curto}
2. **Usa o tom e vocabulário** documentados no dossiê
3. **Declara nível de confiança** no final de cada resposta (🟢/🟡/🔴)
4. **Recusa zonas** listadas no dossiê com educação e justificativa
5. **Não inventa** casos clínicos, dados ou histórias não documentadas

---

## MODOS DE OPERAÇÃO

- **validacao**: avalia se texto está fiel à sua voz/posicionamento
- **consulta**: responde como você responderia a uma pergunta
- **resposta_hipotetica**: simula como você reagiria a uma situação

---

## MATERIAL PRIMÁRIO

O material de dossiê e transcrições virá injetado na conversa.
Use-o como base primária. Quando não souber, declare incerteza (🔴).
"""


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[áàãâä]", "a", text)
    text = re.sub(r"[éèêë]", "e", text)
    text = re.sub(r"[íìîï]", "i", text)
    text = re.sub(r"[óòõôö]", "o", text)
    text = re.sub(r"[úùûü]", "u", text)
    text = re.sub(r"[ç]", "c", text)
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def perguntar(prompt: str, default: str = "") -> str:
    resp = input(f"{prompt}{f' [{default}]' if default else ''}: ").strip()
    return resp or default


def gerar_snippet_ts(id_agente: str, nome: str, nicho: str, cor: str) -> str:
    cor_dim = cor + "20"  # transparência leve
    return f"""
  // ── Adicionar em dashboard/lib/agents.ts ──────────────────────────────
  {{
    id: '{id_agente}',
    name: '{nome.split()[0]}',       // primeiro nome
    title: '{nicho}',
    rpgClass: 'Cliente',
    color: '{cor}',
    colorDim: '{cor_dim}',
    colorText: '#fff',
    deskPosition: {{ x: 400, y: 140 }},  // ajustar conforme layout
    meetingPosition: {{ x: 440, y: 260 }},
    idleQuote: 'Avaliando pela ótica do cliente...',
    reuniaoOnly: true,
  }},"""


def main():
    parser = argparse.ArgumentParser(description="Wizard de onboarding de cliente espelho")
    parser.add_argument("--id", help="ID único (ex: marina). Auto-gerado se omitido.")
    parser.add_argument("--nome", help="Nome completo (ex: Marina Costa)")
    parser.add_argument("--nicho", help="Nicho/especialidade (ex: nutricionista)")
    parser.add_argument("--cor", default="#0f766e", help="Cor hex do agente (default: verde-azulado)")
    args = parser.parse_args()

    print("\n🟡 Lemmon — Wizard de onboarding de cliente espelho\n")
    print("Responda as perguntas abaixo. Deixe em branco para usar o default.\n")

    nome = args.nome or perguntar("Nome completo do cliente")
    if not nome:
        print("❌ Nome é obrigatório.", file=sys.stderr)
        sys.exit(1)

    nicho = args.nicho or perguntar("Nicho/especialidade", "consultor")
    id_agente = args.id or perguntar("ID do agente (slug)", slugify(nome))
    cor = args.cor or perguntar("Cor hex", "#0f766e")

    nome_curto = nome.split()[0]

    # Pastas
    cliente_dir = CLIENTES_DIR / id_agente
    output_dir = OUTPUTS_DIR / id_agente

    if cliente_dir.exists():
        print(f"\n⚠  Cliente '{id_agente}' já existe em {cliente_dir}")
        resp = input("   Sobrescrever templates? [s/N]: ").strip().lower()
        if resp != "s":
            print("Cancelado.")
            sys.exit(0)

    cliente_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Gerar arquivos
    ctx = {"nome": nome, "nome_curto": nome_curto, "nicho": nicho, "id": id_agente}

    (cliente_dir / "dossie.md").write_text(DOSSIE_TEMPLATE.format(**ctx), encoding="utf-8")
    (cliente_dir / "transcricoes.md").write_text(TRANSCRICOES_TEMPLATE.format(**ctx), encoding="utf-8")

    prompt_path = PROMPTS_DIR / f"{id_agente}_system_v1.md"
    if not prompt_path.exists():
        prompt_path.write_text(SYSTEM_PROMPT_TEMPLATE.format(**ctx), encoding="utf-8")
    else:
        print(f"  ⚠  Prompt já existe, não sobrescrito: {prompt_path.name}")

    print(f"\n✓ Cliente criado: {id_agente}")
    print(f"  📁 Material: {cliente_dir}/")
    print(f"  📄 Prompt:   {prompt_path}")
    print(f"  📤 Outputs:  {output_dir}/")

    print("\n" + "─" * 60)
    print("PRÓXIMOS PASSOS:")
    print(f"  1. Preencha o dossiê: {cliente_dir}/dossie.md")
    print(f"  2. Cole transcrições: {cliente_dir}/transcricoes.md")
    print(f"  3. Ajuste o prompt:   {prompt_path}")
    print("  4. Adicione o agente no dashboard:")
    print(gerar_snippet_ts(id_agente, nome, nicho, cor))
    print("\n  5. Instancie o agente em Python:")
    print(f"""
from core.espelho import EspelhoCliente
from core.config import ESPELHO_CLIENTES_DIR

{nome_curto.lower()} = EspelhoCliente(
    id="{id_agente}",
    nome="{nome}",
    material_dir=ESPELHO_CLIENTES_DIR / "{id_agente}",
)
""")
    print("─" * 60)


if __name__ == "__main__":
    main()
