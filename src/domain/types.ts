/** ISO calendar date: YYYY-MM-DD (date-only, timezone-independent). */
export type IsoDate = string

export type InstallmentStatus =
  | 'bekliyor'
  | 'odendi'
  | 'kismi'
  | 'gecikmis'
  | 'gec_odendi'
  | 'erken_odendi'
  | 'henuz_vadesi_gelmedi'

export interface Customer {
  id: string
  name: string
  phone?: string
  note?: string
  createdAt: string
  updatedAt: string
}

export interface Sale {
  id: string
  customerId: string
  title?: string
  contractDate: IsoDate
  firstDueDate: IsoDate
  installmentCount: number
  /** Decimal string, e.g. "10000.00" */
  defaultInstallmentAmount: string
  /** Monthly carrying cost rate as percent, e.g. 3 = 3% */
  monthlyCostRatePct: number
  note?: string
  createdAt: string
  updatedAt: string
}

export interface Installment {
  id: string
  saleId: string
  sequence: number
  dueDate: IsoDate
  /** Decimal string */
  amount: string
  createdAt: string
  updatedAt: string
}

export interface Payment {
  id: string
  saleId: string
  paymentDate: IsoDate
  /** Decimal string */
  amount: string
  note?: string
  createdAt: string
  updatedAt: string
}

export interface CostSegment {
  startDate: IsoDate
  endDate: IsoDate
  days: number
  /** Decimal string */
  principal: string
  monthlyRate: number
  /** Decimal string */
  cost: string
}

export interface PaymentAllocation {
  paymentId: string
  installmentId: string
  installmentSequence: number
  /** Decimal string */
  amount: string
}

/** Payment lines that reduced open balance inside an installment period. */
export interface PeriodPaymentLine {
  paymentId: string
  paymentDate: IsoDate
  /** Decimal string */
  amount: string
}

export interface InstallmentResult {
  installmentId: string
  sequence: number
  dueDate: IsoDate
  /** Decimal string — scheduled installment (cari taksit) */
  amount: string
  /** Decimal string — FIFO allocated to this installment (lifetime) */
  allocated: string
  /** Decimal string — remaining open on this installment (FIFO) */
  open: string
  /**
   * Open principal carried in from prior periods, immediately before this due.
   * Positive open debt only — not advance credit.
   */
  carryIn: string
  /** amount + carryIn at due instant */
  amountDue: string
  /** Payments applied to portfolio open during this period (due → next due / asOf) */
  periodPaid: string
  /** Open principal remaining at period end (before next installment is added) */
  carryOut: string
  /** Payments that hit open balance in this period window */
  periodPayments: PeriodPaymentLine[]
  status: InstallmentStatus
  lastPaymentDate: IsoDate | null
  /**
   * Period delay: days from due to first in-period payment (or to period end if unpaid).
   * Does not collapse partial-payment history into the final settlement date.
   */
  delayDays: number
  /**
   * Carrying cost accrued on portfolio open during this period window
   * (sum of cost segments with start in [due, periodEnd)).
   */
  cost: string
}

export interface CalculationResult {
  asOfDate: IsoDate
  /** Decimal strings for UI-safe serialization */
  contractTotal: string
  duePrincipal: string
  receivedCash: string
  openDuePrincipal: string
  futurePrincipal: string
  advanceCredit: string
  accruedCarryingCost: string
  economicShortfall: string
  installmentResults: InstallmentResult[]
  allocations: PaymentAllocation[]
  costSegments: CostSegment[]
}

export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  bekliyor: 'Bekliyor',
  odendi: 'Ödendi',
  kismi: 'Kısmi',
  gecikmis: 'Gecikmiş',
  gec_odendi: 'Geç Ödendi',
  erken_odendi: 'Erken Ödendi',
  henuz_vadesi_gelmedi: 'Henüz Vadesi Gelmedi',
}

export const SCHEMA_VERSION = 1
export const DEFAULT_MONTHLY_COST_RATE_PCT = 3
