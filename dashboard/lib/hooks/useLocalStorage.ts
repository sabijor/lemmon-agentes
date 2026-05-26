import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react'

/**
 * Hook safe pra SSR/CSR. Retorna [valor, setValor, mounted].
 * Antes de mounted=true, retorna o defaultValue (server-safe).
 * Depois de useEffect rodar (cliente), lê localStorage e atualiza.
 *
 * O setter aceita valor direto OU callback (igual useState):
 *   setMessages([...newMsgs])
 *   setMessages(prev => [...prev, novaMsg])
 *
 * Uso:
 *   const [pinned, setPinned, mounted] = useLocalStorage('lemmon-chat-pinned', false)
 *   if (!mounted) return <DefaultPlaceholder />  // evita flicker
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(defaultValue)
  const [mounted, setMounted] = useState(false)
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored !== null) {
        const parsed = JSON.parse(stored) as T
        setValue(parsed)
        valueRef.current = parsed
      }
    } catch {
      // localStorage indisponível ou JSON corrompido — usa default
    }
    setMounted(true)
  }, [key])

  const setPersistedValue = useCallback<Dispatch<SetStateAction<T>>>((updater) => {
    setValue((prev) => {
      const next = typeof updater === 'function'
        ? (updater as (p: T) => T)(prev)
        : updater
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // ignore se localStorage indisponível
      }
      return next
    })
  }, [key])

  return [value, setPersistedValue, mounted]
}
