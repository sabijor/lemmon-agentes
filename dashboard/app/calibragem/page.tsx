'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { API_URL } from '@/lib/api'

interface SessionOption {
  session_id: string
  briefing: string
}

interface FeedbackEntry {
  id: string
  session_id: string
  elemento: string
  predicao_ia: string
  feedback_real: string
  nota_acerto: number
  created_at: string
}

interface CalibragensData {
  registros: FeedbackEntry[]
  media_acerto: number | null
  total: number
}

export default function CalibragemPage() {
  const [data, setData] = useState<CalibragensData | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    session_id: '',
    elemento: '',
    predicao_ia: '',
    feedback_real: '',
    nota_acerto: 3,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sessionOptions, setSessionOptions] = useState<SessionOption[]>([])

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_URL}/calibragem_pedro`)
      setData(await res.json())
    } catch {
      setData({ registros: [], media_acerto: null, total: 0 })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    fetch(`${API_URL}/historico`)
      .then(r => r.json())
      .then((sessions: Array<{ session_id: string; briefing: string; agentes_usados: string[] }>) => {
        const withPedro = sessions
          .filter(s => s.agentes_usados?.includes('pedro'))
          .slice(0, 20)
          .map(s => ({ session_id: s.session_id, briefing: s.briefing?.slice(0, 60) ?? '' }))
        setSessionOptions(withPedro)
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      await fetch(`${API_URL}/calibragem_pedro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setSaved(true)
      setForm({ session_id: '', elemento: '', predicao_ia: '', feedback_real: '', nota_acerto: 3 })
      fetchData()
    } catch {
      // silencia — mostrar erro não é crítico
    } finally {
      setSaving(false)
    }
  }

  const acertoPct = data?.media_acerto ? Math.round((data.media_acerto / 5) * 100) : 0

  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display font-semibold text-lg tracking-tight">Calibragem Pedro Abrahão</h1>
            <p className="text-[10px] font-mono text-stone-400 uppercase tracking-widest mt-0.5">
              IA vs. feedback real — {data?.total ?? 0} registros
            </p>
          </div>
          <Link href="/" className="text-[10px] font-mono text-stone-400 hover:text-stone-700 transition-colors uppercase tracking-widest">
            ← Voltar
          </Link>
        </div>

        {/* KPI */}
        {data && data.total > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-stone-200 px-5 py-4">
              <p className="text-[8px] font-mono text-stone-400 uppercase tracking-widest mb-1">Registros</p>
              <p className="font-display font-bold text-2xl text-stone-900">{data.total}</p>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 px-5 py-4">
              <p className="text-[8px] font-mono text-stone-400 uppercase tracking-widest mb-1">Média de acerto</p>
              <p className="font-display font-bold text-2xl text-stone-900">
                {data.media_acerto?.toFixed(1) ?? '—'}<span className="text-sm text-stone-400">/5</span>
              </p>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 px-5 py-4">
              <p className="text-[8px] font-mono text-stone-400 uppercase tracking-widest mb-1">Precisão</p>
              <p className={`font-display font-bold text-2xl ${acertoPct >= 80 ? 'text-green-600' : acertoPct >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                {acertoPct}%
              </p>
            </div>
          </div>
        )}

        {/* Registrar novo feedback */}
        <div className="bg-white rounded-xl border border-stone-200 p-6 mb-8">
          <h2 className="text-[10px] font-mono text-stone-500 uppercase tracking-widest font-bold mb-4">
            Registrar feedback real
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] font-mono text-stone-400 uppercase tracking-widest block mb-1">Session ID</label>
                <input value={form.session_id} onChange={e => setForm(f => ({ ...f, session_id: e.target.value }))}
                  list="session-opts"
                  placeholder={sessionOptions.length ? 'Selecione ou digite...' : 'Ex: 20260505_152641_sessao'}
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-[11px] font-mono text-stone-700 focus:outline-none focus:border-stone-400" />
                <datalist id="session-opts">
                  {sessionOptions.map(s => (
                    <option key={s.session_id} value={s.session_id}>{s.briefing}</option>
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-[9px] font-mono text-stone-400 uppercase tracking-widest block mb-1">Elemento avaliado</label>
                <input value={form.elemento} onChange={e => setForm(f => ({ ...f, elemento: e.target.value }))}
                  placeholder="ex: tom do roteiro, objeção principal"
                  required
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-[11px] font-mono text-stone-700 focus:outline-none focus:border-stone-400" />
              </div>
            </div>
            <div>
              <label className="text-[9px] font-mono text-stone-400 uppercase tracking-widest block mb-1">Predição do Pedro IA</label>
              <textarea value={form.predicao_ia} onChange={e => setForm(f => ({ ...f, predicao_ia: e.target.value }))}
                rows={2} required placeholder="O que o Pedro IA disse/previu..."
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-[11px] font-mono text-stone-700 focus:outline-none focus:border-stone-400 resize-none" />
            </div>
            <div>
              <label className="text-[9px] font-mono text-stone-400 uppercase tracking-widest block mb-1">Feedback real do Pedro</label>
              <textarea value={form.feedback_real} onChange={e => setForm(f => ({ ...f, feedback_real: e.target.value }))}
                rows={2} required placeholder="O que o Pedro real disse/reagiu..."
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-[11px] font-mono text-stone-700 focus:outline-none focus:border-stone-400 resize-none" />
            </div>
            <div>
              <label className="text-[9px] font-mono text-stone-400 uppercase tracking-widest block mb-1">
                Nota de acerto (1–5): <span className="text-stone-700 font-bold">{form.nota_acerto}</span>
              </label>
              <input type="range" min={1} max={5} value={form.nota_acerto}
                onChange={e => setForm(f => ({ ...f, nota_acerto: Number(e.target.value) }))}
                className="w-full accent-stone-900" />
              <div className="flex justify-between mt-0.5">
                <span className="text-[8px] font-mono text-stone-300">1 — errou</span>
                <span className="text-[8px] font-mono text-stone-300">5 — acertou em cheio</span>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button type="submit" disabled={saving}
                className="px-4 py-2 rounded-xl bg-stone-900 text-white text-[10px] font-mono font-bold uppercase tracking-widest
                  hover:bg-stone-700 active:scale-[0.98] transition-all disabled:opacity-50">
                {saving ? 'Salvando...' : 'Registrar'}
              </button>
              {saved && (
                <span className="text-[10px] font-mono text-green-600 uppercase tracking-widest">✓ Salvo!</span>
              )}
            </div>
          </form>
        </div>

        {/* Histórico */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-100">
            <h2 className="text-[10px] font-mono text-stone-500 uppercase tracking-widest font-bold">
              Histórico de calibragens
            </h2>
          </div>
          {loading ? (
            <p className="text-[10px] font-mono text-stone-400 text-center py-8 uppercase tracking-widest">Carregando...</p>
          ) : !data || data.registros.length === 0 ? (
            <p className="text-[10px] font-mono text-stone-400 text-center py-8 uppercase tracking-widest">
              Nenhum registro ainda.
            </p>
          ) : (
            <div className="divide-y divide-stone-100">
              {[...data.registros].reverse().map(r => (
                <div key={r.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <span className="text-[9px] font-mono text-stone-500 font-bold uppercase tracking-widest">{r.elemento}</span>
                      {r.session_id && (
                        <span className="text-[8px] font-mono text-stone-300 ml-2">{r.session_id}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {[1, 2, 3, 4, 5].map(n => (
                        <span key={n} className="text-xs" style={{ color: n <= r.nota_acerto ? '#f59e0b' : '#d6d3d1' }}>★</span>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[8px] font-mono text-stone-400 uppercase tracking-widest mb-0.5">Predição IA</p>
                      <p className="text-[10px] font-mono text-stone-600 leading-relaxed">{r.predicao_ia}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-mono text-stone-400 uppercase tracking-widest mb-0.5">Feedback real</p>
                      <p className="text-[10px] font-mono text-stone-600 leading-relaxed">{r.feedback_real}</p>
                    </div>
                  </div>
                  <p className="text-[8px] font-mono text-stone-300 mt-2">
                    {new Date(r.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
