import { defineModule, type ModuleDefinition } from '@motoai/core'
import { brands, media, models, specs, variants } from './schema.js'
import { catalogRoutes } from './routes.js'
import { getVariantDetails, searchCars } from './tools.js'

export const catalogModule: ModuleDefinition = defineModule({
  name: 'catalog',
  schema: {
    brands,
    models,
    variants,
    specs,
    media,
  },
  routes: catalogRoutes,
  tools: [searchCars, getVariantDetails],
  playbooks: './playbooks',
})

export default catalogModule
