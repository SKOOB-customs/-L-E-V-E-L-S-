// API endpoint for automatic in-game permissions lookup and game-server syncing
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const steamIdQuery = url.searchParams.get('steam_id');

  // Parse custom staff configuration from environment or fallback defaults
  // Environment variable format: "76561198000000001:Owner,76561198000000002:Admin"
  const staffMap = {};

  if (env && env.STAFF_STEAM_IDS) {
    try {
      const parsed = typeof env.STAFF_STEAM_IDS === 'string'
        ? JSON.parse(env.STAFF_STEAM_IDS)
        : env.STAFF_STEAM_IDS;
      Object.assign(staffMap, parsed);
    } catch {
      // Parse as comma-separated pairs "STEAMID:ROLE"
      String(env.STAFF_STEAM_IDS).split(',').forEach(entry => {
        const [id, role] = entry.trim().split(':');
        if (id) staffMap[id] = role || 'Admin';
      });
    }
  }

  // Predefined default staff role definitions
  const rolePermissions = {
    Owner: {
      role: 'Owner',
      badge: '👑 Owner',
      inGameGroup: 'owner',
      permissions: ['admin', 'cheat', 'kick', 'ban', 'teleport', 'spawn', 'manage_permissions'],
    },
    Admin: {
      role: 'Admin',
      badge: '🛡️ Admin',
      inGameGroup: 'admin',
      permissions: ['admin', 'cheat', 'kick', 'ban', 'teleport', 'spawn'],
    },
    Moderator: {
      role: 'Moderator',
      badge: '⚔️ Moderator',
      inGameGroup: 'moderator',
      permissions: ['kick', 'ban', 'teleport', 'mute'],
    },
    Staff: {
      role: 'Staff',
      badge: '⭐ Staff',
      inGameGroup: 'staff',
      permissions: ['teleport', 'kick', 'mute'],
    },
  };

  // Helper to resolve role permissions
  const resolveRole = (roleName) => rolePermissions[roleName] || {
    role: roleName || 'Staff',
    badge: '⭐ Staff',
    inGameGroup: (roleName || 'staff').toLowerCase(),
    permissions: ['teleport', 'kick', 'mute'],
  };

  // If searching for a specific Steam ID
  if (steamIdQuery) {
    const roleName = staffMap[steamIdQuery];
    if (roleName) {
      const roleDetails = resolveRole(roleName);
      return Response.json({
        success: true,
        steam_id: steamIdQuery,
        is_staff: true,
        ...roleDetails,
      }, {
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      });
    }

    return Response.json({
      success: true,
      steam_id: steamIdQuery,
      is_staff: false,
      role: 'Player',
      badge: '🎮 Player',
      inGameGroup: 'default',
      permissions: [],
    }, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    });
  }

  // Return full staff roster for game server automatic sync
  const roster = Object.entries(staffMap).map(([id, roleName]) => ({
    steam_id: id,
    ...resolveRole(roleName),
  }));

  return Response.json({
    success: true,
    total_staff: roster.length,
    staff: roster,
    sync_instructions: 'Your game server can poll this URL to sync staff permissions automatically.',
  }, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
  });
}
