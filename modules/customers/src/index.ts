import { defineModule } from '@motoai/core'
import { customerRoutes } from './routes.js'
import { conversations, customers, messages } from './schema.js'
import { updateCustomerProfile } from './tools.js'

export const customersModule = defineModule({
  name: 'customers',
  schema: {
    customers,
    conversations,
    messages,
  },
  tools: [updateCustomerProfile],
  routes: customerRoutes,
})

export default customersModule
