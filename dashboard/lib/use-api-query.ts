'use client'
import { useState, useEffect, useCallback } from 'react'
import { notify } from '@/lib/toast'

export function useApiQuery<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fn())
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido'
      setError(msg)
      notify.error(msg)
    } finally {
      setLoading(false)
    }
  }, deps)

  useEffect(() => { void load() }, [load])

  return { data, loading, error, reload: load }
}
