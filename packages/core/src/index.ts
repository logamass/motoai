/**
 * @motoai/core — Platform core.
 *
 * Re-exports everything modules and the app need.
 * Individual sub-paths are also available:
 *   import { db } from '@motoai/core/db'
 *   import { env } from '@motoai/core/config'
 */

export { db, getDb, closeDb, type DB } from './db/index.js'
export { emitter, type AppEvents } from './events/index.js'
export { env } from './config/index.js'
export { isEnabled, getAllFlags, type FlagName } from './config/flags.js'
export {
  defineModule,
  registerModule,
  getModule,
  getAllModules,
  getAllTools,
  getAllRoutes,
  getAllSchemas,
  type ModuleDefinition,
  type ToolDefinition,
  type RouteDefinition,
  type EventListenerDef,
} from './module-system.js'
