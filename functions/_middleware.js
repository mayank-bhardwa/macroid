// Root middleware: applies permissive CORS so the PWA can call the API both
// same-origin (production) and cross-origin (local `astro dev` against the
// deployed Functions). Credentials are bearer-token based, not cookies.

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function onRequest(context) {
  const { request, next } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const response = await next();
  // Only decorate API responses; static assets are served untouched.
  const headers = corsHeaders(request);
  const merged = new Headers(response.headers);
  for (const [k, v] of Object.entries(headers)) merged.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  });
}
