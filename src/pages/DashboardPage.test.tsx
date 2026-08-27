import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { customers, sales } = vi.hoisted(() => ({
  customers: [] as never[],
  sales: [] as never[],
}))

vi.mock('../app/AppDataContext', () => ({
  useAppData: () => ({
    customers,
    sales,
    loading: false,
    error: null,
    asOfDate: '2026-08-27',
    setAsOfDate: vi.fn(),
    resetAsOfToToday: vi.fn(),
    refresh: vi.fn(),
    getSalesForCustomer: () => [],
    getInstallments: vi.fn(),
    getPayments: vi.fn(),
  }),
}))

vi.mock('../storage/repository', () => ({
  listInstallments: vi.fn(async () => []),
  listPayments: vi.fn(async () => []),
  createCustomer: vi.fn(),
}))

vi.mock('../utils/export', () => ({
  exportCustomerSummaryXlsx: vi.fn(),
}))

describe('DashboardPage information hierarchy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders KPIs before actions and hides backup/restore', async () => {
    const { DashboardPage } = await import('./DashboardPage')
    const { container } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText('Özet göstergeler')).toBeInTheDocument()
    expect(screen.getByText('Toplam Müşteri')).toBeInTheDocument()
    expect(screen.getByText('Aktif Satış')).toBeInTheDocument()
    expect(screen.getByText('Vadesi Gelen Ana Para')).toBeInTheDocument()
    expect(screen.getByText('Tahsil Edilen')).toBeInTheDocument()
    expect(screen.getByText('Açık Ana Para')).toBeInTheDocument()
    expect(screen.getByText('Para Maliyeti')).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'Yedek Al' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Geri Yükle' })).not.toBeInTheDocument()

    const kpi = screen.getByLabelText('Özet göstergeler')
    const asof = container.querySelector('.page-asof')
    const work = container.querySelector('.dashboard-work')
    expect(asof).toBeTruthy()
    expect(work).toBeTruthy()

    const position = kpi.compareDocumentPosition(asof!)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const asofThenWork = asof!.compareDocumentPosition(work!)
    expect(asofThenWork & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const actions = within(work as HTMLElement).getByLabelText('İşlemler')
    expect(within(actions).getByRole('button', { name: 'Excel Özet' })).toBeInTheDocument()
    expect(within(actions).getByRole('button', { name: 'Müşteri Ekle' })).toBeInTheDocument()
  })
})
