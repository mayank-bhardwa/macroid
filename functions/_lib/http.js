// Small HTTP helpers shared by all Pages Functions.

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

export function error(status, message) {
  return json({ error: message }, { status });
}

// Parse a JSON request body, returning null on any failure.
export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
