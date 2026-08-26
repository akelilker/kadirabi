import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppDataProvider } from './app/AppDataContext'
import { AppShell } from './components/AppShell'
import { getRouterBasename } from './config/public-base'
import { CustomerPage } from './pages/CustomerPage'
import { DashboardPage } from './pages/DashboardPage'
import { SalePage } from './pages/SalePage'

const routerBasename = getRouterBasename()

export default function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <AppDataProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/customers/:customerId" element={<CustomerPage />} />
            <Route path="/sales/:saleId" element={<SalePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </AppDataProvider>
    </BrowserRouter>
  )
}
