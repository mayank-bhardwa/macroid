import { Env, json, authenticate } from '../../_lib'

export const onRequestGet = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const user = await authenticate(ctx.request, ctx.env)
  if (!user) return json({ error: 'Unauthorized' }, 401)
  return json({ user: { id: user.id, email: user.email } })
}
