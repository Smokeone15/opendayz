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

// НАШИ ВЫДЕЛЕННЫЕ СЕРВЕРЫ (Принудительно опрашиваются напрямую и выводятся на самый верх)
const FEATURED_SERVERS = [
  { 
    host: "212.22.85.57", // Актуальный IP SHADOW FOX
    port: 27016,          // QUERY порт
    fallbackName: "SHADOW FOX MOD PVP/PVE"
  }
];

let cachedServers = [];
const modNameCache = new Map();

/**
 * Разрешает имена модов по их Steam Workshop ID через официальный Steam API
 */
async function resolveModNames(modIds) {
  const result = [];
  const toFetch = [];

  modIds.forEach(id => {
    if (modNameCache.has(id)) {
      result.push({ id, name: modNameCache.get(id) });
    } else {
      toFetch.push(id);
    }
  });

  if (toFetch.length > 0) {
    try {
      // Steam API позволяет запрашивать до 100 элементов за раз
      for (let i = 0; i < toFetch.length; i += 100) {
        const chunk = toFetch.slice(i, i + 100);
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
            // Находим все вхождения этого ID в исходном запросе (на случай дублей)
            result.push({ id: d.publishedfileid, name });
          });
        }
      }
    } catch (e) {
      console.error("[STEAM] Ошибка получения имен модов:", e.message);
      // Возвращаем хотя бы ID, если API упал
      toFetch.forEach(id => result.push({ id, name: `Mod ${id}` }));
    }
  }

  return result;
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

      const rules = state.raw?.rules || {};
      const rawMods = rules.modList || rules.modNames || "";
      let mods = rawMods.split(';').filter(Boolean).map((mod) => {
        const parts = mod.split(':');
        return { id: parts[0], name: parts[1] || `Mod (${parts[0]})` };
      });

      // Если в ответе только ID модов (без имен), запрашиваем имена у Steam
      if (mods.length > 0 && mods.every(m => m.name.startsWith('Mod ('))) {
        mods = await resolveModNames(mods.map(m => m.id));
      }

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
      console.error(`[ERROR] Featured server query failed: ${err.message}`);
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

    // 2. Параллельные запросы к Steam с разными фильтрами для обхода лимита 10к
    const filters = [
      "\\appid\\221100\\noplayers\\1",
      "\\appid\\221100\\nor\\1\\noplayers\\1",
      "\\appid\\221100\\region\\0",
      "\\appid\\221100\\region\\255",
      "\\appid\\221100\\map\\chernarusplus",
      "\\appid\\221100\\map\\livonia",
      "\\appid\\221100\\map\\sakhal",
      "\\appid\\221100\\nor\\3\\map\\chernarusplus\\map\\livonia\\map\\sakhal"
    ];

    console.log(`[API] Запрос серверов из Steam...`);
    const fetchPromises = filters.map(f =>
      fetch(`https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=${STEAM_API_KEY}&filter=${f}&limit=10000`)
        .then(r => r.json()).catch(() => ({ response: {} }))
    );

    const results = await Promise.all(fetchPromises);
    let allRawServers = [];
    results.forEach(res => {
      if (res.response?.servers) {
        allRawServers = allRawServers.concat(res.response.servers);
      }
    });

    console.log(`[API] Steam вернул всего ${allRawServers.length} записей до дедупликации.`);

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
    console.log(`[API] Склеен глобальный список: ${cachedServers.length} серверов.`);
  } catch (error) {
    console.error("[API] Ошибка запроса к Steam API:", error);
  }
}

// Обновляем раз в 10 минут, чтобы не спамить Steam API
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
      maxRetries: 2
    });

    const rules = state.raw?.rules || {};
    const rawMods = rules.modList || rules.modNames || "";

    let mods = rawMods.split(';').filter(Boolean).map(mod => {
      const parts = mod.split(':');
      return {
        id: parts[0],
        name: parts[1] || `Mod (${parts[0]})`
      };
    });

    // Если список пуст, но сервер помечен как modded, возможно моды в другом поле или не отдаются
    // Некоторые серверы отдают IDs в tags или требуют спец. запроса, который GameDig может не делать.
    // Но мы хотя бы попробуем разрешить имена, если получили только IDs
    if (mods.length > 0 && mods.every(m => m.name.startsWith('Mod ('))) {
      mods = await resolveModNames(mods.map(m => m.id));
    }

    res.json({ mods: mods });
  } catch (err) {
    console.error(`[ERROR] Mod query failed for ${host}:${port}: ${err.message}`);
    res.json({ mods: [], error: `Не удалось получить моды: ${err.message}` });
  }
});

app.get('/api/servers', (req, res) => {
  res.json(cachedServers);
});

app.listen(PORT, () => {
  console.log(`[API] Бэкенд списка серверов запущен на http://localhost:${PORT}`);
});
