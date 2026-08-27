import type { ReactNode } from 'react'

export function Money({ value, emphasize = false }: { value: string; emphasize?: boolean }) {
  const n = Number(value)
  const cls = [
    'money',
    emphasize ? 'money-emphasize' : '',
    Number.isFinite(n) && n > 0 ? 'money-positive' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const formatted = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0)

  return <span className={cls}>{formatted} TL</span>
}

export function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'default' | 'danger' | 'muted'
}) {
  return (
    <div className={`kpi-card kpi-${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint ? <div className="kpi-hint">{hint}</div> : null}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title?: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <header className="page-header">
      {title || subtitle ? (
        <div>
          {title ? <h1>{title}</h1> : null}
          {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        </div>
      ) : null}
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  )
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty-state" role="status">
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  )
}

export function Modal({
  title,
  children,
  onClose,
  footer,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  footer?: ReactNode
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  )
}

export function Field({
  label,
  htmlFor,
  children,
  error,
}: {
  label: string
  htmlFor: string
  children: ReactNode
  error?: string
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  )
}
