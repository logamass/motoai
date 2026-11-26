import { defineTool } from '@motoai/agent/tools'
import { eq } from 'drizzle-orm'
import { customers, type CustomerProfile } from './schema.js'

interface UpdateCustomerProfileInput {
  customerId: string
  familySize?: number
  budgetMin?: number
  budgetMax?: number
  usage?: string
  fuelPreference?: string
  transmissionPreference?: string
  city?: string
  preferredLang?: string
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Tool: update_customer_profile
 * Merges car-buying preferences (family size, budget, usage, fuel, transmission)
 * into the customer's persisted profile.
 */
export const updateCustomerProfile = defineTool<UpdateCustomerProfileInput>({
  name: 'update_customer_profile',
  description:
    'Update customer profile preferences such as family size, budget range, usage pattern, fuel preference, and transmission preference.',
  parameters: {
    customerId: {
      type: 'string',
      description: 'Customer UUID',
      required: true,
    },
    familySize: {
      type: 'number',
      description: 'Number of family members',
    },
    budgetMin: {
      type: 'number',
      description: 'Minimum budget in INR',
    },
    budgetMax: {
      type: 'number',
      description: 'Maximum budget in INR',
    },
    usage: {
      type: 'string',
      description: 'Primary driving usage (e.g. city commute, highway, family trips)',
    },
    fuelPreference: {
      type: 'string',
      description: 'Preferred fuel type (e.g. petrol, diesel, cng, electric, hybrid)',
    },
    transmissionPreference: {
      type: 'string',
      description: 'Preferred transmission (e.g. manual, automatic, amt, cvt, dct)',
    },
    city: {
      type: 'string',
      description: 'Customer city',
    },
    preferredLang: {
      type: 'string',
      description: 'Preferred language code (e.g. en, ta, tl)',
    },
  },
  handler: async (params: UpdateCustomerProfileInput, { db }) => {
    if (!params.customerId || !UUID_REGEX.test(params.customerId)) {
      return { success: false, error: 'Valid customerId UUID is required' }
    }

    const [existing] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, params.customerId))
      .limit(1)

    if (!existing) {
      return { success: false, error: 'Customer not found' }
    }

    const nextProfile: CustomerProfile = {
      ...(existing.profile ?? {}),
    }

    if (params.familySize !== undefined) nextProfile.familySize = params.familySize
    if (params.budgetMin !== undefined) nextProfile.budgetMin = params.budgetMin
    if (params.budgetMax !== undefined) nextProfile.budgetMax = params.budgetMax
    if (params.usage !== undefined) nextProfile.usage = params.usage
    if (params.fuelPreference !== undefined) nextProfile.fuelPreference = params.fuelPreference
    if (params.transmissionPreference !== undefined) {
      nextProfile.transmissionPreference = params.transmissionPreference
    }

    const [updated] = await db
      .update(customers)
      .set({
        profile: nextProfile,
        ...(params.city !== undefined ? { city: params.city } : {}),
        ...(params.preferredLang !== undefined ? { preferredLang: params.preferredLang } : {}),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, params.customerId))
      .returning()

    return {
      success: true,
      customer: updated,
    }
  },
})
