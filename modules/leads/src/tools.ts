import { defineTool } from '@motoai/agent/tools'
import { emitter } from '@motoai/core/events'
import { conversations } from '@motoai/mod-customers/schema'
import { desc, eq } from 'drizzle-orm'
import { LEAD_STAGES, leads, type LeadStage } from './schema.js'

declare module '@motoai/core/events' {
  interface AppEvents {
    'lead:created': {
      leadId: string
      customerId: string
      conversationId?: string | null
      stage: LeadStage
    }
    'lead:handoff_requested': {
      leadId: string
      customerId: string
      conversationId?: string | null
      reason?: string
      assignedHuman?: string | null
    }
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value)
}

interface CreateLeadInput {
  customerId: string
  conversationId?: string
  dealerId?: string
  stage?: LeadStage
  shortlistedVariantIds?: string[]
  notes?: string
}

interface BookTestDriveInput {
  customerId: string
  testDriveSlot: string
  leadId?: string
  conversationId?: string
  dealerId?: string
  variantId?: string
  notes?: string
}

interface HandoffToHumanInput {
  customerId: string
  conversationId?: string
  leadId?: string
  assignedHuman?: string
  reason?: string
}

/**
 * Tool: create_lead
 * Creates a sales lead for a customer and emits 'lead:created'.
 */
export const createLead = defineTool<CreateLeadInput>({
  name: 'create_lead',
  description: 'Create a new sales lead for a customer with optional shortlisted vehicle variants.',
  parameters: {
    customerId: {
      type: 'string',
      description: 'Customer UUID',
      required: true,
    },
    conversationId: {
      type: 'string',
      description: 'Associated conversation UUID',
    },
    dealerId: {
      type: 'string',
      description: 'Dealer UUID if selected',
    },
    stage: {
      type: 'string',
      description: 'Initial lead stage (new, qualified, test_drive, negotiation, won, lost)',
    },
    shortlistedVariantIds: {
      type: 'array',
      description: 'Array of shortlisted variant UUIDs',
    },
    notes: {
      type: 'string',
      description: 'Additional notes about customer requirements',
    },
  },
  handler: async (params: CreateLeadInput, { db }) => {
    if (!isValidUuid(params.customerId)) {
      return { success: false, error: 'Valid customerId UUID is required' }
    }

    const stage: LeadStage =
      params.stage && LEAD_STAGES.includes(params.stage) ? params.stage : 'new'

    const [lead] = await db
      .insert(leads)
      .values({
        customerId: params.customerId,
        conversationId: isValidUuid(params.conversationId) ? params.conversationId : null,
        dealerId: isValidUuid(params.dealerId) ? params.dealerId : null,
        stage,
        shortlistedVariantIds: Array.isArray(params.shortlistedVariantIds)
          ? params.shortlistedVariantIds
          : [],
        notes: params.notes ?? null,
      })
      .returning()

    emitter.emit('lead:created', {
      leadId: lead.id,
      customerId: lead.customerId,
      conversationId: lead.conversationId,
      stage: lead.stage,
    })

    return { success: true, lead }
  },
})

/**
 * Tool: book_test_drive
 * Schedules a test drive slot on an existing or new lead.
 */
export const bookTestDrive = defineTool<BookTestDriveInput>({
  name: 'book_test_drive',
  description: 'Book a test drive slot for a customer and update their lead stage to test_drive.',
  parameters: {
    customerId: {
      type: 'string',
      description: 'Customer UUID',
      required: true,
    },
    testDriveSlot: {
      type: 'string',
      description: 'Requested date and time slot for the test drive (e.g. 2026-12-01 11:00 AM)',
      required: true,
    },
    leadId: {
      type: 'string',
      description: 'Existing lead UUID to update (optional)',
    },
    conversationId: {
      type: 'string',
      description: 'Associated conversation UUID',
    },
    dealerId: {
      type: 'string',
      description: 'Dealer UUID for the test drive',
    },
    variantId: {
      type: 'string',
      description: 'Variant UUID requested for the test drive',
    },
    notes: {
      type: 'string',
      description: 'Pickup or test drive notes',
    },
  },
  handler: async (params: BookTestDriveInput, { db }) => {
    if (!isValidUuid(params.customerId)) {
      return { success: false, error: 'Valid customerId UUID is required' }
    }
    if (!params.testDriveSlot || !params.testDriveSlot.trim()) {
      return { success: false, error: 'testDriveSlot is required' }
    }

    const existingLead = isValidUuid(params.leadId)
      ? (await db.select().from(leads).where(eq(leads.id, params.leadId)).limit(1))[0]
      : (
          await db
            .select()
            .from(leads)
            .where(eq(leads.customerId, params.customerId))
            .orderBy(desc(leads.createdAt))
            .limit(1)
        )[0]

    if (existingLead) {
      const shortlisted = new Set(existingLead.shortlistedVariantIds ?? [])
      if (isValidUuid(params.variantId)) {
        shortlisted.add(params.variantId)
      }

      const [updated] = await db
        .update(leads)
        .set({
          stage: 'test_drive',
          testDriveSlot: params.testDriveSlot.trim(),
          shortlistedVariantIds: Array.from(shortlisted),
          ...(isValidUuid(params.dealerId) ? { dealerId: params.dealerId } : {}),
          ...(params.notes
            ? { notes: existingLead.notes ? `${existingLead.notes}\n${params.notes}` : params.notes }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(leads.id, existingLead.id))
        .returning()

      return { success: true, lead: updated }
    }

    const [created] = await db
      .insert(leads)
      .values({
        customerId: params.customerId,
        conversationId: isValidUuid(params.conversationId) ? params.conversationId : null,
        dealerId: isValidUuid(params.dealerId) ? params.dealerId : null,
        stage: 'test_drive',
        shortlistedVariantIds: isValidUuid(params.variantId) ? [params.variantId] : [],
        testDriveSlot: params.testDriveSlot.trim(),
        notes: params.notes ?? null,
      })
      .returning()

    emitter.emit('lead:created', {
      leadId: created.id,
      customerId: created.customerId,
      conversationId: created.conversationId,
      stage: created.stage,
    })

    return { success: true, lead: created }
  },
})

/**
 * Tool: handoff_to_human
 * Marks conversation for human takeover, updates/creates the lead, and emits 'lead:handoff_requested'.
 */
export const handoffToHuman = defineTool<HandoffToHumanInput>({
  name: 'handoff_to_human',
  description:
    'Hand off the conversation to a human dealership advisor for negotiation, special requests, or closing.',
  parameters: {
    customerId: {
      type: 'string',
      description: 'Customer UUID',
      required: true,
    },
    conversationId: {
      type: 'string',
      description: 'Conversation UUID to flag for human takeover',
    },
    leadId: {
      type: 'string',
      description: 'Existing lead UUID (optional)',
    },
    assignedHuman: {
      type: 'string',
      description: 'Name or identifier of the human advisor',
    },
    reason: {
      type: 'string',
      description: 'Reason for requesting human handoff',
    },
  },
  handler: async (params: HandoffToHumanInput, { db }) => {
    if (!isValidUuid(params.customerId)) {
      return { success: false, error: 'Valid customerId UUID is required' }
    }

    if (isValidUuid(params.conversationId)) {
      await db
        .update(conversations)
        .set({ humanTakeover: true, updatedAt: new Date() })
        .where(eq(conversations.id, params.conversationId))
    }

    const existingLead = isValidUuid(params.leadId)
      ? (await db.select().from(leads).where(eq(leads.id, params.leadId)).limit(1))[0]
      : (
          await db
            .select()
            .from(leads)
            .where(eq(leads.customerId, params.customerId))
            .orderBy(desc(leads.createdAt))
            .limit(1)
        )[0]

    const handoffNote = params.reason ? `[Handoff] ${params.reason}` : null

    let lead = existingLead
    if (existingLead) {
      const [updated] = await db
        .update(leads)
        .set({
          ...(params.assignedHuman !== undefined ? { assignedHuman: params.assignedHuman } : {}),
          ...(handoffNote
            ? { notes: existingLead.notes ? `${existingLead.notes}\n${handoffNote}` : handoffNote }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(leads.id, existingLead.id))
        .returning()
      lead = updated
    } else {
      const [created] = await db
        .insert(leads)
        .values({
          customerId: params.customerId,
          conversationId: isValidUuid(params.conversationId) ? params.conversationId : null,
          stage: 'qualified',
          assignedHuman: params.assignedHuman ?? null,
          notes: handoffNote,
        })
        .returning()
      lead = created

      emitter.emit('lead:created', {
        leadId: created.id,
        customerId: created.customerId,
        conversationId: created.conversationId,
        stage: created.stage,
      })
    }

    emitter.emit('lead:handoff_requested', {
      leadId: lead.id,
      customerId: lead.customerId,
      conversationId: isValidUuid(params.conversationId)
        ? params.conversationId
        : lead.conversationId,
      reason: params.reason,
      assignedHuman: lead.assignedHuman,
    })

    return {
      success: true,
      handoffRequested: true,
      lead,
    }
  },
})
