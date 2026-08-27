import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppData } from '../app/AppDataContext'
import { calculateReceivable } from '../domain/receivableCalculator'
import type { CalculationResult, Customer, Installment, Payment, Sale } from '../domain/types'
import { INSTALLMENT_STATUS_LABELS } from '../domain/types'
import { Field, KpiCard, Modal, Money, PageHeader } from '../components/ui'
import * as repo from '../storage/repository'
import { exportInstallmentPlanXlsx, exportPaymentsXlsx } from '../utils/export'
import { formatDateTR, parseMoneyInput, parseRateInput } from '../utils/format'
import { isValidIsoDate } from '../domain/dates'

export function SalePage() {
  const { saleId } = useParams()
  const navigate = useNavigate()
  const { asOfDate, setAsOfDate, resetAsOfToToday, refresh } = useAppData()

  const [sale, setSale] = useState<Sale | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [installments, setInstallments] = useState<Installment[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [result, setResult] = useState<CalculationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [editPay, setEditPay] = useState<Payment | null>(null)
  const [editInst, setEditInst] = useState<Installment | null>(null)
  const [deleteSaleOpen, setDeleteSaleOpen] = useState(false)
  const [rateDraft, setRateDraft] = useState('')

  const [payDate, setPayDate] = useState(asOfDate)
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payFieldError, setPayFieldError] = useState<string | null>(null)
  const [detailPaymentId, setDetailPaymentId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailNote, setDetailNote] = useState('')

  const [instDate, setInstDate] = useState('')
  const [instAmount, setInstAmount] = useState('')

  const reload = useCallback(async () => {
    if (!saleId) return
    const s = await repo.getSale(saleId)
    if (!s) {
      navigate('/')
      return
    }
    const c = await repo.getCustomer(s.customerId)
    const [inst, pays] = await Promise.all([repo.listInstallments(s.id), repo.listPayments(s.id)])
    const calc = calculateReceivable({
      installments: inst,
      payments: pays,
      monthlyCostRatePct: s.monthlyCostRatePct,
      asOfDate,
    })
    setSale(s)
    setCustomer(c ?? null)
    setInstallments(inst)
    setPayments(pays)
    setResult(calc)
    setRateDraft(String(s.monthlyCostRatePct))
  }, [saleId, asOfDate, navigate])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!editPay && !payAmount.trim()) {
      setPayDate(asOfDate)
    }
  }, [asOfDate, editPay, payAmount])

  const allocationText = useMemo(() => {
    const map = new Map<string, string[]>()
    if (!result) return map
    for (const a of result.allocations) {
      const list = map.get(a.paymentId) ?? []
      list.push(`${a.installmentSequence}. taksit: ${formatMoneyPlain(a.amount)}`)
      map.set(a.paymentId, list)
    }
    return map
  }, [result])

  async function saveRate() {
    if (!sale) return
    const rate = parseRateInput(rateDraft)
    if (rate === null || rate < 0) {
      setError('Aylık para maliyeti geçersiz.')
      return
    }
    setBusy(true)
    try {
      await repo.updateSale(sale.id, { monthlyCostRatePct: rate })
      await refresh()
      await reload()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oran güncellenemedi.')
    } finally {
      setBusy(false)
    }
  }

  function focusPaymentAmount() {
    setPayDate((prev) => prev || asOfDate)
    const el = document.getElementById('pay-amount')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.focus()
  }

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!sale || busy) return
    setBusy(true)
    setError(null)
    setPayFieldError(null)
    try {
      if (!isValidIsoDate(payDate)) throw new Error('Geçerli ödeme tarihi girin.')
      const amount = parseMoneyInput(payAmount)
      if (!amount || !(Number(amount) > 0)) throw new Error('Ödeme tutarı geçersiz.')
      const created = await repo.createPayment({
        saleId: sale.id,
        paymentDate: payDate,
        amount,
      })
      setPayAmount('')
      setPayDate(asOfDate)
      setDetailPaymentId(created.id)
      setDetailOpen(false)
      setDetailNote('')
      await refresh()
      await reload()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ödeme eklenemedi.'
      setPayFieldError(message)
    } finally {
      setBusy(false)
    }
  }

  async function handleSavePaymentDetail(e: React.FormEvent) {
    e.preventDefault()
    if (!detailPaymentId || busy) return
    setBusy(true)
    setError(null)
    try {
      await repo.updatePayment(detailPaymentId, { note: detailNote })
      setDetailPaymentId(null)
      setDetailOpen(false)
      setDetailNote('')
      await refresh()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Açıklama kaydedilemedi.')
    } finally {
      setBusy(false)
    }
  }

  function dismissPaymentDetail() {
    setDetailPaymentId(null)
    setDetailOpen(false)
    setDetailNote('')
  }

  async function handleEditPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!editPay) return
    setBusy(true)
    setError(null)
    try {
      if (!isValidIsoDate(payDate)) throw new Error('Geçerli ödeme tarihi girin.')
      const amount = parseMoneyInput(payAmount)
      if (!amount || !(Number(amount) > 0)) throw new Error('Ödeme tutarı geçersiz.')
      await repo.updatePayment(editPay.id, {
        paymentDate: payDate,
        amount,
        note: payNote,
      })
      setEditPay(null)
      setPayDate(asOfDate)
      setPayAmount('')
      setPayNote('')
      await refresh()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ödeme güncellenemedi.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeletePayment(id: string) {
    if (!window.confirm('Bu ödeme kaydı silinsin mi? Hesap baştan yeniden yapılacak.')) return
    setBusy(true)
    try {
      await repo.deletePayment(id)
      await refresh()
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function handleEditInstallment(e: React.FormEvent) {
    e.preventDefault()
    if (!editInst) return
    setBusy(true)
    setError(null)
    try {
      if (!isValidIsoDate(instDate)) throw new Error('Geçerli vade tarihi girin.')
      const amount = parseMoneyInput(instAmount)
      if (!amount || !(Number(amount) > 0)) throw new Error('Taksit tutarı geçersiz.')
      await repo.updateInstallment(editInst.id, { dueDate: instDate, amount })
      setEditInst(null)
      await refresh()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Taksit güncellenemedi.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteSale() {
    if (!sale) return
    setBusy(true)
    try {
      await repo.deleteSale(sale.id)
      await refresh()
      navigate(customer ? `/customers/${customer.id}` : '/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Satış silinemedi.')
      setBusy(false)
    }
  }

  if (!sale || !result || !customer) {
    return <p className="muted">Yükleniyor…</p>
  }

  return (
    <div className="page">
      <PageHeader
        title={sale.title || 'Satış Detayı'}
        subtitle={`${customer.name} · ${sale.installmentCount} taksit · Aylık para maliyeti %${sale.monthlyCostRatePct}`}
        actions={
          <>
            <Link className="btn btn-secondary" to={`/customers/${customer.id}`}>
              Müşteriye Dön
            </Link>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => exportInstallmentPlanXlsx(sale, customer, result)}
            >
              Taksit Excel
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => exportPaymentsXlsx(sale, customer, payments, result)}
            >
              Ödeme Excel
            </button>
            <button type="button" className="btn btn-danger" onClick={() => setDeleteSaleOpen(true)}>
              Satışı Sil
            </button>
            <button type="button" className="btn btn-primary" onClick={focusPaymentAmount}>
              Ödeme Ekle
            </button>
          </>
        }
      />

      {error ? <div className="banner banner-error">{error}</div> : null}

      <section className="panel inline-controls">
        <Field label="Hesaplama Tarihi" htmlFor="sale-asof">
          <div className="row-controls">
            <input
              id="sale-asof"
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
            />
            <button type="button" className="btn btn-secondary" onClick={resetAsOfToToday}>
              Bugüne Getir
            </button>
          </div>
        </Field>
        <Field label="Aylık Para Maliyeti (%)" htmlFor="sale-rate">
          <div className="row-controls">
            <input id="sale-rate" value={rateDraft} onChange={(e) => setRateDraft(e.target.value)} />
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void saveRate()}>
              Oranı Uygula
            </button>
          </div>
        </Field>
      </section>

      <section className="kpi-grid" aria-label="Satış özeti">
        <KpiCard label="Sözleşme Toplamı" value={<Money value={result.contractTotal} />} />
        <KpiCard label="Taksit Adedi" value={sale.installmentCount} />
        <KpiCard label="Aylık Taksit" value={<Money value={sale.defaultInstallmentAmount} />} />
        <KpiCard label="İlk Vade" value={formatDateTR(sale.firstDueDate)} />
        <KpiCard label="Vadesi Gelen" value={<Money value={result.duePrincipal} />} />
        <KpiCard label="Ödenen" value={<Money value={result.receivedCash} />} />
        <KpiCard label="Açık Ana Para" value={<Money value={result.openDuePrincipal} />} />
        <KpiCard label="Para Maliyeti" value={<Money value={result.accruedCarryingCost} />} />
        <KpiCard label="Advance Credit" value={<Money value={result.advanceCredit} />} />
        <KpiCard label="Henüz Vadesi Gelmemiş" value={<Money value={result.futurePrincipal} />} />
        <KpiCard
          label="Bugün İtibarıyla Ekonomik Eksik"
          value={<Money value={result.economicShortfall} emphasize />}
          tone="danger"
        />
      </section>

      <section className="panel">
        <h2>Hesap Detayı</h2>
        {result.costSegments.length === 0 ? (
          <p className="muted">Bu hesap tarihinde oluşmuş para maliyeti segmenti yok.</p>
        ) : (
          <div className="audit-list">
            {result.costSegments.map((seg, idx) => (
              <div key={`${seg.startDate}-${seg.endDate}-${idx}`} className="audit-item">
                <div>
                  {formatDateTR(seg.startDate)} → {formatDateTR(seg.endDate)}
                </div>
                <div>{seg.days} gün</div>
                <div>
                  Açık bakiye: <Money value={seg.principal} />
                </div>
                <div>
                  Maliyet: <Money value={seg.cost} />
                </div>
              </div>
            ))}
            <div className="audit-total">
              Toplam para maliyeti: <Money value={result.accruedCarryingCost} emphasize />
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Taksit Tablosu</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Vade</th>
                <th className="num">Taksit</th>
                <th className="num">Mahsup Edilen</th>
                <th className="num">Açık</th>
                <th>Ödeme Durumu</th>
                <th>Son Ödeme</th>
                <th className="num">Gecikme</th>
                <th className="num">Maliyet</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {result.installmentResults.map((r) => (
                <tr key={r.installmentId}>
                  <td>{r.sequence}</td>
                  <td>{formatDateTR(r.dueDate)}</td>
                  <td className="num">
                    <Money value={r.amount} />
                  </td>
                  <td className="num">
                    <Money value={r.allocated} />
                  </td>
                  <td className="num">
                    <Money value={r.open} />
                  </td>
                  <td>
                    <span className={`status status-${r.status}`}>
                      {INSTALLMENT_STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td>{r.lastPaymentDate ? formatDateTR(r.lastPaymentDate) : '—'}</td>
                  <td className="num">{r.delayDays}</td>
                  <td className="num">
                    <Money value={r.cost} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        const inst = installments.find((i) => i.id === r.installmentId)
                        if (!inst) return
                        setEditInst(inst)
                        setInstDate(inst.dueDate)
                        setInstAmount(inst.amount)
                      }}
                    >
                      Düzenle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" id="payment-add">
        <div className="panel-toolbar">
          <h2>Ödeme Hareketleri</h2>
        </div>

        <form id="add-payment-form" className="payment-add-form" onSubmit={handleAddPayment} noValidate>
          <Field label="Tutar" htmlFor="pay-amount" error={payFieldError ?? undefined}>
            <input
              id="pay-amount"
              value={payAmount}
              onChange={(e) => {
                setPayAmount(e.target.value)
                if (payFieldError) setPayFieldError(null)
              }}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={payFieldError ? true : undefined}
              aria-describedby={payFieldError ? 'pay-amount-error' : undefined}
              required
            />
          </Field>
          <Field label="Tarih" htmlFor="pay-date">
            <input
              id="pay-date"
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              required
            />
          </Field>
          <button type="submit" className="btn btn-primary payment-add-submit" disabled={busy}>
            + Ekle
          </button>
        </form>

        {detailPaymentId ? (
          <div className="payment-detail-prompt" role="region" aria-label="Ödeme detayı">
            {!detailOpen ? (
              <div className="payment-detail-prompt-row">
                <p>Detay eklemek ister misiniz?</p>
                <div className="payment-detail-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setDetailOpen(true)}>
                    Evet
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={dismissPaymentDetail}>
                    Hayır
                  </button>
                </div>
              </div>
            ) : (
              <form className="payment-detail-form" onSubmit={handleSavePaymentDetail}>
                <Field label="Açıklama" htmlFor="pay-detail-note">
                  <input
                    id="pay-detail-note"
                    value={detailNote}
                    onChange={(e) => setDetailNote(e.target.value)}
                    autoFocus
                  />
                </Field>
                <div className="payment-detail-actions">
                  <button type="button" className="btn btn-secondary" onClick={dismissPaymentDetail}>
                    Atla
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    Detayı Kaydet
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : null}

        {payments.length === 0 ? (
          <p className="muted">Henüz ödeme yok.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th className="num">Tutar</th>
                  <th>Açıklama</th>
                  <th>Mahsup</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDateTR(p.paymentDate)}</td>
                    <td className="num">
                      <Money value={p.amount} />
                    </td>
                    <td className="muted">{p.note || '—'}</td>
                    <td className="muted">{(allocationText.get(p.id) ?? []).join(' · ') || '—'}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          setEditPay(p)
                          setPayDate(p.paymentDate)
                          setPayAmount(p.amount)
                          setPayNote(p.note ?? '')
                        }}
                      >
                        Düzenle
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => void handleDeletePayment(p.id)}
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editPay ? (
        <Modal
          title="Ödeme Düzenle"
          onClose={() => {
            setEditPay(null)
            setPayDate(asOfDate)
            setPayAmount('')
            setPayNote('')
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setEditPay(null)
                  setPayDate(asOfDate)
                  setPayAmount('')
                  setPayNote('')
                }}
              >
                Vazgeç
              </button>
              <button type="submit" form="edit-payment-form" className="btn btn-primary" disabled={busy}>
                Kaydet
              </button>
            </>
          }
        >
          <form id="edit-payment-form" onSubmit={handleEditPayment} className="form-grid">
            <Field label="Tarih" htmlFor="edit-pay-date">
              <input id="edit-pay-date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
            </Field>
            <Field label="Tutar" htmlFor="edit-pay-amount">
              <input id="edit-pay-amount" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required />
            </Field>
            <Field label="Açıklama" htmlFor="edit-pay-note">
              <input id="edit-pay-note" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
            </Field>
          </form>
        </Modal>
      ) : null}

      {editInst ? (
        <Modal
          title={`Taksit #${editInst.sequence} Düzenle`}
          onClose={() => setEditInst(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEditInst(null)}>
                Vazgeç
              </button>
              <button type="submit" form="edit-inst-form" className="btn btn-primary" disabled={busy}>
                Kaydet
              </button>
            </>
          }
        >
          <form id="edit-inst-form" onSubmit={handleEditInstallment} className="form-grid">
            <Field label="Vade" htmlFor="inst-date">
              <input id="inst-date" type="date" value={instDate} onChange={(e) => setInstDate(e.target.value)} required />
            </Field>
            <Field label="Tutar" htmlFor="inst-amount">
              <input id="inst-amount" value={instAmount} onChange={(e) => setInstAmount(e.target.value)} required />
            </Field>
          </form>
        </Modal>
      ) : null}

      {deleteSaleOpen ? (
        <Modal
          title="Satışı Sil"
          onClose={() => setDeleteSaleOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteSaleOpen(false)}>
                Vazgeç
              </button>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void handleDeleteSale()}>
                Sil
              </button>
            </>
          }
        >
          <p>Bu satışa ait tüm taksitler ve ödemeler kalıcı olarak silinecek.</p>
        </Modal>
      ) : null}
    </div>
  )
}

function formatMoneyPlain(value: string): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value))
}
