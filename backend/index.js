const express = require('express');
const cors = require('cors');
const compression = require('compression');
const { GameDig } = require('gamedig');

const app = express();
app.use(cors());
app.use(compression());

const PORT = 4000;

// ТУТ ДОЛЖЕН БЫТЬ ВАШ STEAM API KEY
const STEAM_API_KEY = "5309DC33296CE48D19BFF393F2B49230"; 

// НАШИ ВЫДЕЛЕННЫЕ СЕРВЕРЫ
const FEATURED_SERVERS = [
  { 
    host: "212.22.85.57", // SHADOW FOX
    port: 27016,          // QUERY порт
    fallbackName: "SHADOW FOX MOD PVP/PVE"
  }
];

let cachedServers = [];
const modNameCache = new Map();

/**
 * Разрешает имена модов по их Steam Workshop ID
 */
async function resolveModNames(modIds) {
  const result = [];
  const toFetch = [...new Set(modIds.filter(id => id && id.length > 5))];

  const pendingIds = [];
  toFetch.forEach(id => {
    if (modNameCache.has(id)) {
      result.push({ id, name: modNameCache.get(id) });
    } else {
      pendingIds.push(id);
    }
  });

  if (pendingIds.length > 0) {
    try {
      for (let i = 0; i < pendingIds.length; i += 100) {
        const chunk = pendingIds.slice(i, i + 100);
        const params = new URLSearchParams();
        params.set('itemcount', chunk.length);
        chunk.forEach((id, index) => params.set(`publishedfileids[${index}]`, id));

        const response = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
          method: 'POST',
          body: params
        });
        const data = await response.json();

        if (data.response?.publishedfiledetails) {
          data.response.publishedfiledetails.forEach(d => {
            const name = d.title || `Mod ${d.publishedfileid}`;
            modNameCache.set(d.publishedfileid, name);
            result.push({ id: d.publishedfileid, name });
          });
        }
      }
    } catch (e) {
      console.error("[STEAM] Ошибка получения имен модов:", e.message);
      pendingIds.forEach(id => result.push({ id, name: `Mod ${id}` }));
    }
  }

  return result;
}

/**
 * Парсит список модов из различных полей ответа сервера (включая новое dayzMods от GameDig)
 */
async function parseMods(raw) {
  // 1. Проверяем новое поле dayzMods (современный gamedig)
  if (raw.dayzMods && Array.from(raw.dayzMods).length > 0) {
    return raw.dayzMods.map(m => ({
      id: m.workshopId ? String(m.workshopId) : "",
      name: m.title || (m.workshopId ? `Mod (${m.workshopId})` : "Unknown Mod")
    })).filter(m => m.id || m.name);
  }

  let rawMods = "";
  const rules = raw.rules || {};
  const tags = raw.tags || [];

  // 2. Ищем в rules (A2S_RULES)
  const modKeys = Object.keys(rules).filter(k => k.toLowerCase().includes('modlist')).sort();
  if (modKeys.length > 0) {
    rawMods = modKeys.map(k => rules[k]).join('');
  } else {
    rawMods = rules.modList || rules.modNames || rules.mods || "";
  }

  // 3. Если в rules пусто, проверяем tags (A2S_INFO)
  if (!rawMods && tags.length > 0) {
    const idTags = tags.filter(t => /^\d{7,20}$/.test(t));
    if (idTags.length > 0) {
        let mods = idTags.map(id => ({ id, name: `Mod (${id})` }));
        return await resolveModNames(mods.map(m => m.id));
    }
  }

  if (!rawMods) return [];

  let mods = rawMods.split(';').filter(Boolean).map(mod => {
    const parts = mod.split(':');
    if (parts.length >= 2) {
        return { id: parts[0], name: parts[1] };
    }
    return { id: parts[0], name: `Mod (${parts[0]})` };
  });

  if (mods.length > 0 && mods.every(m => m.name.startsWith('Mod ('))) {
    mods = await resolveModNames(mods.map(m => m.id));
  }

  return mods;
}

async function getFeaturedServers() {
  const list = [];
  for (const srv of FEATURED_SERVERS) {
    try {
      console.log(`[QUERY] Опрос FEATURED сервера: ${srv.host}:${srv.port}`);
      const state = await GameDig.query({
        type: 'dayz',
        host: srv.host,
        port: srv.port,
        requestRules: true,
        maxRetries: 3
      });

      const mods = await parseMods(state.raw);

      list.push({
        id: `${srv.host}:${srv.port}`,
        addr: `${srv.host}:${srv.port}`,
        host: srv.host,
        query_port: srv.port,
        game_port: state.raw.port || 2302,
        name: `★ [FEATURED] ${state.name || srv.fallbackName}`,
        players: state.players.length,
        max_players: state.maxplayers,
        map: state.map || "Chernarus",
        status: "online",
        connect: `${srv.host}:${state.raw.port || 2302}`,
        is_modded: mods.length > 0 || (state.raw?.gametype && state.raw.gametype.includes('mod')),
        mods: mods,
        is_featured: true
      });
    } catch (err) {
      console.error(`[ERROR] Featured query failed: ${err.message}`);
      list.push({
        id: `${srv.host}:${srv.port}`,
        addr: `${srv.host}:${srv.port}`,
        host: srv.host,
        query_port: srv.port,
        game_port: 2302,
        name: `★ [OFFLINE] ${srv.fallbackName}`,
        players: 0,
        max_players: 60,
        map: "Chernarus",
        status: "offline",
        connect: `${srv.host}:2302`,
        is_modded: true,
        mods: [],
        is_featured: true
      });
    }
  }
  return list;
}

async function updateServersList() {
  try {
    const featuredList = await getFeaturedServers();

    if (!STEAM_API_KEY || STEAM_API_KEY === "ВАШ_КЛЮЧ_STEAM_API") {
      cachedServers = featuredList;
      return;
    }

    const filters = [
      "\\appid\\221100\\noplayers\\1",
      "\\appid\\221100\\nor\\1\\noplayers\\1",
      "\\appid\\221100\\region\\0",
      "\\appid\\221100\\region\\1",
      "\\appid\\221100\\region\\2",
      "\\appid\\221100\\region\\3",
      "\\appid\\221100\\region\\4",
      "\\appid\\221100\\region\\255",
      "\\appid\\221100\\map\\chernarusplus",
      "\\appid\\221100\\map\\livonia",
      "\\appid\\221100\\map\\sakhal",
      "\\appid\\221100\\nor\\3\\map\\chernarusplus\\map\\livonia\\map\\sakhal"
    ];

    console.log(`[API] Запрос серверов из Steam...`);
    const fetchPromises = filters.map(f =>
      fetch(`https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=${STEAM_API_KEY}&filter=${f}&limit=15000`)
        .then(r => r.json()).catch(() => ({ response: {} }))
    );

    const results = await Promise.all(fetchPromises);
    let allRawServers = [];
    results.forEach(res => {
      if (res.response?.servers) {
        allRawServers = allRawServers.concat(res.response.servers);
      }
    });

    const uniqueServersMap = new Map();
    allRawServers.forEach(srv => {
      if (srv.addr && srv.name && srv.max_players > 0) {
        const existing = uniqueServersMap.get(srv.addr);
        if (!existing || (!existing.gametype && srv.gametype)) {
          uniqueServersMap.set(srv.addr, srv);
        }
      }
    });

    const formatted = Array.from(uniqueServersMap.values()).map((srv) => {
      const gametype = srv.gametype || "";
      const isModded = gametype.split(',').includes('mod');
      const host = srv.addr.split(':')[0];
      const query_port = parseInt(srv.addr.split(':')[1]);

      return {
        id: srv.addr, 
        addr: srv.addr,
        host: host,
        query_port: query_port,
        game_port: srv.gameport || 2302,
        name: srv.name,
        players: srv.players || 0,
        max_players: srv.max_players || 60,
        map: srv.map || "Chernarus",
        status: "online",
        connect: `${host}:${srv.gameport || 2302}`,
        is_modded: isModded,
        mods: [],
        tags: gametype.split(','),
        is_featured: false
      };
    });

    formatted.sort((a, b) => b.players - a.players);
    cachedServers = [...featuredList, ...formatted];
    console.log(`[API] Обновлено: ${cachedServers.length} серверов.`);
  } catch (error) {
    console.error("[API] Ошибка обновления списка:", error);
  }
}

setInterval(updateServersList, 600000);
updateServersList();

app.get('/api/server-mods', async (req, res) => {
  const { host, port } = req.query;
  if (!host || !port) {
    return res.status(400).json({ error: "Missing host or port" });
  }

  try {
    console.log(`[QUERY] Запрос модов для: ${host}:${port}`);
    const state = await GameDig.query({
      type: 'dayz',
      host: host,
      port: parseInt(port),
      requestRules: true,
      maxRetries: 2,
      socketTimeout: 5000
    });

    const mods = await parseMods(state.raw);
    res.json({ mods: mods });
  } catch (err) {
    console.error(`[ERROR] Mod query failed for ${host}:${port}: ${err.message}`);
    res.json({ mods: [], error: `UDP Error: ${err.message}` });
  }
});

app.get('/api/servers', (req, res) => {
  res.json(cachedServers);
});

app.listen(PORT, () => {
  console.log(`[API] Бэкенд запущен на порту ${PORT}`);
});
