import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { todayIstanbul } from '../domain/dates'
import type { Customer, Installment, Payment, Sale } from '../domain/types'
import * as repo from '../storage/repository'

interface AppData {
  customers: Customer[]
  sales: Sale[]
  loading: boolean
  error: string | null
  asOfDate: string
  setAsOfDate: (date: string) => void
  resetAsOfToToday: () => void
  refresh: () => Promise<void>
  getSalesForCustomer: (customerId: string) => Sale[]
  getInstallments: (saleId: string) => Promise<Installment[]>
  getPayments: (saleId: string) => Promise<Payment[]>
}

const AppDataContext = createContext<AppData | null>(null)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [asOfDate, setAsOfDate] = useState(todayIstanbul)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const [c, s] = await Promise.all([repo.listCustomers(), repo.listAllSales()])
      setCustomers(c)
      setSales(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Veri yüklenemedi.')
      setCustomers([])
      setSales([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const getSalesForCustomer = useCallback(
    (customerId: string) => sales.filter((s) => s.customerId === customerId),
    [sales],
  )

  const value = useMemo<AppData>(
    () => ({
      customers,
      sales,
      loading,
      error,
      asOfDate,
      setAsOfDate,
      resetAsOfToToday: () => setAsOfDate(todayIstanbul()),
      refresh,
      getSalesForCustomer,
      getInstallments: repo.listInstallments,
      getPayments: repo.listPayments,
    }),
    [customers, sales, loading, error, asOfDate, refresh, getSalesForCustomer],
  )

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData AppDataProvider içinde kullanılmalıdır.')
  return ctx
}
