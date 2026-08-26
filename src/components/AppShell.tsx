import { Link, NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAppData } from '../app/AppDataContext'
import { getAppPublicPath } from '../config/public-base'
import { todayIstanbul } from '../domain/dates'

const brandLogoSrc = `${getAppPublicPath()}/icons/pwa-192.png`

export function AppShell({ children }: { children: ReactNode }) {
  const { asOfDate, setAsOfDate, resetAsOfToToday } = useAppData()
  const isAsOfToday = asOfDate === todayIstanbul()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <img
            className="brand-mark"
            src={brandLogoSrc}
            alt=""
            width={40}
            height={40}
            decoding="async"
          />
          <span className="brand-text">
            Taksit Alacak
            <small>Para Maliyeti Hesaplayıcı</small>
          </span>
        </Link>
        <nav className="side-nav" aria-label="Ana menü">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
        </nav>
        <div className="asof-box">
          <label htmlFor="global-asof">Hesaplama Tarihi</label>
          <input
            id="global-asof"
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={resetAsOfToToday}
            disabled={isAsOfToday}
          >
            Bugüne Getir
          </button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}
