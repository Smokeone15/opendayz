import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export default function App() {
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMods, setLoadingMods] = useState(false);
  const [activeTab, setActiveTab] = useState('servers');

  const [filterHideEmpty, setFilterHideEmpty] = useState(false);
  const [filterMap, setFilterMap] = useState('All');
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState(false);

  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem('opendayz_favorites');
    return saved ? JSON.parse(saved) : [];
  });

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('opendayz_settings');
    return saved ? JSON.parse(saved) : {
      nosplash: true,
      nopause: true,
      windowed: false,
      nologs: false,
      additionalArgs: '',
      customPath: '' // Возможность указать путь к DayZ_x64.exe вручную
    };
  });

  const fetchServers = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://127.0.0.1:4000/api/servers'); 
      const data = await response.json();
      setServers(data);
      if (data.length > 0) {
        selectAndLoadServer(data[0]);
      }
    } catch (error) {
      console.error("Ошибка получения списка серверов:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, []);

  const selectAndLoadServer = async (server) => {
    setSelectedServer(server);
    if (!server.is_modded) {
      server.mods = [];
      return;
    }

    try {
      setLoadingMods(true);
      // СТРОГО опрашиваем по UDP-порту (query_port), а не порту подключения!
      const response = await fetch(`http://127.0.0.1:4000/api/server-mods?host=${server.host}&port=${server.query_port}`);
      const data = await response.json();
      
      setSelectedServer(prev => prev && prev.connect === server.connect ? { ...prev, mods: data.mods || [] } : prev);
    } catch (err) {
      console.error("Не удалось загрузить моды сервера:", err);
    } finally {
      setLoadingMods(false);
    }
  };

  const handleSettingChange = (key, value) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    localStorage.setItem('opendayz_settings', JSON.stringify(updated));
  };

  const toggleFavorite = (e, addr) => {
    e.stopPropagation();
    let updated;
    if (favorites.includes(addr)) {
      updated = favorites.filter(favAddr => favAddr !== addr);
    } else {
      updated = [...favorites, addr];
    }
    setFavorites(updated);
    localStorage.setItem('opendayz_favorites', JSON.stringify(updated));
  };

  const filteredServers = servers
    .filter(server => 
      server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.map.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.connect.includes(searchQuery)
    )
    .filter(server => !filterHideEmpty || server.players > 0)
    .filter(server => filterMap === 'All' || server.map.toLowerCase() === filterMap.toLowerCase())
    .filter(server => !filterFavoritesOnly || favorites.includes(server.connect));

  const displayedServers = filteredServers.slice(0, 1000);

  const handlePlay = async () => {
    if (!selectedServer) return;

    // Сборка списка модов (ID)
    const modsString = selectedServer.mods ? selectedServer.mods.map(mod => mod.id).join(';') : '';
    
    // Аргументы оптимизации
    let args = [];
    if (settings.nosplash) args.push("-nosplash");
    if (settings.nopause) args.push("-noPause");
    if (settings.windowed) args.push("-window");
    if (settings.nologs) args.push("-nologs");

    const launchArgs = args.join(' ');

    try {
      // Вызываем прямую системную команду Rust для запуска DayZ_x64.exe напрямую
      await invoke('launch_game_direct', {
        customPath: settings.customPath || '',
        connectIp: selectedServer.host,
        connectPort: selectedServer.game_port, // Порт подключения!
        mods: modsString,
        additionalArgs: launchArgs + " " + (settings.additionalArgs || '')
      });
    } catch (err) {
      alert(err);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-black text-white select-none overflow-hidden font-sans">
      
      {/* 1. Сайдбар навигации */}
      <div className="w-64 border-r border-border flex flex-col justify-between p-6 bg-black">
        <div className="space-y-8">
          <div className="flex items-center space-x-2.5">
            <div className="h-5 w-5 bg-white flex items-center justify-center rounded-[2px]">
              <span className="text-black font-black text-[9px] tracking-tighter">OD</span>
            </div>
            <span className="font-semibold tracking-widest text-[11px] text-white">OPENDAYZ</span>
          </div>

          <nav className="space-y-1">
            <button 
              onClick={() => setActiveTab('servers')}
              className={`w-full text-left px-3 py-2 rounded-sm text-xs font-medium border transition ${
                activeTab === 'servers' 
                  ? 'bg-[#111113] text-white border-[#202023]' 
                  : 'border-transparent text-muted hover:text-white'
              }`}
            >
              Игровые Серверы
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`w-full text-left px-3 py-2 rounded-sm text-xs font-medium border transition ${
                activeTab === 'settings' 
                  ? 'bg-[#111113] text-white border-[#202023]' 
                  : 'border-transparent text-muted hover:text-white'
              }`}
            >
              Настройки параметров
            </button>
          </nav>
        </div>

        <div className="text-[9px] text-muted tracking-tight border-t border-border pt-4">
          OpenDayZ Client v1.0.0
        </div>
      </div>

      {/* 2. Контентная область */}
      {activeTab === 'servers' ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Средняя колонка со списком серверов */}
          <div className="w-[450px] border-r border-border flex flex-col bg-[#040405]">
            <div className="p-4 border-b border-border bg-black space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="text-xs font-bold tracking-wider uppercase text-white">Список Серверов ({servers.length})</h2>
                <button 
                  onClick={fetchServers}
                  className="text-[9px] border border-border px-2 py-1 rounded-sm text-muted hover:text-white transition active:scale-95"
                >
                  Обновить
                </button>
              </div>
              
              <input 
                type="text" 
                placeholder="Поиск по названию или IP..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-panel border border-border px-3 py-2 text-xs rounded-sm focus:outline-none focus:border-zinc-700 placeholder-zinc-600 text-white font-mono"
              />

              <div className="flex justify-between items-center pt-1 gap-2">
                <select 
                  value={filterMap}
                  onChange={(e) => setFilterMap(e.target.value)}
                  className="bg-panel border border-border text-[11px] px-2 py-1.5 rounded-sm text-zinc-300 focus:outline-none focus:border-zinc-700 font-mono"
                >
                  <option value="All">Все карты</option>
                  <option value="Chernarus">Chernarus</option>
                  <option value="Sakhal">Sakhal (Frostline)</option>
                  <option value="Livonia">Livonia</option>
                  <option value="Namalsk">Namalsk</option>
                </select>

                <div className="flex gap-2">
                  <button 
                    onClick={() => setFilterHideEmpty(!filterHideEmpty)}
                    className={`text-[10px] border px-2 py-1 rounded-sm font-medium transition ${
                      filterHideEmpty 
                        ? 'border-white text-white bg-zinc-900' 
                        : 'border-border text-muted hover:text-white'
                    }`}
                  >
                    Скрыть пустые
                  </button>
                  <button 
                    onClick={() => setFilterFavoritesOnly(!filterFavoritesOnly)}
                    className={`text-[10px] border px-2 py-1 rounded-sm font-medium transition flex items-center gap-1 ${
                      filterFavoritesOnly 
                        ? 'border-white text-white bg-zinc-900' 
                        : 'border-border text-muted hover:text-white'
                    }`}
                  >
                    ★ Избранное
                  </button>
                </div>
              </div>
            </div>

            {/* СПИСОК С КРАСИВЫМ СКРОЛЛБАРОМ */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
              {loading ? (
                <div className="h-full flex items-center justify-center">
                  <span className="text-[10px] text-muted tracking-widest animate-pulse uppercase">Загрузка серверов...</span>
                </div>
              ) : displayedServers.length > 0 ? (
                displayedServers.map((srv) => (
                  <div 
                    key={srv.id}
                    onClick={() => selectAndLoadServer(srv)}
                    className={`p-3 rounded-sm cursor-pointer transition-all border text-left flex justify-between items-center ${
                      selectedServer?.id === srv.id 
                        ? 'bg-[#111113] border-zinc-700' 
                        : 'border-transparent hover:bg-[#09090b] hover:border-border'
                    } ${srv.is_featured ? 'border-zinc-800 bg-[#09090b]' : ''}`}
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <button onClick={(e) => toggleFavorite(e, srv.connect)} className="text-sm focus:outline-none transition active:scale-90">
                          {favorites.includes(srv.connect) ? <span className="text-white">★</span> : <span className="text-zinc-800 hover:text-zinc-500">★</span>}
                        </button>
                        <h3 className="text-xs font-semibold text-zinc-200 truncate leading-tight uppercase flex items-center gap-1.5">
                          {srv.name}
                          {srv.is_modded && (
                            <span className="text-[8px] bg-zinc-900 text-zinc-500 border border-zinc-800 px-1 py-0.5 rounded-[1px] font-mono whitespace-nowrap">MOD</span>
                          )}
                        </h3>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] text-muted mt-2 font-mono">
                        <span>Карта: <strong className="text-zinc-400">{srv.map}</strong></span>
                        <span className="truncate">IP: {srv.connect}</span>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-zinc-400 whitespace-nowrap bg-panel border border-border px-2 py-1 rounded-[2px]">
                      {srv.players}/{srv.max_players}
                    </span>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted">
                  Серверы не найдены
                </div>
              )}
            </div>
          </div>

          {/* Правая детальная карточка сервера */}
          <div className="flex-1 flex flex-col justify-between p-8 bg-panel">
            {selectedServer ? (
              <>
                <div className="space-y-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[9px] bg-[#141416] text-zinc-400 border border-border px-2.5 py-1 rounded-sm uppercase tracking-widest font-mono">
                        {selectedServer.status === 'online' ? '● ONLINE' : '○ OFFLINE'}
                      </span>
                      <h1 className="text-xl font-extrabold tracking-tight mt-4 text-white uppercase leading-snug">
                        {selectedServer.name}
                      </h1>
                      <p className="text-xs text-muted mt-1 font-mono">Адрес подключения: {selectedServer.connect}</p>
                    </div>
                    <button 
                      onClick={(e) => toggleFavorite(e, selectedServer.connect)}
                      className="text-lg border border-border p-2.5 rounded-sm hover:bg-black transition active:scale-95"
                    >
                      {favorites.includes(selectedServer.connect) ? <span className="text-white">★</span> : <span className="text-zinc-600 hover:text-zinc-400">★</span>}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-y border-border py-4">
                    <div>
                      <span className="text-[9px] text-muted uppercase tracking-wider">Текущий Онлайн</span>
                      <p className="text-base font-mono font-bold mt-1 text-white">{selectedServer.players} / {selectedServer.max_players}</p>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted uppercase tracking-wider">Игровая Карта</span>
                      <p className="text-base font-bold mt-1 text-white uppercase">{selectedServer.map}</p>
                    </div>
                  </div>

                  {/* СПИСОК МОДОВ С ПОДДЕРЖКОЙ UDP ЗАПРОСА */}
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted mb-3">
                      Требуемые моды {selectedServer.is_modded && (selectedServer.mods ? `(${selectedServer.mods.length})` : '')}
                    </h3>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2 pl-3 border-l border-zinc-800 custom-scrollbar">
                      {loadingMods ? (
                        <span className="text-xs text-muted tracking-widest animate-pulse font-mono font-bold text-white">ЗАПРОС МОДОВ ПО UDP...</span>
                      ) : !selectedServer.is_modded ? (
                        <p className="text-xs text-muted">Ванильный сервер (моды не требуются)</p>
                      ) : selectedServer.mods && selectedServer.mods.length > 0 ? (
                        selectedServer.mods.map((mod) => (
                          <div key={mod.id} className="flex justify-between items-center text-xs text-zinc-300">
                            <span className="font-mono">{mod.name}</span>
                            <span className="text-[9px] text-zinc-600 font-mono">ID: {mod.id}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-zinc-500 italic">Не удалось получить моды напрямую по UDP. Проверьте Брандмауэр Windows.</p>
                      )}
                    </div>
                  </div>
                </div>

                <button 
                  onClick={handlePlay}
                  disabled={selectedServer.status !== 'online'}
                  className="w-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-900 disabled:text-zinc-700 font-bold text-xs py-3.5 rounded-sm uppercase tracking-widest transition active:scale-[0.99] border border-white"
                >
                  ПОДКЛЮЧИТЬСЯ К СЕРВЕРУ
                </button>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-muted">
                Выберите сервер из списка
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ВКЛАДКА НАСТРОЕК */
        <div className="flex-1 p-10 bg-panel space-y-8 overflow-y-auto custom-scrollbar">
          <div>
            <h1 className="text-lg font-bold uppercase tracking-wider">Настройки параметров запуска</h1>
            <p className="text-xs text-muted mt-1">Определите параметры оптимизации производительности при запуске DayZ</p>
          </div>

          <div className="max-w-2xl space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div onClick={() => handleSettingChange('nosplash', !settings.nosplash)} className="p-4 border border-border bg-black rounded-sm cursor-pointer hover:border-zinc-700 transition flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider">Без заставки (-nosplash)</h3>
                  <p className="text-[10px] text-muted mt-1">Отключает интро-логотипы при запуске игры</p>
                </div>
                <div className={`h-4 w-4 border flex items-center justify-center rounded-[2px] transition ${settings.nosplash ? 'bg-white border-white' : 'border-zinc-800 bg-transparent'}`}>
                  {settings.nosplash && <span className="text-black text-[9px] font-bold">✓</span>}
                </div>
              </div>

              <div onClick={() => handleSettingChange('nopause', !settings.nopause)} className="p-4 border border-border bg-black rounded-sm cursor-pointer hover:border-zinc-700 transition flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider">Не ставить на паузу (-noPause)</h3>
                  <p className="text-[10px] text-muted mt-1">Игра не останавливается при сворачивании (Alt+Tab)</p>
                </div>
                <div className={`h-4 w-4 border flex items-center justify-center rounded-[2px] transition ${settings.nopause ? 'bg-white border-white' : 'border-zinc-800 bg-transparent'}`}>
                  {settings.nopause && <span className="text-black text-[9px] font-bold">✓</span>}
                </div>
              </div>

              <div onClick={() => handleSettingChange('windowed', !settings.windowed)} className="p-4 border border-border bg-black rounded-sm cursor-pointer hover:border-zinc-700 transition flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider">Оконный режим (-window)</h3>
                  <p className="text-[10px] text-muted mt-1">Запускает DayZ в оконном режиме вместо полного экрана</p>
                </div>
                <div className={`h-4 w-4 border flex items-center justify-center rounded-[2px] transition ${settings.windowed ? 'bg-white border-white' : 'border-zinc-800 bg-transparent'}`}>
                  {settings.windowed && <span className="text-black text-[9px] font-bold">✓</span>}
                </div>
              </div>

              <div onClick={() => handleSettingChange('nologs', !settings.nologs)} className="p-4 border border-border bg-black rounded-sm cursor-pointer hover:border-zinc-700 transition flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider">Отключить логи (-nologs)</h3>
                  <p className="text-[10px] text-muted mt-1">Повышает FPS за счет отключения записи лог-файлов на диск</p>
                </div>
                <div className={`h-4 w-4 border flex items-center justify-center rounded-[2px] transition ${settings.nologs ? 'bg-white border-white' : 'border-zinc-800 bg-transparent'}`}>
                  {settings.nologs && <span className="text-black text-[9px] font-bold">✓</span>}
                </div>
              </div>
            </div>

            {/* Путь к DayZ */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Путь к файлу DayZ_x64.exe (Оставьте пустым для автоопределения)</label>
              <input 
                type="text" 
                placeholder="Например: D:\SteamLibrary\steamapps\common\DayZ\DayZ_x64.exe"
                value={settings.customPath || ''}
                onChange={(e) => handleSettingChange('customPath', e.target.value)}
                className="w-full bg-black border border-border px-3 py-2 text-xs rounded-sm focus:outline-none focus:border-zinc-500 text-white font-mono"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Дополнительные аргументы командной строки</label>
              <input 
                type="text" 
                placeholder="Например: -cpuCount=4 -maxMem=8192"
                value={settings.additionalArgs}
                onChange={(e) => handleSettingChange('additionalArgs', e.target.value)}
                className="w-full bg-black border border-border px-3 py-2 text-xs rounded-sm focus:outline-none focus:border-zinc-500 text-white font-mono"
              />
              <p className="text-[9px] text-muted">Параметры будут автоматически добавлены в конец строки запуска.</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}