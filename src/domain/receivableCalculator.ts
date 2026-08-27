import { compareIsoDates, daysBetween } from './dates'
import { Decimal, d, isPositive, isZero, moneyToString, moneyZero } from './money'
import type {
  CalculationResult,
  CostSegment,
  Installment,
  InstallmentResult,
  InstallmentStatus,
  IsoDate,
  Payment,
  PaymentAllocation,
} from './types'
import { contractTotalFromInstallments } from './schedule'

export interface CalculateReceivableInput {
  installments: Installment[]
  payments: Payment[]
  /** Monthly rate as percent, e.g. 3 => 3% => 0.03 */
  monthlyCostRatePct: number
  asOfDate: IsoDate
}

type DueEvent = {
  kind: 'due'
  date: IsoDate
  installmentId: string
  sequence: number
  amount: Decimal
}

type PayEvent = {
  kind: 'payment'
  date: IsoDate
  paymentId: string
  amount: Decimal
}

type TimelineEvent = DueEvent | PayEvent

type OpenInstallment = {
  installmentId: string
  sequence: number
  dueDate: IsoDate
  amount: Decimal
  allocated: Decimal
  lastPaymentDate: IsoDate | null
}

/**
 * Simple daily carrying cost:
 * cost = openPrincipal × monthlyRate × days / 30
 * Carrying cost does not compound onto itself.
 */
export function calculateCarryingCost(
  openPrincipal: Decimal,
  monthlyRatePct: number,
  days: number,
): Decimal {
  if (days <= 0 || !isPositive(openPrincipal) || monthlyRatePct <= 0) {
    return moneyZero()
  }
  const monthlyRate = d(monthlyRatePct).div(100)
  return openPrincipal.times(monthlyRate).times(days).div(30)
}

function sortEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    const byDate = compareIsoDates(a.date, b.date)
    if (byDate !== 0) return byDate
    // Same day: dues before payments so same-day full payment => 0 delay days.
    if (a.kind !== b.kind) {
      return a.kind === 'due' ? -1 : 1
    }
    if (a.kind === 'due' && b.kind === 'due') {
      return a.sequence - b.sequence
    }
    return 0
  })
}

function buildStatus(args: {
  dueDate: IsoDate
  asOfDate: IsoDate
  amount: Decimal
  allocated: Decimal
  lastPaymentDate: IsoDate | null
}): InstallmentStatus {
  const { dueDate, asOfDate, amount, allocated, lastPaymentDate } = args
  const open = amount.minus(allocated)
  const fullyPaid = open.lte(0)
  const nonePaid = !isPositive(allocated)
  const dueInFuture = compareIsoDates(dueDate, asOfDate) > 0

  if (dueInFuture) {
    if (fullyPaid) return 'erken_odendi'
    if (isPositive(allocated)) return 'kismi'
    return 'henuz_vadesi_gelmedi'
  }

  if (fullyPaid) {
    if (lastPaymentDate && compareIsoDates(lastPaymentDate, dueDate) < 0) {
      return 'erken_odendi'
    }
    if (lastPaymentDate && compareIsoDates(lastPaymentDate, dueDate) > 0) {
      return 'gec_odendi'
    }
    return 'odendi'
  }

  if (nonePaid) {
    if (compareIsoDates(dueDate, asOfDate) < 0) return 'gecikmis'
    return 'bekliyor'
  }

  if (compareIsoDates(dueDate, asOfDate) < 0) return 'gecikmis'
  return 'kismi'
}

/**
 * Event-sourced receivable calculator.
 * Source of truth: installment schedule + payment ledger + rate + asOfDate.
 */
export function calculateReceivable(input: CalculateReceivableInput): CalculationResult {
  const { monthlyCostRatePct, asOfDate } = input
  const installments = [...input.installments].sort((a, b) => a.sequence - b.sequence)
  const payments = [...input.payments].sort((a, b) => {
    const c = compareIsoDates(a.paymentDate, b.paymentDate)
    if (c !== 0) return c
    return a.createdAt.localeCompare(b.createdAt)
  })

  if (monthlyCostRatePct < 0) {
    throw new Error('Aylık para maliyeti negatif olamaz.')
  }

  const events: TimelineEvent[] = []
  for (const inst of installments) {
    if (compareIsoDates(inst.dueDate, asOfDate) <= 0) {
      events.push({
        kind: 'due',
        date: inst.dueDate,
        installmentId: inst.id,
        sequence: inst.sequence,
        amount: d(inst.amount),
      })
    }
  }
  for (const pay of payments) {
    if (compareIsoDates(pay.paymentDate, asOfDate) <= 0) {
      const amount = d(pay.amount)
      if (!isPositive(amount)) continue
      events.push({
        kind: 'payment',
        date: pay.paymentDate,
        paymentId: pay.id,
        amount,
      })
    }
  }

  const sorted = sortEvents(events)

  const openQueue: OpenInstallment[] = []
  const closedMap = new Map<string, OpenInstallment>()
  const allocations: PaymentAllocation[] = []
  const costSegments: CostSegment[] = []

  type CreditLot = { date: IsoDate; amount: Decimal; paymentId: string }
  const creditLots: CreditLot[] = []

  type PeriodAcc = {
    installmentId: string
    sequence: number
    dueDate: IsoDate
    amount: Decimal
    carryIn: Decimal
    amountDue: Decimal
    periodPaid: Decimal
    periodPayments: Array<{ paymentId: string; paymentDate: IsoDate; amount: Decimal }>
    /** Exclusive end of period (next due or asOf). */
    periodEnd: IsoDate
  }
  const periodById = new Map<string, PeriodAcc>()
  let activePeriodId: string | null = null

  const totalAdvanceCredit = () =>
    creditLots.reduce((sum, lot) => sum.plus(lot.amount), moneyZero())

  let openDuePrincipal = moneyZero()
  let accruedCarryingCost = moneyZero()
  let cursorDate: IsoDate | null = null
  let receivedCash = moneyZero()

  const accrueTo = (nextDate: IsoDate) => {
    if (cursorDate === null) {
      cursorDate = nextDate
      return
    }
    const days = daysBetween(cursorDate, nextDate)
    if (days > 0 && isPositive(openDuePrincipal)) {
      const cost = calculateCarryingCost(openDuePrincipal, monthlyCostRatePct, days)
      costSegments.push({
        startDate: cursorDate,
        endDate: nextDate,
        days,
        principal: moneyToString(openDuePrincipal),
        monthlyRate: monthlyCostRatePct,
        cost: moneyToString(cost),
      })
      accruedCarryingCost = accruedCarryingCost.plus(cost)
    }
    cursorDate = nextDate
  }

  const applyCreditToOpen = () => {
    while (creditLots.length > 0 && openQueue.length > 0) {
      const lot = creditLots[0]!
      const target = openQueue[0]!
      const remaining = target.amount.minus(target.allocated)
      const apply = Decimal.min(lot.amount, remaining)
      target.allocated = target.allocated.plus(apply)
      lot.amount = lot.amount.minus(apply)
      openDuePrincipal = openDuePrincipal.minus(apply)
      // Keep earliest payment date that contributed (early payments stay early).
      if (
        target.lastPaymentDate === null ||
        compareIsoDates(lot.date, target.lastPaymentDate) < 0
      ) {
        target.lastPaymentDate = lot.date
      }
      allocations.push({
        paymentId: lot.paymentId,
        installmentId: target.installmentId,
        installmentSequence: target.sequence,
        amount: moneyToString(apply),
      })
      // Advance-credit application on due day counts toward the new period's paid.
      if (activePeriodId) {
        const period = periodById.get(activePeriodId)
        if (period && isPositive(apply)) {
          period.periodPaid = period.periodPaid.plus(apply)
          period.periodPayments.push({
            paymentId: lot.paymentId,
            paymentDate: lot.date,
            amount: apply,
          })
        }
      }
      if (!isPositive(lot.amount)) {
        creditLots.shift()
      }
      if (!isPositive(target.amount.minus(target.allocated))) {
        closedMap.set(target.installmentId, target)
        openQueue.shift()
      }
    }
  }

  for (const event of sorted) {
    accrueTo(event.date)

    if (event.kind === 'due') {
      if (activePeriodId) {
        const prev = periodById.get(activePeriodId)
        if (prev) prev.periodEnd = event.date
      }
      const carryIn = openDuePrincipal
      const amountDue = carryIn.plus(event.amount)
      periodById.set(event.installmentId, {
        installmentId: event.installmentId,
        sequence: event.sequence,
        dueDate: event.date,
        amount: event.amount,
        carryIn,
        amountDue,
        periodPaid: moneyZero(),
        periodPayments: [],
        periodEnd: asOfDate,
      })
      activePeriodId = event.installmentId

      openQueue.push({
        installmentId: event.installmentId,
        sequence: event.sequence,
        dueDate: event.date,
        amount: event.amount,
        allocated: moneyZero(),
        lastPaymentDate: null,
      })
      openDuePrincipal = openDuePrincipal.plus(event.amount)
      applyCreditToOpen()
      continue
    }

    // payment
    receivedCash = receivedCash.plus(event.amount)
    let remaining = event.amount
    let appliedThisPayment = moneyZero()

    while (isPositive(remaining) && openQueue.length > 0) {
      const target = openQueue[0]!
      const openAmt = target.amount.minus(target.allocated)
      const apply = Decimal.min(remaining, openAmt)
      target.allocated = target.allocated.plus(apply)
      remaining = remaining.minus(apply)
      openDuePrincipal = openDuePrincipal.minus(apply)
      appliedThisPayment = appliedThisPayment.plus(apply)
      target.lastPaymentDate = event.date
      allocations.push({
        paymentId: event.paymentId,
        installmentId: target.installmentId,
        installmentSequence: target.sequence,
        amount: moneyToString(apply),
      })
      if (!isPositive(target.amount.minus(target.allocated))) {
        closedMap.set(target.installmentId, target)
        openQueue.shift()
      }
    }

    if (activePeriodId && isPositive(appliedThisPayment)) {
      const period = periodById.get(activePeriodId)
      if (period) {
        period.periodPaid = period.periodPaid.plus(appliedThisPayment)
        period.periodPayments.push({
          paymentId: event.paymentId,
          paymentDate: event.date,
          amount: appliedThisPayment,
        })
      }
    }

    if (isPositive(remaining)) {
      creditLots.push({
        date: event.date,
        amount: remaining,
        paymentId: event.paymentId,
      })
      // Advance credit does not generate negative carrying cost.
    }
  }

  // Final accrual from last event to asOfDate
  if (cursorDate !== null) {
    accrueTo(asOfDate)
  } else {
    cursorDate = asOfDate
  }

  if (activePeriodId) {
    const last = periodById.get(activePeriodId)
    if (last) last.periodEnd = asOfDate
  }

  const advanceCredit = totalAdvanceCredit()

  // Snapshot open/closed for installment results
  const stateById = new Map<string, OpenInstallment>()
  for (const item of closedMap.values()) stateById.set(item.installmentId, item)
  for (const item of openQueue) stateById.set(item.installmentId, item)

  let duePrincipal = moneyZero()
  let futurePrincipal = moneyZero()
  const installmentResults: InstallmentResult[] = []

  // carryOut at period end = open principal immediately before next due
  // (= carryIn of next period). For the last due period, use current openDuePrincipal.
  const dueInstallments = installments.filter((i) => compareIsoDates(i.dueDate, asOfDate) <= 0)
  const carryOutById = new Map<string, Decimal>()
  for (let i = 0; i < dueInstallments.length; i++) {
    const cur = dueInstallments[i]!
    const next = dueInstallments[i + 1]
    if (next) {
      const nextPeriod = periodById.get(next.id)
      carryOutById.set(cur.id, nextPeriod?.carryIn ?? moneyZero())
    } else {
      carryOutById.set(cur.id, openDuePrincipal)
    }
  }

  for (const inst of installments) {
    const amount = d(inst.amount)
    const state = stateById.get(inst.id)
    const allocated = state ? state.allocated : moneyZero()
    const open = Decimal.max(amount.minus(allocated), moneyZero())
    const dueInFuture = compareIsoDates(inst.dueDate, asOfDate) > 0

    if (dueInFuture) {
      futurePrincipal = futurePrincipal.plus(open)
    } else {
      duePrincipal = duePrincipal.plus(amount)
    }

    const period = periodById.get(inst.id)
    const carryIn = period?.carryIn ?? moneyZero()
    const amountDue = period?.amountDue ?? amount
    const periodPaid = period?.periodPaid ?? moneyZero()
    const carryOut = dueInFuture ? moneyZero() : (carryOutById.get(inst.id) ?? moneyZero())
    const periodPayments = (period?.periodPayments ?? []).map((p) => ({
      paymentId: p.paymentId,
      paymentDate: p.paymentDate,
      amount: moneyToString(p.amount),
    }))
    const periodEnd = period?.periodEnd ?? asOfDate

    let delayDays = 0
    if (!dueInFuture) {
      const firstPay = periodPayments[0]?.paymentDate
      if (firstPay) {
        delayDays = Math.max(0, daysBetween(inst.dueDate, firstPay))
      } else if (isPositive(carryOut) || isPositive(open)) {
        delayDays = Math.max(0, daysBetween(inst.dueDate, periodEnd))
      }
    }

    const periodCost = sumCostSegmentsInWindow(costSegments, inst.dueDate, periodEnd)

    installmentResults.push({
      installmentId: inst.id,
      sequence: inst.sequence,
      dueDate: inst.dueDate,
      amount: moneyToString(amount),
      allocated: moneyToString(allocated),
      open: moneyToString(open),
      carryIn: moneyToString(carryIn),
      amountDue: moneyToString(amountDue),
      periodPaid: moneyToString(periodPaid),
      carryOut: moneyToString(carryOut),
      periodPayments,
      status: buildStatus({
        dueDate: inst.dueDate,
        asOfDate,
        amount,
        allocated,
        lastPaymentDate: state?.lastPaymentDate ?? null,
      }),
      lastPaymentDate: state?.lastPaymentDate ?? null,
      delayDays,
      cost: moneyToString(periodCost),
    })
  }

  let openDueFromResults = moneyZero()
  for (const r of installmentResults) {
    if (compareIsoDates(r.dueDate, asOfDate) <= 0) {
      openDueFromResults = openDueFromResults.plus(d(r.open))
    }
  }

  const economicShortfall = openDueFromResults.plus(accruedCarryingCost)

  return {
    asOfDate,
    contractTotal: contractTotalFromInstallments(installments),
    duePrincipal: moneyToString(duePrincipal),
    receivedCash: moneyToString(receivedCash),
    openDuePrincipal: moneyToString(openDueFromResults),
    futurePrincipal: moneyToString(futurePrincipal),
    advanceCredit: moneyToString(advanceCredit),
    accruedCarryingCost: moneyToString(roundHalfUp2(accruedCarryingCost)),
    economicShortfall: moneyToString(roundHalfUp2(economicShortfall)),
    installmentResults,
    allocations,
    costSegments: costSegments.map((s) => ({
      ...s,
      cost: moneyToString(d(s.cost)),
      principal: moneyToString(d(s.principal)),
    })),
  }
}

function roundHalfUp2(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

/** Sum cost segments whose startDate is in [windowStart, windowEnd). */
function sumCostSegmentsInWindow(
  segments: CostSegment[],
  windowStart: IsoDate,
  windowEnd: IsoDate,
): Decimal {
  let total = moneyZero()
  for (const s of segments) {
    if (compareIsoDates(s.startDate, windowStart) >= 0 && compareIsoDates(s.startDate, windowEnd) < 0) {
      total = total.plus(d(s.cost))
    }
  }
  return total
}

export function sumCostSegments(segments: CostSegment[]): string {
  let total = moneyZero()
  for (const s of segments) total = total.plus(d(s.cost))
  return moneyToString(total)
}

export function isZeroMoney(value: string): boolean {
  return isZero(d(value))
}
