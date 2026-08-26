import type { IsoDate } from './types'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isValidIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const utc = Date.UTC(y, m - 1, d)
  const check = new Date(utc)
  return (
    check.getUTCFullYear() === y &&
    check.getUTCMonth() === m - 1 &&
    check.getUTCDate() === d
  )
}

export function parseIsoDate(value: IsoDate): { year: number; month: number; day: number } {
  if (!isValidIsoDate(value)) {
    throw new Error(`Geçersiz tarih: ${value}`)
  }
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}

export function formatIsoDate(year: number, month: number, day: number): IsoDate {
  const y = String(year).padStart(4, '0')
  const m = String(month).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  const iso = `${y}-${m}-${d}`
  if (!isValidIsoDate(iso)) {
    throw new Error(`Geçersiz takvim tarihi: ${iso}`)
  }
  return iso
}

/** Calendar-day difference (end - start). Timezone-independent via UTC date parts. */
export function daysBetween(start: IsoDate, end: IsoDate): number {
  const a = parseIsoDate(start)
  const b = parseIsoDate(end)
  const t1 = Date.UTC(a.year, a.month - 1, a.day)
  const t2 = Date.UTC(b.year, b.month - 1, b.day)
  return Math.round((t2 - t1) / 86_400_000)
}

export function compareIsoDates(a: IsoDate, b: IsoDate): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

export function minIsoDate(a: IsoDate, b: IsoDate): IsoDate {
  return compareIsoDates(a, b) <= 0 ? a : b
}

export function maxIsoDate(a: IsoDate, b: IsoDate): IsoDate {
  return compareIsoDates(a, b) >= 0 ? a : b
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Add months while preserving the original target day-of-month when possible.
 * If the target day does not exist in the destination month, clamp to last day.
 */
export function addMonthsKeepingDay(iso: IsoDate, monthsToAdd: number, anchorDay: number): IsoDate {
  const { year, month } = parseIsoDate(iso)
  const absolute = year * 12 + (month - 1) + monthsToAdd
  const nextYear = Math.floor(absolute / 12)
  const nextMonth = (absolute % 12) + 1
  const dim = daysInMonth(nextYear, nextMonth)
  const day = Math.min(anchorDay, dim)
  return formatIsoDate(nextYear, nextMonth, day)
}

/** Today's calendar date in Europe/Istanbul as YYYY-MM-DD. */
export function todayIstanbul(): IsoDate {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // en-CA yields YYYY-MM-DD
  return fmt.format(new Date())
}
