// Root middleware: permissive CORS for local cross-origin dev + OPTIONS handling.
import type { Env } from './_lib'

type Ctx = {
  request: Request
  next: () => Promise<Response>
  env: Env
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  }
}

export const onRequest = async (ctx: Ctx): Promise<Response> => {
  const origin = ctx.request.headers.get('Origin')
  if (ctx.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  const res = await ctx.next()
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}
