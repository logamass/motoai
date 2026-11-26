'use server'

import { db } from '@motoai/core/db'
import { customers } from '@motoai/mod-customers/schema'
import { ensureBooted } from '@/lib/bootstrap'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface EnsureWebCustomerInput {
  existingCustomerId?: string | null
  name: string
  phone: string
}

/**
 * Ensures a valid `customers` row exists in Postgres before creating a lead
 * via `POST /api/modules/leads`.
 */
export async function ensureWebCustomer(
  input: EnsureWebCustomerInput
): Promise<{ customerId: string }> {
  await ensureBooted()

  const cleanName = input.name.trim() || 'Website Visitor'
  const cleanPhone = input.phone.trim()

  const existingList = await db.select().from(customers)

  if (input.existingCustomerId && UUID_REGEX.test(input.existingCustomerId)) {
    const byId = existingList.find((c) => c.id === input.existingCustomerId)
    if (byId) {
      return { customerId: byId.id }
    }
  }

  if (cleanPhone) {
    const byPhone = existingList.find((c) => c.phone === cleanPhone)
    if (byPhone) {
      return { customerId: byPhone.id }
    }
  }

  const [created] = await db
    .insert(customers)
    .values({
      name: cleanName,
      phone: cleanPhone || null,
      city: 'Chennai',
      preferredLang: 'en',
    })
    .returning({ id: customers.id })

  return { customerId: created.id }
}
