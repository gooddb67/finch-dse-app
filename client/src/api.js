// The front end only talks to our own server (/api/...). The server holds the
// Finch access token, so the browser never sees it.
export async function api(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error?.message || `Request failed (${res.status})`);
  return body;
}
