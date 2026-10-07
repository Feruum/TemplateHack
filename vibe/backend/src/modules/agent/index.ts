import type { MiddlewareHandler } from 'hono'

import type { AppEnv } from '../../env'
import type { AuthHttpEnv } from '../auth'
import { createAgentRoutes } from './transport/routes'

export function createAgentModule(options: {
  env: AppEnv
  requireAuth: MiddlewareHandler<AuthHttpEnv>
}) {
  return { routes: createAgentRoutes(options) }
}
