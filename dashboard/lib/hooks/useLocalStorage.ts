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
 * T190.C2 — versionamento explícito. Os dados gravados ficam em
 *   `{ __v: <schemaVersion>, data: <valor> }`
 * Se a versão lida não bater com `schemaVersion`, reseta pra default em vez de
 * deserializar shape antigo (que pode crashar com `undefined.foo`). Versão
 * default é 1; passe `schemaVersion: 2` quando quebrar contrato do tipo.
 *
 * Uso:
 *   const [pinned, setPinned, mounted] = useLocalStorage('lemmon-chat-pinned', false)
 *   const [hist, setHist] = useLocalStorage('chat-history', [], 2)  // bumpou schema
 *
 *   if (!mounted) return <DefaultPlaceholder />  // evita flicker
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  schemaVersion: number = 1,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(defaultValue)
  const [mounted, setMounted] = useState(false)
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored !== null) {
        const parsed = JSON.parse(stored) as unknown
        // T190.C2 — detecta formato versionado vs legado.
        // Formato novo: { __v: number, data: T }. Formato legado: T direto.
        if (
          parsed &&
          typeof parsed === 'object' &&
          '__v' in parsed &&
          'data' in parsed
        ) {
          const wrap = parsed as { __v: number; data: T }
          if (wrap.__v === schemaVersion) {
            setValue(wrap.data)
            valueRef.current = wrap.data
          } else {
            // versão diferente — descarta e usa default (próxima escrita atualiza)
            // eslint-disable-next-line no-console
            console.info(`[useLocalStorage] '${key}': schema v${wrap.__v} → v${schemaVersion}, reset pro default`)
          }
        } else {
          // legado sem versão — aceita pro caso de upgrade tranquilo, mas:
          // se quebrou contrato (campo missing), JSON.parse não pega, só TS.
          // Aceita como T e confia no consumidor.
          setValue(parsed as T)
          valueRef.current = parsed as T
        }
      }
    } catch {
      // localStorage indisponível ou JSON corrompido — usa default
    }
    setMounted(true)
  }, [key, schemaVersion])

  const setPersistedValue = useCallback<Dispatch<SetStateAction<T>>>((updater) => {
    setValue((prev) => {
      const next = typeof updater === 'function'
        ? (updater as (p: T) => T)(prev)
        : updater
      try {
        // T190.C2 — sempre escreve no formato versionado pra próxima leitura validar
        localStorage.setItem(key, JSON.stringify({ __v: schemaVersion, data: next }))
      } catch {
        // ignore se localStorage indisponível (quota, modo privado, etc)
      }
      return next
    })
  }, [key, schemaVersion])

  return [value, setPersistedValue, mounted]
}
