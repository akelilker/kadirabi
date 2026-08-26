import { isValidIsoDate } from '../domain/dates'
import type { IsoDate } from '../domain/types'

const trMoney = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const trNumber = new Intl.NumberFormat('tr-TR', {
  maximumFractionDigits: 4,
})

export function formatMoneyTR(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${trMoney.format(n)} TL`
}

export function formatNumberTR(value: string | number, fractionDigits = 2): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n)
}

export function formatRatePct(value: number): string {
  return `%${trNumber.format(value)}`
}

export function formatDateTR(iso: string): string {
  if (!isValidIsoDate(iso)) return iso
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export function isoFromDateInput(value: string): IsoDate | null {
  if (!value) return null
  return isValidIsoDate(value) ? value : null
}

/**
 * Parse Turkish / loose money input:
 * 10000 | 10.000 | 10.000,50 | 10000,5
 */
export function parseMoneyInput(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s/g, '')
  if (!trimmed) return null

  let normalized = trimmed
  if (normalized.includes(',') && normalized.includes('.')) {
    // 10.000,50 → 10000.50
    normalized = normalized.replace(/\./g, '').replace(',', '.')
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) {
    // 10.000 → 10000
    normalized = normalized.replace(/\./g, '')
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return n.toFixed(2)
}

export function parseRateInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, '').replace('%', '').replace(',', '.')
  if (!trimmed) return null
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  return n
}

export function parseDateTR(raw: string): IsoDate | null {
  const t = raw.trim()
  if (isValidIsoDate(t)) return t
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t)
  if (!m) return null
  const day = m[1]!.padStart(2, '0')
  const month = m[2]!.padStart(2, '0')
  const year = m[3]!
  const iso = `${year}-${month}-${day}`
  return isValidIsoDate(iso) ? iso : null
}
