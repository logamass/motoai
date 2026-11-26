import { defineModule, type ModuleDefinition } from '@motoai/core'
import { dealerBrands, dealers, priceLists, priceRows } from './schema.js'
import { pricingRoutes } from './routes.js'
import { compareVariants, getOnroadPrice } from './tools.js'

export const pricingModule: ModuleDefinition = defineModule({
  name: 'pricing',
  dependsOn: ['catalog'],
  schema: {
    dealers,
    dealerBrands,
    priceLists,
    priceRows,
  },
  routes: pricingRoutes,
  tools: [getOnroadPrice, compareVariants],
  playbooks: './playbooks',
})

export default pricingModule
