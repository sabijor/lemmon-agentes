"""Teste mínimo: web_search funciona com Sonnet 4.6 na minha conta?"""
import os

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

print("Testando web_search com Sonnet 4.6...")
print("-" * 50)

try:
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": "Qual é a política atual da Meta sobre anúncios de emagrecimento? Faça uma busca rápida e me diga só 2 pontos principais."
        }],
        tools=[{
            "type": "web_search_20250305",
            "name": "web_search",
            "max_uses": 2
        }]
    )
    
    print("\n✅ RESPOSTA RECEBIDA")
    print("-" * 50)
    
    for bloco in response.content:
        if bloco.type == "text":
            print(f"\n📝 TEXTO:\n{bloco.text}")
        elif bloco.type == "tool_use":
            print(f"\n🔍 BUSCA INICIADA: {bloco.input}")
        elif bloco.type == "web_search_tool_result":
            print("\n📄 RESULTADOS DA BUSCA:")
            if hasattr(bloco, 'content'):
                for resultado in bloco.content:
                    if hasattr(resultado, 'url'):
                        print(f"   - {resultado.url}")
        else:
            print(f"\n🔸 OUTRO BLOCO: tipo={bloco.type}")
    
    print("\n" + "-" * 50)
    print("📊 USAGE:")
    print(f"   Input tokens:  {response.usage.input_tokens}")
    print(f"   Output tokens: {response.usage.output_tokens}")
    
    if hasattr(response.usage, 'server_tool_use'):
        buscas = response.usage.server_tool_use.web_search_requests
        print(f"   Buscas web:    {buscas}")
        custo_busca = buscas * 0.01
        print(f"   Custo só buscas: ${custo_busca:.4f}")
    
    custo_modelo = (response.usage.input_tokens / 1_000_000 * 3) + (response.usage.output_tokens / 1_000_000 * 15)
    print(f"   Custo modelo:    ${custo_modelo:.6f}")
    
    print("\n✅ TESTE PASSOU — web_search funciona na sua conta!")

except Exception as e:
    print(f"\n❌ ERRO: {type(e).__name__}")
    print(f"Mensagem: {e}")
    print("\n" + "-" * 50)
    print("DIAGNÓSTICO:")
    
    erro_str = str(e).lower()
    
    if "permission" in erro_str or "not enabled" in erro_str or "not allowed" in erro_str:
        print("⚠️  Web search NÃO está habilitado no seu Console.")
    elif "model" in erro_str and "support" in erro_str:
        print("⚠️  Sonnet 4.6 pode não suportar web_search_20250305.")
    elif "invalid" in erro_str and "tool" in erro_str:
        print("⚠️  Schema da tool está errado ou modelo não reconhece.")
    elif "authentication" in erro_str or "api key" in erro_str:
        print("⚠️  Problema com a API key.")
    else:
        print("⚠️  Erro não mapeado. Cola a mensagem inteira pro assistente.")

