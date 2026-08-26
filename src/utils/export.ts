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

function sheetToXlsx(filename: string, sheetName: string, rows: Record<string, unknown>[]): void {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  downloadBlob(
    filename,
    new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
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
    result.installmentResults.map((r) => ({
      Müşteri: customer.name,
      Satış: sale.title ?? '',
      Sıra: r.sequence,
      Vade: formatDateTR(r.dueDate),
      Tutar: Number(r.amount),
      Mahsup: Number(r.allocated),
      Açık: Number(r.open),
      Durum: INSTALLMENT_STATUS_LABELS[r.status],
      Gecikme: r.delayDays,
      Maliyet: Number(r.cost),
    })),
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
        Tarih: formatDateTR(p.paymentDate),
        Tutar: Number(p.amount),
        Açıklama: p.note ?? '',
        Mahsup: alloc,
      }
    }),
  )
}

export function downloadJsonBackup(payload: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadBlob(filename, blob)
}
