import { addMonthsKeepingDay, parseIsoDate } from './dates'
import { d, moneyToString } from './money'
import type { Installment, IsoDate } from './types'

export interface ScheduleInput {
  saleId: string
  firstDueDate: IsoDate
  installmentCount: number
  defaultInstallmentAmount: string
  nowIso?: string
  idFactory?: (sequence: number) => string
}

/**
 * Build equal installment schedule anchored to the first due date's day-of-month.
 * Month-end edge cases clamp to the last valid day without drifting the anchor.
 */
export function buildInstallmentSchedule(input: ScheduleInput): Installment[] {
  const {
    saleId,
    firstDueDate,
    installmentCount,
    defaultInstallmentAmount,
    nowIso = new Date().toISOString(),
    idFactory,
  } = input

  if (installmentCount <= 0) {
    throw new Error('Taksit sayısı 0\'dan büyük olmalıdır.')
  }

  const amount = d(defaultInstallmentAmount)
  if (!amount.gt(0)) {
    throw new Error('Taksit tutarı 0\'dan büyük olmalıdır.')
  }

  const anchorDay = parseIsoDate(firstDueDate).day
  const amountStr = moneyToString(amount)
  const result: Installment[] = []

  for (let i = 0; i < installmentCount; i += 1) {
    const dueDate =
      i === 0
        ? firstDueDate
        : addMonthsKeepingDay(firstDueDate, i, anchorDay)

    const sequence = i + 1
    result.push({
      id: idFactory ? idFactory(sequence) : `${saleId}-inst-${sequence}`,
      saleId,
      sequence,
      dueDate,
      amount: amountStr,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
  }

  return result
}

export function contractTotalFromInstallments(installments: Pick<Installment, 'amount'>[]): string {
  let total = d(0)
  for (const inst of installments) {
    total = total.plus(d(inst.amount))
  }
  return moneyToString(total)
}
