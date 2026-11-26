import { defineModule } from '@motoai/core'
import { leadRoutes } from './routes.js'
import { leads } from './schema.js'
import { bookTestDrive, createLead, handoffToHuman } from './tools.js'

export const leadsModule = defineModule({
  name: 'leads',
  dependsOn: ['customers'],
  schema: {
    leads,
  },
  tools: [createLead, bookTestDrive, handoffToHuman],
  routes: leadRoutes,
})

export default leadsModule
