import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../app/AppDataContext'
import { calculateReceivable } from '../domain/receivableCalculator'
import { d, moneyZero } from '../domain/money'
import { EmptyState, Field, KpiCard, Modal, Money, PageHeader } from '../components/ui'
import * as repo from '../storage/repository'
import { downloadJsonBackup, exportCustomerSummaryXlsx, type CustomerSummaryRow } from '../utils/export'
import { todayIstanbul } from '../domain/dates'

type SortKey = 'name' | 'shortfall' | 'principal' | 'delay' | 'updated'

export function DashboardPage() {
  const { customers, sales, loading, error, asOfDate, setAsOfDate, resetAsOfToToday, refresh } = useAppData()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('shortfall')
  const [rows, setRows] = useState<
    Array<{
      customerId: string
      customerName: string
      saleId: string
      saleTitle: string
      updatedAt: string
      openDuePrincipal: string
      accruedCarryingCost: string
      economicShortfall: string
      maxDelay: number
      contractTotal: string
      duePrincipal: string
      receivedCash: string
    }>
  >([])
  const [totals, setTotals] = useState({
    duePrincipal: '0.00',
    receivedCash: '0.00',
    openDuePrincipal: '0.00',
    accruedCarryingCost: '0.00',
    economicShortfall: '0.00',
    advanceCredit: '0.00',
  })
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importConfirm, setImportConfirm] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      let duePrincipal = moneyZero()
      let receivedCash = moneyZero()
      let openDuePrincipal = moneyZero()
      let accruedCarryingCost = moneyZero()
      let economicShortfall = moneyZero()
      let advanceCredit = moneyZero()
      const nextRows: typeof rows = []

      for (const sale of sales) {
        const customer = customers.find((c) => c.id === sale.customerId)
        if (!customer) continue
        const [installments, payments] = await Promise.all([
          repo.listInstallments(sale.id),
          repo.listPayments(sale.id),
        ])
        const result = calculateReceivable({
          installments,
          payments,
          monthlyCostRatePct: sale.monthlyCostRatePct,
          asOfDate,
        })
        duePrincipal = duePrincipal.plus(d(result.duePrincipal))
        receivedCash = receivedCash.plus(d(result.receivedCash))
        openDuePrincipal = openDuePrincipal.plus(d(result.openDuePrincipal))
        accruedCarryingCost = accruedCarryingCost.plus(d(result.accruedCarryingCost))
        economicShortfall = economicShortfall.plus(d(result.economicShortfall))
        advanceCredit = advanceCredit.plus(d(result.advanceCredit))

        const maxDelay = result.installmentResults.reduce(
          (max, r) => (r.open !== '0.00' && r.delayDays > max ? r.delayDays : max),
          0,
        )

        nextRows.push({
          customerId: customer.id,
          customerName: customer.name,
          saleId: sale.id,
          saleTitle: sale.title || 'Satış',
          updatedAt: sale.updatedAt,
          openDuePrincipal: result.openDuePrincipal,
          accruedCarryingCost: result.accruedCarryingCost,
          economicShortfall: result.economicShortfall,
          maxDelay,
          contractTotal: result.contractTotal,
          duePrincipal: result.duePrincipal,
          receivedCash: result.receivedCash,
        })
      }

      if (!cancelled) {
        setRows(nextRows)
        setTotals({
          duePrincipal: duePrincipal.toFixed(2),
          receivedCash: receivedCash.toFixed(2),
          openDuePrincipal: openDuePrincipal.toFixed(2),
          accruedCarryingCost: accruedCarryingCost.toFixed(2),
          economicShortfall: economicShortfall.toFixed(2),
          advanceCredit: advanceCredit.toFixed(2),
        })
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [sales, customers, asOfDate])

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr')
    let list = rows
    if (q) {
      list = list.filter(
        (r) =>
          r.customerName.toLocaleLowerCase('tr').includes(q) ||
          r.saleTitle.toLocaleLowerCase('tr').includes(q),
      )
    }
    const sorted = [...list]
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.customerName.localeCompare(b.customerName, 'tr')
        case 'principal':
          return Number(b.openDuePrincipal) - Number(a.openDuePrincipal)
        case 'delay':
          return b.maxDelay - a.maxDelay
        case 'updated':
          return b.updatedAt.localeCompare(a.updatedAt)
        case 'shortfall':
        default:
          return Number(b.economicShortfall) - Number(a.economicShortfall)
      }
    })
    return sorted
  }, [rows, query, sortKey])

  const customersWithoutSales = useMemo(() => {
    const withSales = new Set(sales.map((s) => s.customerId))
    const q = query.trim().toLocaleLowerCase('tr')
    return customers
      .filter((c) => !withSales.has(c.id))
      .filter((c) => !q || c.name.toLocaleLowerCase('tr').includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  }, [customers, sales, query])

  const hasListContent = filtered.length > 0 || customersWithoutSales.length > 0

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setBusy(true)
    try {
      await repo.createCustomer({ name, phone, note })
      setShowCustomerModal(false)
      setName('')
      setPhone('')
      setNote('')
      await refresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Kayıt başarısız.')
    } finally {
      setBusy(false)
    }
  }

  async function handleBackup() {
    const payload = await repo.exportBackup()
    downloadJsonBackup(payload, `taksit-alacak-backup-${todayIstanbul()}.json`)
  }

  async function handleImport() {
    if (!importFile || !importConfirm) return
    setBusy(true)
    setFormError(null)
    try {
      const text = await importFile.text()
      const json: unknown = JSON.parse(text)
      await repo.importBackupReplace(json)
      setShowImportModal(false)
      setImportFile(null)
      setImportConfirm(false)
      await refresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'İçe aktarma başarısız.')
    } finally {
      setBusy(false)
    }
  }

  function handleExportSummary() {
    const summary: CustomerSummaryRow[] = rows.map((r) => ({
      customerName: r.customerName,
      saleTitle: r.saleTitle,
      contractTotal: r.contractTotal,
      duePrincipal: r.duePrincipal,
      receivedCash: r.receivedCash,
      openDuePrincipal: r.openDuePrincipal,
      accruedCarryingCost: r.accruedCarryingCost,
      economicShortfall: r.economicShortfall,
    }))
    exportCustomerSummaryXlsx(summary, asOfDate)
  }

  if (loading) {
    return <p className="muted">Yükleniyor…</p>
  }

  const isAsOfToday = asOfDate === todayIstanbul()

  return (
    <div className="page">
      <PageHeader
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => void handleBackup()}>
              Yedek Al
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowImportModal(true)}>
              Geri Yükle
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleExportSummary} disabled={rows.length === 0}>
              Excel Özet
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setShowCustomerModal(true)}>
              Müşteri Ekle
            </button>
          </>
        }
      />

      <div className="page-asof">
        <label htmlFor="dashboard-asof">Hesap tarihi</label>
        <div className="page-asof-controls">
          <input
            id="dashboard-asof"
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={resetAsOfToToday}
            disabled={isAsOfToday}
          >
            Bugüne Getir
          </button>
        </div>
      </div>

      {error ? <div className="banner banner-error">{error}</div> : null}

      <section className="kpi-grid" aria-label="Özet göstergeler">
        <KpiCard label="Toplam Müşteri" value={customers.length} />
        <KpiCard label="Aktif Satış" value={sales.length} />
        <KpiCard label="Vadesi Gelen Ana Para" value={<Money value={totals.duePrincipal} />} />
        <KpiCard label="Tahsil Edilen" value={<Money value={totals.receivedCash} />} />
        <KpiCard label="Açık Ana Para" value={<Money value={totals.openDuePrincipal} />} tone="muted" />
        <KpiCard label="Para Maliyeti" value={<Money value={totals.accruedCarryingCost} />} tone="muted" />
        <KpiCard
          label="Bugün İtibarıyla Ekonomik Eksik"
          value={<Money value={totals.economicShortfall} emphasize />}
          tone="danger"
          hint="Açık ana para + oluşmuş para maliyeti"
        />
        <KpiCard label="Advance Credit" value={<Money value={totals.advanceCredit} />} />
      </section>

      <section className="panel">
        <div className="panel-toolbar">
          <input
            type="search"
            placeholder="Müşteri veya satış ara…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Müşteri ara"
          />
          <label className="inline-label">
            Sırala
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="shortfall">Ekonomik eksik</option>
              <option value="principal">Açık ana para</option>
              <option value="delay">En uzun gecikme</option>
              <option value="name">İsim</option>
              <option value="updated">Son işlem</option>
            </select>
          </label>
        </div>

        {customers.length === 0 ? (
          <EmptyState
            title="Henüz müşteri yok."
            body="İlk müşteriyi ekleyin."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setShowCustomerModal(true)}>
                Müşteri Ekle
              </button>
            }
          />
        ) : !hasListContent ? (
          <EmptyState title="Sonuç bulunamadı." body="Arama ölçütlerinizi değiştirin." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Müşteri</th>
                  <th>Satış</th>
                  <th className="num">Açık Ana Para</th>
                  <th className="num">Para Maliyeti</th>
                  <th className="num">Ekonomik Eksik</th>
                  <th className="num">Gecikme</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.saleId}>
                    <td>
                      <Link to={`/customers/${r.customerId}`}>{r.customerName}</Link>
                    </td>
                    <td>
                      <Link to={`/sales/${r.saleId}`}>{r.saleTitle}</Link>
                    </td>
                    <td className="num">
                      <Money value={r.openDuePrincipal} />
                    </td>
                    <td className="num">
                      <Money value={r.accruedCarryingCost} />
                    </td>
                    <td className="num">
                      <Money value={r.economicShortfall} emphasize />
                    </td>
                    <td className="num">{r.maxDelay} g</td>
                  </tr>
                ))}
                {customersWithoutSales.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/customers/${c.id}`}>{c.name}</Link>
                    </td>
                    <td className="muted">Satış yok</td>
                    <td className="num">
                      <Money value="0.00" />
                    </td>
                    <td className="num">
                      <Money value="0.00" />
                    </td>
                    <td className="num">
                      <Money value="0.00" />
                    </td>
                    <td className="num">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showCustomerModal ? (
        <Modal
          title="Yeni Müşteri"
          onClose={() => setShowCustomerModal(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCustomerModal(false)}>
                Vazgeç
              </button>
              <button type="submit" form="create-customer-form" className="btn btn-primary" disabled={busy}>
                Kaydet
              </button>
            </>
          }
        >
          <form id="create-customer-form" onSubmit={handleCreateCustomer} className="form-grid">
            <Field label="Ad Soyad" htmlFor="cus-name" error={formError ?? undefined}>
              <input id="cus-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </Field>
            <Field label="Telefon" htmlFor="cus-phone">
              <input id="cus-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Not" htmlFor="cus-note">
              <textarea id="cus-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            </Field>
          </form>
        </Modal>
      ) : null}

      {showImportModal ? (
        <Modal
          title="Yedekten Geri Yükle"
          onClose={() => {
            setShowImportModal(false)
            setImportConfirm(false)
            setImportFile(null)
            setFormError(null)
          }}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setShowImportModal(false)}>
                Vazgeç
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={!importFile || !importConfirm || busy}
                onClick={() => void handleImport()}
              >
                Mevcut Veriyi Değiştir
              </button>
            </>
          }
        >
          <div className="form-grid">
            <p className="warn-text">
              Bu işlem mevcut tüm müşteri, satış, taksit ve ödeme kayıtlarını siler ve yedekteki veriyle değiştirir.
            </p>
            <Field label="Yedek JSON dosyası" htmlFor="import-file">
              <input
                id="import-file"
                type="file"
                accept="application/json,.json"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
            </Field>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={importConfirm}
                onChange={(e) => setImportConfirm(e.target.checked)}
              />
              Mevcut veriyi değiştirmek istediğimi onaylıyorum.
            </label>
            {formError ? <p className="field-error">{formError}</p> : null}
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
