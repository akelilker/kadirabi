import Decimal from 'decimal.js'

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
})

export { Decimal }

export function d(value: Decimal.Value): Decimal {
  return new Decimal(value)
}

export function moneyZero(): Decimal {
  return new Decimal(0)
}

/** Final presentation rounding — 2 decimal places. */
export function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

export function moneyToString(value: Decimal): string {
  return roundMoney(value).toFixed(2)
}

export function isPositive(value: Decimal): boolean {
  return value.gt(0)
}

export function isZero(value: Decimal): boolean {
  return value.eq(0)
}
