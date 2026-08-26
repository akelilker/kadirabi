/**
 * Vite `base` ile aynı kök yol (import.meta.env.BASE_URL).
 * Alt klasör yayınında asset ve React Router basename bu değerle hizalanır.
 */
export function getAppPublicPath(): string {
  const raw = import.meta.env.BASE_URL ?? '/'
  if (raw === './' || raw === '/') {
    return ''
  }
  const trimmed = raw.replace(/\/$/, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function getRouterBasename(): string | undefined {
  const path = getAppPublicPath()
  return path.length > 0 ? path : undefined
}
