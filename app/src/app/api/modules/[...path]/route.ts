import { NextResponse } from 'next/server'
import { getAllRoutes, type RouteDefinition } from '@motoai/core'
import { ensureBooted } from '@/lib/bootstrap'

export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{ path: string[] }>
}

function matchRoute(
  method: string,
  pathSegments: string[]
): (RouteDefinition & { module: string }) | null {
  const [moduleName, ...subSegments] = pathSegments
  if (!moduleName) {
    return null
  }

  const upperMethod = method.toUpperCase()
  const routes = getAllRoutes()

  for (const route of routes) {
    if (route.module !== moduleName) continue
    if (route.method.toUpperCase() !== upperMethod) continue

    const routeSegments = route.path.split('/').filter(Boolean)
    if (routeSegments.length !== subSegments.length) continue

    const matches = routeSegments.every(
      (segment, idx) => segment.startsWith(':') || segment === subSegments[idx]
    )
    if (matches) {
      return route
    }
  }

  return null
}

async function dispatch(req: Request, context: RouteContext): Promise<Response> {
  await ensureBooted()

  const { path } = await context.params
  const route = matchRoute(req.method, path ?? [])

  if (!route) {
    return NextResponse.json(
      {
        error: 'Module route not found',
        method: req.method,
        path: `/${(path ?? []).join('/')}`,
      },
      { status: 404 }
    )
  }

  try {
    return await route.handler(req)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error(`[modules:${route.module}] Route error:`, err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export function GET(req: Request, context: RouteContext): Promise<Response> {
  return dispatch(req, context)
}

export function POST(req: Request, context: RouteContext): Promise<Response> {
  return dispatch(req, context)
}

export function PUT(req: Request, context: RouteContext): Promise<Response> {
  return dispatch(req, context)
}

export function PATCH(req: Request, context: RouteContext): Promise<Response> {
  return dispatch(req, context)
}

export function DELETE(req: Request, context: RouteContext): Promise<Response> {
  return dispatch(req, context)
}
