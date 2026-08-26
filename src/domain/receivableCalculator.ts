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

    while (isPositive(remaining) && openQueue.length > 0) {
      const target = openQueue[0]!
      const openAmt = target.amount.minus(target.allocated)
      const apply = Decimal.min(remaining, openAmt)
      target.allocated = target.allocated.plus(apply)
      remaining = remaining.minus(apply)
      openDuePrincipal = openDuePrincipal.minus(apply)
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

  const advanceCredit = totalAdvanceCredit()

  // Snapshot open/closed for installment results
  const stateById = new Map<string, OpenInstallment>()
  for (const item of closedMap.values()) stateById.set(item.installmentId, item)
  for (const item of openQueue) stateById.set(item.installmentId, item)

  let duePrincipal = moneyZero()
  let futurePrincipal = moneyZero()
  const installmentResults: InstallmentResult[] = []

  const installmentCost = computePerInstallmentCosts(
    installments,
    payments,
    monthlyCostRatePct,
    asOfDate,
  )

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

    let delayDays = 0
    if (!dueInFuture && isPositive(open)) {
      delayDays = Math.max(0, daysBetween(inst.dueDate, asOfDate))
    } else if (!dueInFuture && state?.lastPaymentDate) {
      delayDays = Math.max(0, daysBetween(inst.dueDate, state.lastPaymentDate))
    }

    installmentResults.push({
      installmentId: inst.id,
      sequence: inst.sequence,
      dueDate: inst.dueDate,
      amount: moneyToString(amount),
      allocated: moneyToString(allocated),
      open: moneyToString(open),
      status: buildStatus({
        dueDate: inst.dueDate,
        asOfDate,
        amount,
        allocated,
        lastPaymentDate: state?.lastPaymentDate ?? null,
      }),
      lastPaymentDate: state?.lastPaymentDate ?? null,
      delayDays,
      cost: moneyToString(installmentCost.get(inst.id) ?? moneyZero()),
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

/**
 * Attribute carrying cost per installment by simulating each installment's
 * outstanding balance over time (FIFO allocations already applied globally).
 * Used for table display only; total cost comes from portfolio-level segments.
 */
function computePerInstallmentCosts(
  installments: Installment[],
  payments: Payment[],
  monthlyCostRatePct: number,
  asOfDate: IsoDate,
): Map<string, Decimal> {
  // Run a lightweight per-installment remaining tracker using global FIFO allocations
  const calc = calculateReceivableCoreWithoutPerCost(installments, payments, monthlyCostRatePct, asOfDate)
  return calc
}

function calculateReceivableCoreWithoutPerCost(
  installments: Installment[],
  payments: Payment[],
  monthlyCostRatePct: number,
  asOfDate: IsoDate,
): Map<string, Decimal> {
  const costs = new Map<string, Decimal>()
  for (const inst of installments) costs.set(inst.id, moneyZero())

  const sortedInst = [...installments].sort((a, b) => a.sequence - b.sequence)
  const sortedPay = [...payments]
    .filter((p) => compareIsoDates(p.paymentDate, asOfDate) <= 0 && isPositive(d(p.amount)))
    .sort((a, b) => {
      const c = compareIsoDates(a.paymentDate, b.paymentDate)
      if (c !== 0) return c
      return a.createdAt.localeCompare(b.createdAt)
    })

  type Track = {
    id: string
    dueDate: IsoDate
    remaining: Decimal
    active: boolean
  }

  const tracks: Track[] = sortedInst.map((i) => ({
    id: i.id,
    dueDate: i.dueDate,
    remaining: d(i.amount),
    active: false,
  }))

  type Ev =
    | { kind: 'due'; date: IsoDate; id: string }
    | { kind: 'pay'; date: IsoDate; amount: Decimal }

  const events: Ev[] = []
  for (const t of tracks) {
    if (compareIsoDates(t.dueDate, asOfDate) <= 0) {
      events.push({ kind: 'due', date: t.dueDate, id: t.id })
    }
  }
  for (const p of sortedPay) {
    events.push({ kind: 'pay', date: p.paymentDate, amount: d(p.amount) })
  }
  events.sort((a, b) => {
    const c = compareIsoDates(a.date, b.date)
    if (c !== 0) return c
    if (a.kind !== b.kind) return a.kind === 'due' ? -1 : 1
    return 0
  })

  let credit = moneyZero()
  let cursor: IsoDate | null = null
  const byId = new Map(tracks.map((t) => [t.id, t]))

  const openPrincipalOf = (t: Track) => (t.active ? t.remaining : moneyZero())

  const accrue = (to: IsoDate) => {
    if (cursor === null) {
      cursor = to
      return
    }
    const days = daysBetween(cursor, to)
    if (days > 0) {
      for (const t of tracks) {
        const open = openPrincipalOf(t)
        if (isPositive(open)) {
          const cost = calculateCarryingCost(open, monthlyCostRatePct, days)
          costs.set(t.id, (costs.get(t.id) ?? moneyZero()).plus(cost))
        }
      }
    }
    cursor = to
  }

  const applyCredit = () => {
    for (const t of tracks) {
      if (!t.active || !isPositive(t.remaining) || !isPositive(credit)) continue
      const apply = Decimal.min(credit, t.remaining)
      t.remaining = t.remaining.minus(apply)
      credit = credit.minus(apply)
    }
  }

  for (const ev of events) {
    accrue(ev.date)
    if (ev.kind === 'due') {
      const t = byId.get(ev.id)!
      t.active = true
      applyCredit()
    } else {
      let rem = ev.amount
      for (const t of tracks) {
        if (!t.active || !isPositive(t.remaining) || !isPositive(rem)) continue
        const apply = Decimal.min(rem, t.remaining)
        t.remaining = t.remaining.minus(apply)
        rem = rem.minus(apply)
      }
      if (isPositive(rem)) credit = credit.plus(rem)
    }
  }
  if (cursor !== null) accrue(asOfDate)

  return costs
}

export function sumCostSegments(segments: CostSegment[]): string {
  let total = moneyZero()
  for (const s of segments) total = total.plus(d(s.cost))
  return moneyToString(total)
}

export function isZeroMoney(value: string): boolean {
  return isZero(d(value))
}
