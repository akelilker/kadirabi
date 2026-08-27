import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Customer, Installment, Payment, Sale } from '../domain/types'
import { SalePage } from './SalePage'

function paymentForm() {
  const form = document.getElementById('add-payment-form')
  if (!form) throw new Error('add-payment-form missing')
  return within(form as HTMLElement)
}

const sale: Sale = {
  id: 'sale-1',
  customerId: 'cus-1',
  title: 'Test Satış',
  contractDate: '2026-01-01',
  firstDueDate: '2026-02-01',
  installmentCount: 2,
  defaultInstallmentAmount: '1000.00',
  monthlyCostRatePct: 2,
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
    dueDate: '2026-02-01',
    amount: '1000.00',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'inst-2',
    saleId: 'sale-1',
    sequence: 2,
    dueDate: '2026-03-01',
    amount: '1000.00',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

const { paymentsRef, createPayment, updatePayment } = vi.hoisted(() => {
  const paymentsRef: { current: Payment[] } = { current: [] }
  const createPayment = vi.fn(
    async (input: { saleId: string; paymentDate: string; amount: string; note?: string }) => {
      const created: Payment = {
        id: `pay-${paymentsRef.current.length + 1}`,
        saleId: input.saleId,
        paymentDate: input.paymentDate,
        amount: Number(input.amount).toFixed(2),
        note: input.note?.trim() || undefined,
        createdAt: '2026-08-27T10:00:00.000Z',
        updatedAt: '2026-08-27T10:00:00.000Z',
      }
      paymentsRef.current = [...paymentsRef.current, created]
      return created
    },
  )
  const updatePayment = vi.fn(async (id: string, patch: Partial<Pick<Payment, 'note'>>) => {
    paymentsRef.current = paymentsRef.current.map((p) =>
      p.id === id ? { ...p, ...patch, note: patch.note?.trim() || undefined } : p,
    )
    return paymentsRef.current.find((p) => p.id === id)!
  })
  return { paymentsRef, createPayment, updatePayment }
})

vi.mock('../app/AppDataContext', () => ({
  useAppData: () => ({
    customers: [customer],
    sales: [sale],
    loading: false,
    error: null,
    asOfDate: '2026-08-27',
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
  createPayment,
  updatePayment,
  deletePayment: vi.fn(),
  updateSale: vi.fn(),
  updateInstallment: vi.fn(),
  deleteSale: vi.fn(),
}))

vi.mock('../utils/export', () => ({
  exportInstallmentPlanXlsx: vi.fn(),
  exportPaymentsXlsx: vi.fn(),
}))

function renderSalePage() {
  return render(
    <MemoryRouter initialEntries={['/sales/sale-1']}>
      <Routes>
        <Route path="/sales/:saleId" element={<SalePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SalePage payment add flow', () => {
  beforeEach(() => {
    paymentsRef.current = []
    createPayment.mockClear()
    updatePayment.mockClear()
  })

  it('renders compact Tutar + Tarih + Ekle and keeps optional details closed', async () => {
    renderSalePage()
    await screen.findByLabelText('Tutar')
    const form = paymentForm()
    expect(form.getByLabelText('Tutar')).toBeInTheDocument()
    expect(form.getByLabelText('Tarih')).toBeInTheDocument()
    expect(form.getByRole('button', { name: '+ Ekle' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Açıklama')).not.toBeInTheDocument()
    expect(screen.queryByText('Detay eklemek ister misiniz?')).not.toBeInTheDocument()
  })

  it('rejects invalid amount and keeps form values', async () => {
    const user = userEvent.setup()
    renderSalePage()
    await screen.findByLabelText('Tutar')
    const form = paymentForm()

    await user.type(form.getByLabelText('Tutar'), '0')
    await user.click(form.getByRole('button', { name: '+ Ekle' }))

    await waitFor(() => {
      expect(form.getByText('Ödeme tutarı geçersiz.')).toBeInTheDocument()
    })
    expect(createPayment).not.toHaveBeenCalled()
    expect(form.getByLabelText('Tutar')).toHaveValue('0')
    expect(form.getByLabelText('Tarih')).toHaveValue('2026-08-27')
  })

  it('submits valid amount+date once and offers progressive detail', async () => {
    const user = userEvent.setup()
    renderSalePage()
    await screen.findByLabelText('Tutar')
    const form = paymentForm()

    await user.type(form.getByLabelText('Tutar'), '250')
    await user.click(form.getByRole('button', { name: '+ Ekle' }))

    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1))
    expect(createPayment).toHaveBeenCalledWith({
      saleId: 'sale-1',
      paymentDate: '2026-08-27',
      amount: '250.00',
    })
    expect(await screen.findByText('Detay eklemek ister misiniz?')).toBeInTheDocument()
    expect(form.getByLabelText('Tutar')).toHaveValue('')

    await user.click(screen.getByRole('button', { name: 'Evet' }))
    expect(screen.getByLabelText('Açıklama')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Açıklama'), 'Nakit')
    await user.click(screen.getByRole('button', { name: 'Detayı Kaydet' }))

    await waitFor(() => expect(updatePayment).toHaveBeenCalledTimes(1))
    expect(updatePayment).toHaveBeenCalledWith('pay-1', { note: 'Nakit' })
  })

  it('prevents double submit while busy', async () => {
    const user = userEvent.setup()
    let resolveCreate: (value: Payment) => void = () => undefined
    createPayment.mockImplementationOnce(
      () =>
        new Promise<Payment>((resolve) => {
          resolveCreate = resolve
        }),
    )

    renderSalePage()
    await screen.findByLabelText('Tutar')
    const form = paymentForm()
    await user.type(form.getByLabelText('Tutar'), '100')

    const submit = form.getByRole('button', { name: '+ Ekle' })
    await user.click(submit)
    expect(submit).toBeDisabled()
    await user.click(submit)
    expect(createPayment).toHaveBeenCalledTimes(1)

    resolveCreate({
      id: 'pay-pending',
      saleId: 'sale-1',
      paymentDate: '2026-08-27',
      amount: '100.00',
      createdAt: '2026-08-27T10:00:00.000Z',
      updatedAt: '2026-08-27T10:00:00.000Z',
    })
    await waitFor(() => expect(submit).not.toBeDisabled())
  })
})
