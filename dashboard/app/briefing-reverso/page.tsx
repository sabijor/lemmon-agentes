'use client'
import { useState } from 'react'
import Link from 'next/link'
import { API_URL } from '@/lib/api'

export default function BriefingReverso() {
  const [transcricao, setTranscricao] = useState('')
  const [resultado, setResultado] = useState('')
  const [custo, setCusto] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const analisar = async () => {
    if (!transcricao.trim() || loading) return
    setLoading(true)
    setResultado('')
    setError('')
    try {
      const res = await fetch(`${API_URL}/briefing_reverso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcricao }),
      })
      if (!res.ok) throw new Error('Falha na análise')
      const data = await res.json()
      setResultado(data.resultado)
      setCusto(data.custo_total_usd)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">Briefing Reverso</h1>
            <p className="text-sm font-mono text-stone-400 mt-1">Cole uma transcrição ou texto — Otto infere briefing e tese</p>
          </div>
          <Link href="/" className="text-[10px] font-mono text-stone-500 hover:text-stone-300 transition-colors uppercase tracking-widest">
            ← Voltar
          </Link>
        </div>

        <div className="space-y-4">
          <textarea
            value={transcricao}
            onChange={e => setTranscricao(e.target.value)}
            placeholder="Cole aqui a transcrição do vídeo, texto do post, roteiro produzido, ou qualquer conteúdo já finalizado..."
            rows={10}
            className="w-full resize-none rounded-2xl bg-stone-900 border border-stone-700 px-5 py-4 text-sm font-mono text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-stone-500 leading-relaxed"
          />

          <button onClick={analisar} disabled={!transcricao.trim() || loading}
            className="w-full py-3 rounded-xl bg-stone-100 text-stone-900 text-[10px] font-mono uppercase tracking-widest font-bold
              hover:bg-white active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {loading ? 'Analisando...' : '🔍 Inferir briefing'}
          </button>

          {error && (
            <p className="text-red-400 text-[10px] font-mono text-center">{error}</p>
          )}

          {resultado && (
            <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 space-y-1">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[9px] font-mono text-stone-500 uppercase tracking-widest">Resultado da análise</span>
                {custo > 0 && <span className="text-[9px] font-mono text-stone-600">${custo.toFixed(5)}</span>}
              </div>
              <pre className="text-sm font-mono text-stone-200 whitespace-pre-wrap leading-relaxed">{resultado}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
