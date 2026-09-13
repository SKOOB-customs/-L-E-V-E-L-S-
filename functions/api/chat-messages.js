/**
 * Global website chat — every signed-in player, not just friends. Reads
 * the shared message list (see chat-send.js for the write side and the
 * 200-message cap). Direct KV read, no Pterodactyl/game-server
 * involvement — this never touches the mod.
 *
 * GET -> { messages: [{id, steamId, name, text, at}] }
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestGet({ env }) {
  if (!env.PARKED_KV) return json({ messages: [] });
  const messages = await env.PARKED_KV.get('global_chat:index', 'json');
  return json({ messages: Array.isArray(messages) ? messages : [] });
}
