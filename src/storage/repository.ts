import { buildInstallmentSchedule } from '../domain/schedule'
import { DEFAULT_MONTHLY_COST_RATE_PCT, SCHEMA_VERSION } from '../domain/types'
import type { Customer, Installment, Payment, Sale } from '../domain/types'
import { createId, nowIso } from '../utils/id'
import { getDb, type AppBackupPayload } from './db'

export async function listCustomers(): Promise<Customer[]> {
  const db = await getDb()
  const all = await db.getAll('customers')
  return all.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
}

export async function getCustomer(id: string): Promise<Customer | undefined> {
  const db = await getDb()
  return db.get('customers', id)
}

export async function createCustomer(input: {
  name: string
  phone?: string
  note?: string
}): Promise<Customer> {
  const name = input.name.trim()
  if (!name) throw new Error('Müşteri adı zorunludur.')
  const ts = nowIso()
  const customer: Customer = {
    id: createId('cus'),
    name,
    phone: input.phone?.trim() || undefined,
    note: input.note?.trim() || undefined,
    createdAt: ts,
    updatedAt: ts,
  }
  const db = await getDb()
  await db.put('customers', customer)
  return customer
}

export async function updateCustomer(
  id: string,
  patch: Partial<Pick<Customer, 'name' | 'phone' | 'note'>>,
): Promise<Customer> {
  const db = await getDb()
  const existing = await db.get('customers', id)
  if (!existing) throw new Error('Müşteri bulunamadı.')
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new Error('Müşteri adı zorunludur.')
  }
  const updated: Customer = {
    ...existing,
    name: patch.name !== undefined ? patch.name.trim() : existing.name,
    phone: patch.phone !== undefined ? patch.phone.trim() || undefined : existing.phone,
    note: patch.note !== undefined ? patch.note.trim() || undefined : existing.note,
    updatedAt: nowIso(),
  }
  await db.put('customers', updated)
  return updated
}

export async function deleteCustomer(id: string): Promise<void> {
  const db = await getDb()
  const sales = await db.getAllFromIndex('sales', 'by-customer', id)
  const tx = db.transaction(['customers', 'sales', 'installments', 'payments'], 'readwrite')
  for (const sale of sales) {
    const installments = await tx.objectStore('installments').index('by-sale').getAll(sale.id)
    const payments = await tx.objectStore('payments').index('by-sale').getAll(sale.id)
    for (const inst of installments) await tx.objectStore('installments').delete(inst.id)
    for (const pay of payments) await tx.objectStore('payments').delete(pay.id)
    await tx.objectStore('sales').delete(sale.id)
  }
  await tx.objectStore('customers').delete(id)
  await tx.done
}

export async function listSalesByCustomer(customerId: string): Promise<Sale[]> {
  const db = await getDb()
  const sales = await db.getAllFromIndex('sales', 'by-customer', customerId)
  return sales.sort((a, b) => b.contractDate.localeCompare(a.contractDate))
}

export async function listAllSales(): Promise<Sale[]> {
  const db = await getDb()
  return db.getAll('sales')
}

export async function getSale(id: string): Promise<Sale | undefined> {
  const db = await getDb()
  return db.get('sales', id)
}

export async function createSale(input: {
  customerId: string
  title?: string
  contractDate: string
  firstDueDate: string
  installmentCount: number
  defaultInstallmentAmount: string
  monthlyCostRatePct?: number
  note?: string
}): Promise<{ sale: Sale; installments: Installment[] }> {
  if (input.installmentCount <= 0) throw new Error('Taksit sayısı 0\'dan büyük olmalıdır.')
  const amountNum = Number(input.defaultInstallmentAmount)
  if (!(amountNum > 0)) throw new Error('Taksit tutarı 0\'dan büyük olmalıdır.')
  const rate = input.monthlyCostRatePct ?? DEFAULT_MONTHLY_COST_RATE_PCT
  if (rate < 0) throw new Error('Aylık para maliyeti negatif olamaz.')

  const db = await getDb()
  const customer = await db.get('customers', input.customerId)
  if (!customer) throw new Error('Müşteri bulunamadı.')

  const ts = nowIso()
  const saleId = createId('sale')
  const sale: Sale = {
    id: saleId,
    customerId: input.customerId,
    title: input.title?.trim() || undefined,
    contractDate: input.contractDate,
    firstDueDate: input.firstDueDate,
    installmentCount: input.installmentCount,
    defaultInstallmentAmount: Number(input.defaultInstallmentAmount).toFixed(2),
    monthlyCostRatePct: rate,
    note: input.note?.trim() || undefined,
    createdAt: ts,
    updatedAt: ts,
  }

  const installments = buildInstallmentSchedule({
    saleId,
    firstDueDate: input.firstDueDate,
    installmentCount: input.installmentCount,
    defaultInstallmentAmount: sale.defaultInstallmentAmount,
    nowIso: ts,
    idFactory: (seq) => createId(`inst${seq}`),
  })

  const tx = db.transaction(['sales', 'installments'], 'readwrite')
  await tx.objectStore('sales').put(sale)
  for (const inst of installments) {
    await tx.objectStore('installments').put(inst)
  }
  await tx.done
  return { sale, installments }
}

export async function updateSale(
  id: string,
  patch: Partial<
    Pick<Sale, 'title' | 'note' | 'monthlyCostRatePct' | 'contractDate' | 'firstDueDate'>
  >,
): Promise<Sale> {
  const db = await getDb()
  const existing = await db.get('sales', id)
  if (!existing) throw new Error('Satış bulunamadı.')
  if (patch.monthlyCostRatePct !== undefined && patch.monthlyCostRatePct < 0) {
    throw new Error('Aylık para maliyeti negatif olamaz.')
  }
  const updated: Sale = {
    ...existing,
    ...patch,
    title: patch.title !== undefined ? patch.title.trim() || undefined : existing.title,
    note: patch.note !== undefined ? patch.note.trim() || undefined : existing.note,
    updatedAt: nowIso(),
  }
  await db.put('sales', updated)
  return updated
}

export async function deleteSale(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['sales', 'installments', 'payments'], 'readwrite')
  const installments = await tx.objectStore('installments').index('by-sale').getAll(id)
  const payments = await tx.objectStore('payments').index('by-sale').getAll(id)
  for (const inst of installments) await tx.objectStore('installments').delete(inst.id)
  for (const pay of payments) await tx.objectStore('payments').delete(pay.id)
  await tx.objectStore('sales').delete(id)
  await tx.done
}

export async function listInstallments(saleId: string): Promise<Installment[]> {
  const db = await getDb()
  const rows = await db.getAllFromIndex('installments', 'by-sale', saleId)
  return rows.sort((a, b) => a.sequence - b.sequence)
}

export async function updateInstallment(
  id: string,
  patch: Partial<Pick<Installment, 'dueDate' | 'amount'>>,
): Promise<Installment> {
  const db = await getDb()
  const existing = await db.get('installments', id)
  if (!existing) throw new Error('Taksit bulunamadı.')
  if (patch.amount !== undefined && !(Number(patch.amount) > 0)) {
    throw new Error('Taksit tutarı 0\'dan büyük olmalıdır.')
  }
  const updated: Installment = {
    ...existing,
    dueDate: patch.dueDate ?? existing.dueDate,
    amount: patch.amount !== undefined ? Number(patch.amount).toFixed(2) : existing.amount,
    updatedAt: nowIso(),
  }
  await db.put('installments', updated)

  const sale = await db.get('sales', existing.saleId)
  if (sale) {
    await db.put('sales', { ...sale, updatedAt: nowIso() })
  }
  return updated
}

export async function listPayments(saleId: string): Promise<Payment[]> {
  const db = await getDb()
  const rows = await db.getAllFromIndex('payments', 'by-sale', saleId)
  return rows.sort((a, b) => {
    const c = a.paymentDate.localeCompare(b.paymentDate)
    if (c !== 0) return c
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export async function createPayment(input: {
  saleId: string
  paymentDate: string
  amount: string
  note?: string
}): Promise<Payment> {
  if (!(Number(input.amount) > 0)) throw new Error('Ödeme tutarı 0\'dan büyük olmalıdır.')
  const db = await getDb()
  const sale = await db.get('sales', input.saleId)
  if (!sale) throw new Error('Satış bulunamadı.')
  const ts = nowIso()
  const payment: Payment = {
    id: createId('pay'),
    saleId: input.saleId,
    paymentDate: input.paymentDate,
    amount: Number(input.amount).toFixed(2),
    note: input.note?.trim() || undefined,
    createdAt: ts,
    updatedAt: ts,
  }
  await db.put('payments', payment)
  await db.put('sales', { ...sale, updatedAt: ts })
  return payment
}

export async function updatePayment(
  id: string,
  patch: Partial<Pick<Payment, 'paymentDate' | 'amount' | 'note'>>,
): Promise<Payment> {
  const db = await getDb()
  const existing = await db.get('payments', id)
  if (!existing) throw new Error('Ödeme bulunamadı.')
  if (patch.amount !== undefined && !(Number(patch.amount) > 0)) {
    throw new Error('Ödeme tutarı 0\'dan büyük olmalıdır.')
  }
  const updated: Payment = {
    ...existing,
    paymentDate: patch.paymentDate ?? existing.paymentDate,
    amount: patch.amount !== undefined ? Number(patch.amount).toFixed(2) : existing.amount,
    note: patch.note !== undefined ? patch.note.trim() || undefined : existing.note,
    updatedAt: nowIso(),
  }
  await db.put('payments', updated)
  const sale = await db.get('sales', existing.saleId)
  if (sale) await db.put('sales', { ...sale, updatedAt: nowIso() })
  return updated
}

export async function deletePayment(id: string): Promise<void> {
  const db = await getDb()
  const existing = await db.get('payments', id)
  if (!existing) return
  await db.delete('payments', id)
  const sale = await db.get('sales', existing.saleId)
  if (sale) await db.put('sales', { ...sale, updatedAt: nowIso() })
}

export async function exportBackup(): Promise<AppBackupPayload> {
  const db = await getDb()
  const [customers, sales, installments, payments] = await Promise.all([
    db.getAll('customers'),
    db.getAll('sales'),
    db.getAll('installments'),
    db.getAll('payments'),
  ])
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    customers,
    sales,
    installments,
    payments,
  }
}

function assertBackup(payload: unknown): AppBackupPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Geçersiz yedek dosyası.')
  }
  const p = payload as Record<string, unknown>
  if (typeof p.schemaVersion !== 'number') {
    throw new Error('Yedek şema sürümü eksik.')
  }
  if (!Array.isArray(p.customers) || !Array.isArray(p.sales) || !Array.isArray(p.installments) || !Array.isArray(p.payments)) {
    throw new Error('Yedek içeriği eksik veya bozuk.')
  }
  for (const c of p.customers) {
    if (!c || typeof c !== 'object' || typeof (c as Customer).id !== 'string' || typeof (c as Customer).name !== 'string') {
      throw new Error('Müşteri kayıtları geçersiz.')
    }
  }
  for (const s of p.sales) {
    if (!s || typeof s !== 'object' || typeof (s as Sale).id !== 'string' || typeof (s as Sale).customerId !== 'string') {
      throw new Error('Satış kayıtları geçersiz.')
    }
  }
  return p as unknown as AppBackupPayload
}

export async function importBackupReplace(raw: unknown): Promise<void> {
  const payload = assertBackup(raw)
  const db = await getDb()
  const tx = db.transaction(
    ['customers', 'sales', 'installments', 'payments', 'meta'],
    'readwrite',
  )

  await tx.objectStore('customers').clear()
  await tx.objectStore('sales').clear()
  await tx.objectStore('installments').clear()
  await tx.objectStore('payments').clear()

  for (const c of payload.customers) await tx.objectStore('customers').put(c)
  for (const s of payload.sales) await tx.objectStore('sales').put(s)
  for (const i of payload.installments) await tx.objectStore('installments').put(i)
  for (const p of payload.payments) await tx.objectStore('payments').put(p)
  await tx.objectStore('meta').put({ key: 'schemaVersion', value: payload.schemaVersion })
  await tx.done
}
