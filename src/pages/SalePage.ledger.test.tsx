import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Customer, Installment, Payment, Sale } from '../domain/types'
import { SalePage } from '../pages/SalePage'

const sale: Sale = {
  id: 'sale-1',
  customerId: 'cus-1',
  title: 'Ledger Satış',
  contractDate: '2026-01-01',
  firstDueDate: '2026-01-01',
  installmentCount: 2,
  defaultInstallmentAmount: '10000.00',
  monthlyCostRatePct: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const customer: Customer = {
  id: 'cus-1',
  name: 'Ali Veli',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const installments: Installment[] = [
  {
    id: 'inst-1',
    saleId: 'sale-1',
    sequence: 1,
    dueDate: '2026-01-01',
    amount: '10000.00',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'inst-2',
    saleId: 'sale-1',
    sequence: 2,
    dueDate: '2026-02-01',
    amount: '10000.00',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

const { paymentsRef } = vi.hoisted(() => {
  const paymentsRef: { current: Payment[] } = {
    current: [
      {
        id: 'pay-1',
        saleId: 'sale-1',
        paymentDate: '2026-01-06',
        amount: '8000.00',
        createdAt: '2026-01-06T12:00:00.000Z',
        updatedAt: '2026-01-06T12:00:00.000Z',
      },
    ],
  }
  return { paymentsRef }
})

vi.mock('../app/AppDataContext', () => ({
  useAppData: () => ({
    customers: [customer],
    sales: [sale],
    loading: false,
    error: null,
    asOfDate: '2026-02-01',
    setAsOfDate: vi.fn(),
    resetAsOfToToday: vi.fn(),
    refresh: vi.fn(async () => undefined),
    getSalesForCustomer: () => [sale],
    getInstallments: vi.fn(async () => installments),
    getPayments: vi.fn(async () => paymentsRef.current),
  }),
}))

vi.mock('../storage/repository', () => ({
  getSale: vi.fn(async () => sale),
  getCustomer: vi.fn(async () => customer),
  listInstallments: vi.fn(async () => installments),
  listPayments: vi.fn(async () => paymentsRef.current),
  createPayment: vi.fn(),
  updatePayment: vi.fn(),
  deletePayment: vi.fn(),
  updateSale: vi.fn(),
  updateInstallment: vi.fn(),
  deleteSale: vi.fn(),
}))

vi.mock('../utils/export', () => ({
  exportInstallmentPlanXlsx: vi.fn(),
  exportPaymentsXlsx: vi.fn(),
}))

describe('SalePage installment ledger UI', () => {
  beforeEach(() => {
    paymentsRef.current = [
      {
        id: 'pay-1',
        saleId: 'sale-1',
        paymentDate: '2026-01-06',
        amount: '8000.00',
        createdAt: '2026-01-06T12:00:00.000Z',
        updatedAt: '2026-01-06T12:00:00.000Z',
      },
    ]
  })

  it('renders carry-forward columns and period payment line', async () => {
    render(
      <MemoryRouter initialEntries={['/sales/sale-1']}>
        <Routes>
          <Route path="/sales/:saleId" element={<SalePage />} />
        </Routes>
      </MemoryRouter>,
    )

    const ledger = await screen.findByRole('table', { name: 'Taksit planı' })
    expect(within(ledger).getByText('Aylık Taksit')).toBeInTheDocument()
    expect(within(ledger).getByText('Devreden')).toBeInTheDocument()
    expect(within(ledger).getByText('Ödenmesi Gereken')).toBeInTheDocument()
    expect(within(ledger).getByText('Ödenen')).toBeInTheDocument()
    expect(within(ledger).getByText('Kalan')).toBeInTheDocument()

    // First period payment line visible
    expect(await within(ledger).findByText(/06\.01\.2026/)).toBeInTheDocument()
  })
})
