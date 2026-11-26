import { defineModule } from '@motoai/core'
import { handoffRoutes } from './routes.js'
import { webSessions } from './schema.js'
import {
  buildCarHandoffUrl,
  signHandoffToken,
  verifyHandoffToken,
  type HandoffPayload,
  type VerifyHandoffResult,
} from './token.js'
import { getCarLink } from './tools.js'

export const handoffModule = defineModule({
  name: 'handoff',
  dependsOn: ['customers'],
  schema: {
    webSessions,
  },
  tools: [getCarLink],
  routes: handoffRoutes,
})

export {
  buildCarHandoffUrl,
  signHandoffToken,
  verifyHandoffToken,
  type HandoffPayload,
  type VerifyHandoffResult,
}

export default handoffModule
