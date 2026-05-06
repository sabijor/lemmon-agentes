'use client'
import { useState } from 'react'
import Link from 'next/link'
import { API_URL } from '@/lib/api'

const DURACOES_DISPONIVEIS = [15, 30, 60, 90]

export default function CortesProntos() {
  const [transcricao, setTranscricao] = useState('')
  const [duracoes, setDuracoes] = useState<number[]>([15, 30, 60])
  const [resultado, setResultado] = useState('')
  const [custo, setCusto] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const toggleDuracao = (d: number) => {
    setDuracoes(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b))
  }

  const gerar = async () => {
    if (!transcricao.trim() || duracoes.length === 0 || loading) return
    setLoading(true)
    setResultado('')
    setError('')
    try {
      const res = await fetch(`${API_URL}/cortes_prontos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcricao, duracoes }),
      })
      if (!res.ok) throw new Error('Falha ao gerar cortes')
      const data = await res.json()
      setResultado(data.cortes)
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
            <h1 className="text-2xl font-display font-bold tracking-tight">Cortes-Prontos</h1>
            <p className="text-sm font-mono text-stone-400 mt-1">Transcrição longa → tabela de cortes com timestamps e legendas</p>
          </div>
          <Link href="/" className="text-[10px] font-mono text-stone-500 hover:text-stone-300 transition-colors uppercase tracking-widest">
            ← Voltar
          </Link>
        </div>

        <div className="space-y-4">
          {/* Duração alvo */}
          <div>
            <p className="text-[9px] font-mono text-stone-500 uppercase tracking-widest mb-2">Durações alvo</p>
            <div className="flex gap-2">
              {DURACOES_DISPONIVEIS.map(d => (
                <button key={d} onClick={() => toggleDuracao(d)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-mono uppercase tracking-widest border transition-all ${
                    duracoes.includes(d)
                      ? 'bg-stone-100 border-stone-100 text-stone-900 font-bold'
                      : 'bg-stone-900 border-stone-700 text-stone-400 hover:border-stone-500'
                  }`}>
                  {d}s
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={transcricao}
            onChange={e => setTranscricao(e.target.value)}
            placeholder="Cole aqui a transcrição do vídeo longo (pode ser legenda, texto falado, roteiro completo)..."
            rows={10}
            className="w-full resize-none rounded-2xl bg-stone-900 border border-stone-700 px-5 py-4 text-sm font-mono text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-stone-500 leading-relaxed"
          />

          <button onClick={gerar} disabled={!transcricao.trim() || duracoes.length === 0 || loading}
            className="w-full py-3 rounded-xl bg-stone-100 text-stone-900 text-[10px] font-mono uppercase tracking-widest font-bold
              hover:bg-white active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {loading ? 'Gerando cortes...' : `✂️ Gerar cortes (${duracoes.map(d => d + 's').join(', ')})`}
          </button>

          {error && (
            <p className="text-red-400 text-[10px] font-mono text-center">{error}</p>
          )}

          {resultado && (
            <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[9px] font-mono text-stone-500 uppercase tracking-widest">Cortes prontos</span>
                <div className="flex items-center gap-3">
                  {custo > 0 && <span className="text-[9px] font-mono text-stone-600">${custo.toFixed(5)}</span>}
                  <button
                    onClick={() => navigator.clipboard.writeText(resultado)}
                    className="text-[8px] font-mono text-stone-500 hover:text-stone-300 transition-colors uppercase tracking-widest">
                    copiar
                  </button>
                </div>
              </div>
              <pre className="text-sm font-mono text-stone-200 whitespace-pre-wrap leading-relaxed">{resultado}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
