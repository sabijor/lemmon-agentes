import { useEffect, useState } from 'react'

/**
 * Hook safe pra SSR/CSR. Retorna [valor, setValor, mounted].
 * Antes de mounted=true, retorna o defaultValue (server-safe).
 * Depois de useEffect rodar (cliente), lê localStorage e atualiza.
 *
 * Uso:
 *   const [pinned, setPinned, mounted] = useLocalStorage('lemmon-chat-pinned', false)
 *   if (!mounted) return <DefaultPlaceholder />  // evita flicker
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void, boolean] {
  const [value, setValue] = useState<T>(defaultValue)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored !== null) {
        setValue(JSON.parse(stored) as T)
      }
    } catch {
      // localStorage indisponível ou JSON corrompido — usa default
    }
    setMounted(true)
  }, [key])

  const setPersistedValue = (newValue: T) => {
    setValue(newValue)
    try {
      localStorage.setItem(key, JSON.stringify(newValue))
    } catch {
      // ignore se localStorage indisponível
    }
  }

  return [value, setPersistedValue, mounted]
}
