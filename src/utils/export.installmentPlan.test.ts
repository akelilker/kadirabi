import { describe, expect, it } from 'vitest'
import { calculateReceivable } from '../domain/receivableCalculator'
import type { Customer, Installment, Payment, Sale } from '../domain/types'
import { buildInstallmentPlanRows, isoToExcelDate } from './export'

function inst(id: string, sequence: number, dueDate: string, amount: string): Installment {
  return {
    id,
    saleId: 'sale-1',
    sequence,
    dueDate,
    amount,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function pay(id: string, paymentDate: string, amount: string): Payment {
  return {
    id,
    saleId: 'sale-1',
    paymentDate,
    amount,
    createdAt: `${paymentDate}T12:00:00.000Z`,
    updatedAt: `${paymentDate}T12:00:00.000Z`,
  }
}

describe('installment plan excel rows', () => {
  it('exports carry-forward ledger numeric cells for the 7×10000 fixture', () => {
    const dues = [
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
    ]
    const installments = dues.map((due, i) => inst(`i${i + 1}`, i + 1, due, '10000'))
    const payments = [
      pay('p1', '2026-01-06', '8000'),
      pay('p2', '2026-02-02', '10000'),
      pay('p3', '2026-03-02', '5000'),
      pay('p4', '2026-04-01', '10000'),
      pay('p5', '2026-05-01', '10000'),
      pay('p6', '2026-06-01', '10000'),
      pay('p7', '2026-07-01', '10000'),
    ]
    const result = calculateReceivable({
      installments,
      payments,
      monthlyCostRatePct: 3,
      asOfDate: '2026-07-01',
    })

    const sale: Sale = {
      id: 'sale-1',
      customerId: 'cus-1',
      title: 'Fixture',
      contractDate: '2026-01-01',
      firstDueDate: '2026-01-01',
      installmentCount: 7,
      defaultInstallmentAmount: '10000.00',
      monthlyCostRatePct: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const customer: Customer = {
      id: 'cus-1',
      name: 'Test',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    const rows = buildInstallmentPlanRows(sale, customer, result)
    expect(rows[0]).toMatchObject({
      Sıra: 1,
      'Aylık Taksit': 10000,
      Devreden: 0,
      'Ödenmesi Gereken': 10000,
      Ödenen: 8000,
      Kalan: 2000,
      Gecikme: 5,
    })
    expect(rows[0]!.Vade).toEqual(isoToExcelDate('2026-01-01'))
    expect(String(rows[0]!.Ödemeler)).toContain('06.01.2026')
    expect(String(rows[0]!.Ödemeler)).toContain('8000.00')

    expect(rows[1]).toMatchObject({
      Sıra: 2,
      'Aylık Taksit': 10000,
      Devreden: 2000,
      'Ödenmesi Gereken': 12000,
      Ödenen: 10000,
      Kalan: 2000,
    })
  })
})
