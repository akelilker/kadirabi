import * as XLSX from 'xlsx'
import type { CalculationResult, Customer, Payment, Sale } from '../domain/types'
import { INSTALLMENT_STATUS_LABELS } from '../domain/types'
import { formatDateTR } from '../utils/format'

export interface CustomerSummaryRow {
  customerName: string
  saleTitle: string
  contractTotal: string
  duePrincipal: string
  receivedCash: string
  openDuePrincipal: string
  accruedCarryingCost: string
  economicShortfall: string
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Excel date serial from ISO YYYY-MM-DD (UTC noon avoids TZ edge cases). */
export function isoToExcelDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
}

function formatPeriodPaymentsCell(
  payments: Array<{ paymentDate: string; amount: string }>,
): string {
  if (payments.length === 0) return ''
  return payments.map((p) => `${formatDateTR(p.paymentDate)} — ${Number(p.amount).toFixed(2)}`).join('\n')
}

function sheetToXlsx(
  filename: string,
  sheetName: string,
  rows: Record<string, unknown>[],
  columnFormats?: Record<string, string>,
): void {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  if (columnFormats && rows.length > 0) {
    const headers = Object.keys(rows[0]!)
    for (let r = 0; r < rows.length; r++) {
      for (const [header, format] of Object.entries(columnFormats)) {
        const c = headers.indexOf(header)
        if (c < 0) continue
        const addr = XLSX.utils.encode_cell({ r: r + 1, c })
        const cell = ws[addr]
        if (cell && cell.t === 'n') cell.z = format
        if (cell && cell.v instanceof Date) {
          cell.t = 'd'
          cell.z = format
        }
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true })
  downloadBlob(
    filename,
    new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
}

/** Build installment plan rows for Excel / programmatic asserts (no download). */
export function buildInstallmentPlanRows(
  sale: Sale,
  customer: Customer,
  result: CalculationResult,
): Record<string, unknown>[] {
  return result.installmentResults.map((r) => ({
    Müşteri: customer.name,
    Satış: sale.title ?? '',
    Sıra: r.sequence,
    Vade: isoToExcelDate(r.dueDate),
    'Aylık Taksit': Number(r.amount),
    Devreden: Number(r.carryIn),
    'Ödenmesi Gereken': Number(r.amountDue),
    Ödemeler: formatPeriodPaymentsCell(r.periodPayments),
    Ödenen: Number(r.periodPaid),
    Kalan: Number(r.carryOut),
    Durum: INSTALLMENT_STATUS_LABELS[r.status],
    Gecikme: r.delayDays,
    Maliyet: Number(r.cost),
  }))
}

export function exportCustomerSummaryXlsx(rows: CustomerSummaryRow[], asOfDate: string): void {
  sheetToXlsx(
    `musteri-ozet-${asOfDate}.xlsx`,
    'Özet',
    rows.map((r) => ({
      Müşteri: r.customerName,
      Satış: r.saleTitle,
      'Sözleşme Tutarı': Number(r.contractTotal),
      'Vadesi Gelen': Number(r.duePrincipal),
      Tahsil: Number(r.receivedCash),
      'Açık Ana Para': Number(r.openDuePrincipal),
      'Para Maliyeti': Number(r.accruedCarryingCost),
      'Ekonomik Eksik': Number(r.economicShortfall),
    })),
    {
      'Sözleşme Tutarı': '#,##0.00',
      'Vadesi Gelen': '#,##0.00',
      Tahsil: '#,##0.00',
      'Açık Ana Para': '#,##0.00',
      'Para Maliyeti': '#,##0.00',
      'Ekonomik Eksik': '#,##0.00',
    },
  )
}

export function exportInstallmentPlanXlsx(
  sale: Sale,
  customer: Customer,
  result: CalculationResult,
): void {
  sheetToXlsx(
    `taksit-plani-${sale.id}.xlsx`,
    'Taksitler',
    buildInstallmentPlanRows(sale, customer, result),
    {
      Vade: 'DD.MM.YYYY',
      'Aylık Taksit': '#,##0.00',
      Devreden: '#,##0.00',
      'Ödenmesi Gereken': '#,##0.00',
      Ödenen: '#,##0.00',
      Kalan: '#,##0.00',
      Maliyet: '#,##0.00',
    },
  )
}

export function exportPaymentsXlsx(
  sale: Sale,
  customer: Customer,
  payments: Payment[],
  result: CalculationResult,
): void {
  sheetToXlsx(
    `odeme-hareketleri-${sale.id}.xlsx`,
    'Ödemeler',
    payments.map((p) => {
      const alloc = result.allocations
        .filter((a) => a.paymentId === p.id)
        .map((a) => `${a.installmentSequence}. taksit: ${a.amount}`)
        .join('; ')
      return {
        Müşteri: customer.name,
        Satış: sale.title ?? '',
        Tarih: isoToExcelDate(p.paymentDate),
        Tutar: Number(p.amount),
        Açıklama: p.note ?? '',
        Mahsup: alloc,
      }
    }),
    {
      Tarih: 'DD.MM.YYYY',
      Tutar: '#,##0.00',
    },
  )
}

export function downloadJsonBackup(payload: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadBlob(filename, blob)
}
