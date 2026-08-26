import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppData } from '../app/AppDataContext'
import { calculateReceivable } from '../domain/receivableCalculator'
import { DEFAULT_MONTHLY_COST_RATE_PCT } from '../domain/types'
import { EmptyState, Field, Money, Modal, PageHeader } from '../components/ui'
import * as repo from '../storage/repository'
import { parseMoneyInput, parseRateInput } from '../utils/format'
import { isValidIsoDate } from '../domain/dates'

export function CustomerPage() {
  const { customerId } = useParams()
  const navigate = useNavigate()
  const { asOfDate, refresh, getSalesForCustomer } = useAppData()
  const [customer, setCustomer] = useState<Awaited<ReturnType<typeof repo.getCustomer>>>()
  const [saleRows, setSaleRows] = useState<
    Array<{
      id: string
      title: string
      contractTotal: string
      openDuePrincipal: string
      accruedCarryingCost: string
      economicShortfall: string
    }>
  >([])
  const [editOpen, setEditOpen] = useState(false)
  const [saleOpen, setSaleOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')

  const [title, setTitle] = useState('')
  const [contractDate, setContractDate] = useState('')
  const [firstDueDate, setFirstDueDate] = useState('')
  const [installmentCount, setInstallmentCount] = useState('80')
  const [installmentAmount, setInstallmentAmount] = useState('10000')
  const [ratePct, setRatePct] = useState(String(DEFAULT_MONTHLY_COST_RATE_PCT))
  const [saleNote, setSaleNote] = useState('')

  useEffect(() => {
    if (!customerId) return
    let cancelled = false
    async function load() {
      const c = await repo.getCustomer(customerId!)
      if (!c) {
        navigate('/')
        return
      }
      if (cancelled) return
      setCustomer(c)
      setName(c.name)
      setPhone(c.phone ?? '')
      setNote(c.note ?? '')

      const sales = getSalesForCustomer(c.id)
      const rows = []
      for (const sale of sales) {
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
        rows.push({
          id: sale.id,
          title: sale.title || 'Satış',
          contractTotal: result.contractTotal,
          openDuePrincipal: result.openDuePrincipal,
          accruedCarryingCost: result.accruedCarryingCost,
          economicShortfall: result.economicShortfall,
        })
      }
      if (!cancelled) setSaleRows(rows)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [customerId, asOfDate, getSalesForCustomer, navigate])

  async function handleSaveCustomer(e: React.FormEvent) {
    e.preventDefault()
    if (!customer) return
    setBusy(true)
    setError(null)
    try {
      await repo.updateCustomer(customer.id, { name, phone, note })
      setEditOpen(false)
      await refresh()
      const updated = await repo.getCustomer(customer.id)
      setCustomer(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Güncelleme başarısız.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateSale(e: React.FormEvent) {
    e.preventDefault()
    if (!customer) return
    setBusy(true)
    setError(null)
    try {
      if (!isValidIsoDate(contractDate) || !isValidIsoDate(firstDueDate)) {
        throw new Error('Geçerli sözleşme ve ilk vade tarihi girin.')
      }
      const count = Number(installmentCount)
      if (!Number.isInteger(count) || count <= 0) throw new Error('Taksit sayısı geçersiz.')
      const amount = parseMoneyInput(installmentAmount)
      if (!amount || !(Number(amount) > 0)) throw new Error('Taksit tutarı geçersiz.')
      const rate = parseRateInput(ratePct)
      if (rate === null || rate < 0) throw new Error('Aylık para maliyeti geçersiz.')

      const { sale } = await repo.createSale({
        customerId: customer.id,
        title,
        contractDate,
        firstDueDate,
        installmentCount: count,
        defaultInstallmentAmount: amount,
        monthlyCostRatePct: rate,
        note: saleNote,
      })
      setSaleOpen(false)
      await refresh()
      navigate(`/sales/${sale.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Satış oluşturulamadı.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!customer) return
    setBusy(true)
    try {
      await repo.deleteCustomer(customer.id)
      await refresh()
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silme başarısız.')
      setBusy(false)
    }
  }

  if (!customer) return <p className="muted">Yükleniyor…</p>

  return (
    <div className="page">
      <PageHeader
        title={customer.name}
        subtitle={[customer.phone, customer.note].filter(Boolean).join(' · ') || 'Müşteri detayı'}
        actions={
          <>
            <Link className="btn btn-secondary" to="/">
              Geri
            </Link>
            <button type="button" className="btn btn-secondary" onClick={() => setEditOpen(true)}>
              Düzenle
            </button>
            <button type="button" className="btn btn-danger" onClick={() => setDeleteOpen(true)}>
              Sil
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setSaleOpen(true)}>
              Satış Ekle
            </button>
          </>
        }
      />

      <section className="panel">
        <h2>Satışlar</h2>
        {saleRows.length === 0 ? (
          <EmptyState
            title="Bu müşteriye ait satış yok."
            body="Yeni taksitli satış ekleyin."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setSaleOpen(true)}>
                Satış Ekle
              </button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Satış</th>
                  <th className="num">Sözleşme</th>
                  <th className="num">Açık Ana Para</th>
                  <th className="num">Para Maliyeti</th>
                  <th className="num">Ekonomik Eksik</th>
                </tr>
              </thead>
              <tbody>
                {saleRows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/sales/${r.id}`}>{r.title}</Link>
                    </td>
                    <td className="num">
                      <Money value={r.contractTotal} />
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editOpen ? (
        <Modal
          title="Müşteri Düzenle"
          onClose={() => setEditOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEditOpen(false)}>
                Vazgeç
              </button>
              <button type="submit" form="edit-customer-form" className="btn btn-primary" disabled={busy}>
                Kaydet
              </button>
            </>
          }
        >
          <form id="edit-customer-form" onSubmit={handleSaveCustomer} className="form-grid">
            <Field label="Ad Soyad" htmlFor="edit-name">
              <input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Telefon" htmlFor="edit-phone">
              <input id="edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Not" htmlFor="edit-note">
              <textarea id="edit-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            </Field>
            {error ? <p className="field-error">{error}</p> : null}
          </form>
        </Modal>
      ) : null}

      {saleOpen ? (
        <Modal
          title="Yeni Satış"
          onClose={() => setSaleOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setSaleOpen(false)}>
                Vazgeç
              </button>
              <button type="submit" form="create-sale-form" className="btn btn-primary" disabled={busy}>
                Oluştur
              </button>
            </>
          }
        >
          <form id="create-sale-form" onSubmit={handleCreateSale} className="form-grid">
            <Field label="Başlık" htmlFor="sale-title">
              <input id="sale-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mobilya Takımı" />
            </Field>
            <Field label="Sözleşme Tarihi" htmlFor="sale-contract">
              <input id="sale-contract" type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} required />
            </Field>
            <Field label="İlk Vade" htmlFor="sale-first-due">
              <input id="sale-first-due" type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} required />
            </Field>
            <Field label="Taksit Adedi" htmlFor="sale-count">
              <input id="sale-count" inputMode="numeric" value={installmentCount} onChange={(e) => setInstallmentCount(e.target.value)} required />
            </Field>
            <Field label="Aylık Taksit Tutarı" htmlFor="sale-amount">
              <input id="sale-amount" value={installmentAmount} onChange={(e) => setInstallmentAmount(e.target.value)} required />
            </Field>
            <Field label="Aylık Para Maliyeti (%)" htmlFor="sale-rate">
              <input id="sale-rate" value={ratePct} onChange={(e) => setRatePct(e.target.value)} required />
            </Field>
            <Field label="Not" htmlFor="sale-note">
              <textarea id="sale-note" value={saleNote} onChange={(e) => setSaleNote(e.target.value)} rows={2} />
            </Field>
            {error ? <p className="field-error">{error}</p> : null}
          </form>
        </Modal>
      ) : null}

      {deleteOpen ? (
        <Modal
          title="Müşteriyi Sil"
          onClose={() => setDeleteOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>
                Vazgeç
              </button>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void handleDelete()}>
                Sil
              </button>
            </>
          }
        >
          <p>
            <strong>{customer.name}</strong> ve altındaki tüm satışlar, taksitler ve ödemeler kalıcı olarak silinecek.
          </p>
        </Modal>
      ) : null}
    </div>
  )
}
