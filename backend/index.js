const express = require('express');
const cors = require('cors');
const { GameDig } = require('gamedig');

const app = express();
app.use(cors());

const PORT = 4000;

// ТУТ ДОЛЖЕН БЫТЬ ВАШ STEAM API KEY
const STEAM_API_KEY = "5309DC33296CE48D19BFF393F2B49230"; 

// НАШИ ВЫДЕЛЕННЫЕ СЕРВЕРЫ (Принудительно опрашиваются напрямую и выводятся на самый верх)
const FEATURED_SERVERS = [
  { 
    host: "54.36.109.179", // Укажите IP вашего сервера SHADOW FOX
    port: 2303,            // Укажите QUERY порт (для опроса UDP) вашего сервера SHADOW FOX
    fallbackName: "SHADOW FOX PVE CHERNO" 
  }
];

let cachedServers = [];

async function getFeaturedServers() {
  const list = [];
  for (const srv of FEATURED_SERVERS) {
    try {
      // Опрашиваем ваш сервер напрямую по UDP
      const state = await GameDig.query({
        type: 'dayz',
        host: srv.host,
        port: srv.port,
        requestRules: true
      });

      const rawMods = state.raw?.rules?.modList || "";
      const mods = rawMods.split(';').filter(Boolean).map((mod, i) => {
        const parts = mod.split(':');
        return { id: parts[0], name: parts[1] || `Mod (${parts[0]})` };
      });

      list.push({
        id: `${srv.host}:${srv.port}`,
        addr: `${srv.host}:${srv.port}`,
        host: srv.host,
        query_port: srv.port,
        game_port: state.raw.port, // Порт игры для подключения
        name: `★ [FEATURED] ${state.name || srv.fallbackName}`,
        players: state.players.length,
        max_players: state.maxplayers,
        map: state.map || "Chernarus",
        status: "online",
        connect: `${srv.host}:${state.raw.port}`,
        is_modded: mods.length > 0,
        mods: mods,
        is_featured: true // Флаг для выделения на клиенте
      });
    } catch (err) {
      // Если ваш сервер выключен или недоступен по UDP, выводим оффлайн заглушку
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
    // 1. Сначала опрашиваем ваши выделенные серверы напрямую по UDP
    const featuredList = await getFeaturedServers();

    if (!STEAM_API_KEY || STEAM_API_KEY === "ВАШ_КЛЮЧ_STEAM_API") {
      cachedServers = featuredList;
      return;
    }

    // 2. Делаем два параллельных запроса к Steam для получения всех мировых серверов
    const urlPlayers = `https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=${STEAM_API_KEY}&filter=\\appid\\221100\\empty\\0&limit=5000`;
    const urlEmpty = `https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=${STEAM_API_KEY}&filter=\\appid\\221100\\empty\\1&limit=15000`;
    
    const [resPlayers, resEmpty] = await Promise.all([
      fetch(urlPlayers).then(r => r.json()).catch(() => ({ response: {} })),
      fetch(urlEmpty).then(r => r.json()).catch(() => ({ response: {} }))
    ]);

    const serversPlayers = resPlayers.response?.servers || [];
    const serversEmpty = resEmpty.response?.servers || [];
    const allRawServers = [...serversPlayers, ...serversEmpty];

    // Удаляем дубликаты
    const uniqueServersMap = new Map();
    allRawServers.forEach(srv => {
      if (srv.addr && srv.name && srv.max_players > 0) {
        uniqueServersMap.set(srv.addr, srv);
      }
    });

    const formatted = Array.from(uniqueServersMap.values()).map((srv) => {
      const isModded = srv.gametype ? srv.gametype.split(',').includes('mod') : false;
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
        connect: `${host}:${srv.gameport || 2302}`, // Игровой порт подключения!
        is_modded: isModded,
        mods: [],
        is_featured: false
      };
    });

    // Сортируем мировые серверы по онлайну
    formatted.sort((a, b) => b.players - a.players);

    // Склеиваем: ваши выделенные сервера ВСЕГДА на самом верху списка!
    cachedServers = [...featuredList, ...formatted];
    console.log(`[API] Склеен глобальный список: ${cachedServers.length} серверов.`);
  } catch (error) {
    console.error("[API] Ошибка запроса к Steam API:", error);
  }
}

setInterval(updateServersList, 60000);
updateServersList();

app.get('/api/server-mods', async (req, res) => {
  const { host, port } = req.query;
  if (!host || !port) {
    return res.status(400).json({ error: "Missing host or port" });
  }

  try {
    const state = await GameDig.query({
      type: 'dayz',
      host: host,
      port: parseInt(port),
      requestRules: true
    });

    const rawMods = state.raw?.rules?.modList || "";
    const mods = rawMods.split(';').filter(Boolean).map(mod => {
      const parts = mod.split(':');
      return {
        id: parts[0],
        name: parts[1] || `Mod (${parts[0]})`
      };
    });

    res.json({ mods: mods });
  } catch (err) {
    res.json({ mods: [], error: "Не удалось связаться с сервером по UDP" });
  }
});

app.get('/api/servers', (req, res) => {
  res.json(cachedServers);
});

app.listen(PORT, () => {
  console.log(`[API] Бэкенд списка серверов запущен на http://localhost:${PORT}`);
});