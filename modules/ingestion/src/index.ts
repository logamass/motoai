import { defineModule, type ModuleDefinition } from '@motoai/core'
import { uploadJobs } from './schema.js'
import { ingestionRoutes } from './routes.js'
import { pdfExtractWorker } from './workers.js'
import { seedDemoData } from './seed-demo.js'

export { seedDemoData }

export const ingestionModule: ModuleDefinition = defineModule({
  name: 'ingestion',
  dependsOn: ['pricing'],
  schema: {
    uploadJobs,
  },
  routes: ingestionRoutes,
  workers: {
    'pdf-extract': pdfExtractWorker,
  },
  seed: async (db) => {
    await seedDemoData(db)
  },
})

export default ingestionModule
