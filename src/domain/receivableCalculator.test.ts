import { describe, expect, it } from 'vitest'
import { daysBetween, addMonthsKeepingDay, formatIsoDate } from './dates'
import { calculateCarryingCost, calculateReceivable } from './receivableCalculator'
import { buildInstallmentSchedule } from './schedule'
import { d, moneyToString } from './money'
import type { Installment, Payment } from './types'

function inst(
  id: string,
  sequence: number,
  dueDate: string,
  amount: string,
): Installment {
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

describe('daysBetween', () => {
  it('counts calendar days without timezone drift', () => {
    expect(daysBetween('2026-08-15', '2026-08-20')).toBe(5)
    expect(daysBetween('2026-08-20', '2026-08-26')).toBe(6)
    expect(daysBetween('2026-08-15', '2026-08-15')).toBe(0)
    expect(daysBetween('2026-08-15', '2026-08-26')).toBe(11)
  })
})

describe('calculateCarryingCost', () => {
  it('matches the simple daily formula', () => {
    expect(moneyToString(calculateCarryingCost(d(10000), 3, 5))).toBe('50.00')
    expect(moneyToString(calculateCarryingCost(d(2000), 3, 6))).toBe('12.00')
    expect(moneyToString(calculateCarryingCost(d(10000), 0, 11))).toBe('0.00')
  })
})

describe('Test 1 — User main scenario', () => {
  it('partial late payment yields 2000 + 62 = 2062', () => {
    const result = calculateReceivable({
      installments: [inst('i1', 1, '2026-08-15', '10000')],
      payments: [pay('p1', '2026-08-20', '8000')],
      monthlyCostRatePct: 3,
      asOfDate: '2026-08-26',
    })

    expect(result.openDuePrincipal).toBe('2000.00')
    expect(result.accruedCarryingCost).toBe('62.00')
    expect(result.economicShortfall).toBe('2062.00')
    expect(result.costSegments).toHaveLength(2)
    expect(result.costSegments[0]).toMatchObject({
      startDate: '2026-08-15',
      endDate: '2026-08-20',
      days: 5,
      principal: '10000.00',
      cost: '50.00',
    })
    expect(result.costSegments[1]).toMatchObject({
      startDate: '2026-08-20',
      endDate: '2026-08-26',
      days: 6,
      principal: '2000.00',
      cost: '12.00',
    })
  })
})

describe('Test 2 — Same-day full payment', () => {
  it('produces zero cost and zero principal', () => {
    const result = calculateReceivable({
      installments: [inst('i1', 1, '2026-08-15', '10000')],
      payments: [pay('p1', '2026-08-15', '10000')],
      monthlyCostRatePct: 3,
      asOfDate: '2026-08-26',
    })
    expect(result.openDuePrincipal).toBe('0.00')
    expect(result.accruedCarryingCost).toBe('0.00')
    expect(result.economicShortfall).toBe('0.00')
  })
})

describe('Test 3 — Full but 5 days late', () => {
  it('keeps historical cost after principal is closed', () => {
    const result = calculateReceivable({
      installments: [inst('i1', 1, '2026-08-15', '10000')],
      payments: [pay('p1', '2026-08-20', '10000')],
      monthlyCostRatePct: 3,
      asOfDate: '2026-08-26',
    })
    expect(result.openDuePrincipal).toBe('0.00')
    expect(result.accruedCarryingCost).toBe('50.00')
    expect(result.economicShortfall).toBe('50.00')
  })
})

describe('Test 4 — No payment', () => {
  it('accrues 11 days of cost', () => {
    const result = calculateReceivable({
      installments: [inst('i1', 1, '2026-08-15', '10000')],
      payments: [],
      monthlyCostRatePct: 3,
      asOfDate: '2026-08-26',
    })
    expect(result.openDuePrincipal).toBe('10000.00')
    expect(result.accruedCarryingCost).toBe('110.00')
    expect(result.economicShortfall).toBe('10110.00')
    expect(result.costSegments[0]?.days).toBe(11)
  })
})

describe('Test 5 — Multiple partial payments', () => {
  it('builds three cost segments totaling 66', () => {
    const result = calculateReceivable({
      installments: [inst('i1', 1, '2026-08-15', '10000')],
      payments: [pay('p1', '2026-08-17', '3000'), pay('p2', '2026-08-20', '2000')],
      monthlyCostRatePct: 3,
      asOfDate: '2026-08-25',
    })
    expect(result.costSegments).toHaveLength(3)
    expect(result.costSegments[0]?.cost).toBe('20.00')
    expect(result.costSegments[1]?.cost).toBe('21.00')
    expect(result.costSegments[2]?.cost).toBe('25.00')
    expect(result.accruedCarryingCost).toBe('66.00')
    expect(result.openDuePrincipal).toBe('5000.00')
    expect(result.economicShortfall).toBe('5066.00')
  })
})

describe('Test 6 — Early payment', () => {
  it('produces zero cost when paid before due', () => {
    const result = calculateReceivable({
      installments: [inst('i1', 1, '2026-09-15', '10000')],
      payments: [pay('p1', '2026-09-10', '10000')],
      monthlyCostRatePct: 3,
      asOfDate: '2026-09-20',
    })
    expect(result.openDuePrincipal).toBe('0.00')
    expect(result.accruedCarryingCost).toBe('0.00')
    expect(result.advanceCredit).toBe('0.00')
    expect(result.installmentResults[0]?.status).toBe('erken_odendi')
  })
})

describe('Test 7 — Overpayment / advance credit', () => {
  it('stores credit and applies it on next due', () => {
    const beforeNextDue = calculateReceivable({
      installments: [
        inst('i1', 1, '2026-08-15', '10000'),
        inst('i2', 2, '2026-09-15', '10000'),
      ],
      payments: [pay('p1', '2026-08-15', '15000')],
      monthlyCostRatePct: 3,
      asOfDate: '2026-08-20',
    })
    expect(beforeNextDue.openDuePrincipal).toBe('0.00')
    expect(beforeNextDue.advanceCredit).toBe('5000.00')

    const afterNextDue = calculateReceivable({
      installments: [
        inst('i1', 1, '2026-08-15', '10000'),
        inst('i2', 2, '2026-09-15', '10000'),
      ],
      payments: [pay('p1', '2026-08-15', '15000')],
      monthlyCostRatePct: 3,
      asOfDate: '2026-09-15',
    })
    expect(afterNextDue.advanceCredit).toBe('0.00')
    expect(afterNextDue.openDuePrincipal).toBe('5000.00')
    expect(afterNextDue.installmentResults[0]?.open).toBe('0.00')
    expect(afterNextDue.installmentResults[1]?.open).toBe('5000.00')
  })
})

describe('Test 8 — FIFO allocation', () => {
  it('closes oldest open installment first', () => {
    const result = calculateReceivable({
      installments: [
        inst('i1', 1, '2026-07-15', '10000'),
        inst('i2', 2, '2026-08-15', '10000'),
      ],
      payments: [
        pay('p0', '2026-07-15', '8000'),
        pay('p1', '2026-08-16', '5000'),
      ],
      monthlyCostRatePct: 3,
      asOfDate: '2026-08-16',
    })
    // After p0: i1 open 2000. After due i2: opens 10000. Payment 5000 FIFO:
    expect(result.installmentResults[0]?.open).toBe('0.00')
    expect(result.installmentResults[1]?.open).toBe('7000.00')
    const alloc = result.allocations.filter((a) => a.paymentId === 'p1')
    expect(alloc).toEqual([
      expect.objectContaining({ installmentSequence: 1, amount: '2000.00' }),
      expect.objectContaining({ installmentSequence: 2, amount: '3000.00' }),
    ])
  })
})

describe('Test 9 — Future events ignored', () => {
  it('ignores payments after asOfDate', () => {
    const result = calculateReceivable({
      installments: [inst('i1', 1, '2026-08-15', '10000')],
      payments: [pay('p1', '2026-09-01', '10000')],
      monthlyCostRatePct: 3,
      asOfDate: '2026-08-26',
    })
    expect(result.receivedCash).toBe('0.00')
    expect(result.openDuePrincipal).toBe('10000.00')
    expect(result.accruedCarryingCost).toBe('110.00')
  })

  it('excludes future installments from open due principal', () => {
    const result = calculateReceivable({
      installments: [
        inst('i1', 1, '2026-08-15', '10000'),
        inst('i2', 2, '2026-09-15', '10000'),
      ],
      payments: [],
      monthlyCostRatePct: 3,
      asOfDate: '2026-08-26',
    })
    expect(result.openDuePrincipal).toBe('10000.00')
    expect(result.futurePrincipal).toBe('10000.00')
    expect(result.economicShortfall).toBe('10110.00')
  })
})

describe('Test 10 — Rate 0', () => {
  it('keeps principal math with zero cost', () => {
    const result = calculateReceivable({
      installments: [inst('i1', 1, '2026-08-15', '10000')],
      payments: [pay('p1', '2026-08-20', '8000')],
      monthlyCostRatePct: 0,
      asOfDate: '2026-08-26',
    })
    expect(result.openDuePrincipal).toBe('2000.00')
    expect(result.accruedCarryingCost).toBe('0.00')
    expect(result.economicShortfall).toBe('2000.00')
  })
})

describe('Test 11 — Month-end schedule', () => {
  it('clamps February and preserves later months without drift', () => {
    const schedule = buildInstallmentSchedule({
      saleId: 's1',
      firstDueDate: '2026-01-31',
      installmentCount: 4,
      defaultInstallmentAmount: '10000',
    })
    expect(schedule.map((s) => s.dueDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
    expect(addMonthsKeepingDay('2026-01-31', 1, 31)).toBe('2026-02-28')
    expect(formatIsoDate(2026, 3, 31)).toBe('2026-03-31')
  })
})

describe('Test 12 — Edit payment recalculation', () => {
  it('recomputes from scratch when payment changes', () => {
    const installments = [inst('i1', 1, '2026-08-15', '10000')]
    const original = calculateReceivable({
      installments,
      payments: [pay('p1', '2026-08-20', '8000')],
      monthlyCostRatePct: 3,
      asOfDate: '2026-08-26',
    })
    expect(original.economicShortfall).toBe('2062.00')

    const edited = calculateReceivable({
      installments,
      payments: [pay('p1', '2026-08-20', '10000')],
      monthlyCostRatePct: 3,
      asOfDate: '2026-08-26',
    })
    expect(edited.openDuePrincipal).toBe('0.00')
    expect(edited.accruedCarryingCost).toBe('50.00')
    expect(edited.economicShortfall).toBe('50.00')
  })
})

describe('Test 13 — Delete payment recalculation', () => {
  it('restores full open principal and cost when payment removed', () => {
    const result = calculateReceivable({
      installments: [inst('i1', 1, '2026-08-15', '10000')],
      payments: [],
      monthlyCostRatePct: 3,
      asOfDate: '2026-08-26',
    })
    expect(result.openDuePrincipal).toBe('10000.00')
    expect(result.accruedCarryingCost).toBe('110.00')
    expect(result.economicShortfall).toBe('10110.00')
  })
})

describe('Test 14 — Carry-forward ledger (7×10000 user fixture)', () => {
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

  it('builds period carry-in/out and keeps first delay segment at 5 days @ 10000', () => {
    const result = calculateReceivable({
      installments,
      payments,
      monthlyCostRatePct: 3,
      asOfDate: '2026-07-01',
    })

    const r1 = result.installmentResults[0]!
    expect(r1.amount).toBe('10000.00')
    expect(r1.carryIn).toBe('0.00')
    expect(r1.amountDue).toBe('10000.00')
    expect(r1.periodPaid).toBe('8000.00')
    expect(r1.carryOut).toBe('2000.00')
    expect(r1.delayDays).toBe(5)
    expect(r1.periodPayments).toEqual([
      expect.objectContaining({ paymentDate: '2026-01-06', amount: '8000.00' }),
    ])

    const r2 = result.installmentResults[1]!
    expect(r2.amount).toBe('10000.00')
    expect(r2.carryIn).toBe('2000.00')
    expect(r2.amountDue).toBe('12000.00')
    expect(r2.periodPaid).toBe('10000.00')
    expect(r2.carryOut).toBe('2000.00')

    // Cost timeline: 01.01→06.01 principal 10000 for 5 days
    expect(result.costSegments[0]).toMatchObject({
      startDate: '2026-01-01',
      endDate: '2026-01-06',
      days: 5,
      principal: '10000.00',
      cost: '50.00',
    })
    // Remaining 2000 continues after 06.01 (until next event)
    expect(result.costSegments[1]).toMatchObject({
      startDate: '2026-01-06',
      endDate: '2026-02-01',
      principal: '2000.00',
    })
    expect(Number(result.costSegments[1]!.days)).toBe(daysBetween('2026-01-06', '2026-02-01'))

    // Period 1 cost = segment0 + segment1 (both start in [01.01, 02.01))
    expect(r1.cost).toBe(
      moneyToString(d(result.costSegments[0]!.cost).plus(d(result.costSegments[1]!.cost))),
    )

    // No double-count: sum of period costs == portfolio accrued cost
    const periodCostSum = result.installmentResults.reduce((s, r) => s.plus(d(r.cost)), d(0))
    expect(moneyToString(periodCostSum)).toBe(result.accruedCarryingCost)
  })

  it('keeps multi-payment lines inside a single period', () => {
    const result = calculateReceivable({
      installments: [inst('i1', 1, '2026-01-01', '10000')],
      payments: [
        pay('p1', '2026-01-06', '3000'),
        pay('p2', '2026-01-10', '5000'),
        pay('p3', '2026-01-20', '2000'),
      ],
      monthlyCostRatePct: 3,
      asOfDate: '2026-01-20',
    })
    const r1 = result.installmentResults[0]!
    expect(r1.periodPayments.map((p) => `${p.paymentDate}:${p.amount}`)).toEqual([
      '2026-01-06:3000.00',
      '2026-01-10:5000.00',
      '2026-01-20:2000.00',
    ])
    expect(r1.periodPaid).toBe('10000.00')
    expect(r1.carryOut).toBe('0.00')
    expect(result.costSegments).toHaveLength(3)
    expect(result.costSegments[0]).toMatchObject({
      startDate: '2026-01-01',
      endDate: '2026-01-06',
      days: 5,
      principal: '10000.00',
    })
  })
})
