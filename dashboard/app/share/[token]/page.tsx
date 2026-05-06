'use client'
import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { API_URL } from '@/lib/api'

export default function SharePage() {
  const params = useParams()
  const token = params?.token as string

  useEffect(() => {
    if (token) {
      window.location.replace(`${API_URL}/share/${token}`)
    }
  }, [token])

  return (
    <div className="h-screen flex items-center justify-center bg-stone-50">
      <p className="text-sm font-mono text-stone-400 uppercase tracking-widest">Carregando...</p>
    </div>
  )
}
