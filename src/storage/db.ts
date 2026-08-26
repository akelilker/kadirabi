import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { SCHEMA_VERSION } from '../domain/types'
import type { Customer, Installment, Payment, Sale } from '../domain/types'

export interface AppBackupPayload {
  schemaVersion: number
  exportedAt: string
  customers: Customer[]
  sales: Sale[]
  installments: Installment[]
  payments: Payment[]
}

interface TaksitDB extends DBSchema {
  customers: {
    key: string
    value: Customer
    indexes: { 'by-name': string }
  }
  sales: {
    key: string
    value: Sale
    indexes: { 'by-customer': string }
  }
  installments: {
    key: string
    value: Installment
    indexes: { 'by-sale': string }
  }
  payments: {
    key: string
    value: Payment
    indexes: { 'by-sale': string }
  }
  meta: {
    key: string
    value: { key: string; value: unknown }
  }
}

/** Stable storage namespace — not tied to URL path (/kadirabi/). */
const DB_NAME = 'kadirabi-taksit-alacak-v1'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<TaksitDB>> | null = null

export function getDb(): Promise<IDBPDatabase<TaksitDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TaksitDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const customers = db.createObjectStore('customers', { keyPath: 'id' })
        customers.createIndex('by-name', 'name')

        const sales = db.createObjectStore('sales', { keyPath: 'id' })
        sales.createIndex('by-customer', 'customerId')

        const installments = db.createObjectStore('installments', { keyPath: 'id' })
        installments.createIndex('by-sale', 'saleId')

        const payments = db.createObjectStore('payments', { keyPath: 'id' })
        payments.createIndex('by-sale', 'saleId')

        db.createObjectStore('meta', { keyPath: 'key' })
      },
    }).then(async (db) => {
      const existing = await db.get('meta', 'schemaVersion')
      if (!existing) {
        await db.put('meta', { key: 'schemaVersion', value: SCHEMA_VERSION })
      }
      return db
    })
  }
  return dbPromise
}

export async function resetDbConnection(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
}
