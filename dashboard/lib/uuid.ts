/**
 * Polyfill seguro para crypto.randomUUID().
 *
 * Q-06 — Safari < 15.4 (iOS) e Chrome < 92 não têm crypto.randomUUID.
 * Cliente Pedro num iPad antigo crashava no startup. Esse helper resolve.
 *
 * Usa crypto.getRandomValues quando disponível (todos browsers modernos),
 * fallback final em Math.random (não é cripto-seguro mas é UUID válido v4).
 */
export function uuid(): string {
  // Caminho rápido: navegador moderno
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  // Fallback usando getRandomValues (Safari 11+, todos navegadores em uso prático)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    // Set version (4) and variant bits (RFC 4122)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  // Último fallback (Math.random — só pra não crashar)
  const r = () => Math.floor(Math.random() * 16).toString(16)
  return `${r()}${r()}${r()}${r()}${r()}${r()}${r()}${r()}-${r()}${r()}${r()}${r()}-4${r()}${r()}${r()}-${['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)]}${r()}${r()}${r()}-${r()}${r()}${r()}${r()}${r()}${r()}${r()}${r()}${r()}${r()}${r()}${r()}`
}
