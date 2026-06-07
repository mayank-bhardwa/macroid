import { Env, json, bearerToken } from '../../_lib'

export const onRequestPost = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const token = bearerToken(ctx.request)
  if (token) {
    await ctx.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
  }
  return json({ ok: true })
}
