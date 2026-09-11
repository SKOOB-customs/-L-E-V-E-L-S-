/**
 * Compensation form: the mutation-name catalog + slot tiers for the
 * dynamic entombment/mutation-slot dropdowns.
 *
 * GET -> proxied to the bridge Worker's /mutations-catalog route. No auth
 * needed (read-only, sourced from public wikis) — see KNOWN_MUTATIONS in
 * bridge-worker.js for caveats.
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const workerOrigin = (env) => {
  if (!env.SERVER_STATUS_URL) return null;
  try {
    return new URL(env.SERVER_STATUS_URL).origin;
  } catch {
    return null;
  }
};

export async function onRequestGet(context) {
  const { env } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  try {
    const response = await fetch(`${origin}/mutations-catalog`, {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Mutation catalog lookup failed' }, 502);
  }
}
