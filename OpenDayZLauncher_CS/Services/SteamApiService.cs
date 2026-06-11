using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using OpenDayZLauncher.Models;

namespace OpenDayZLauncher.Services
{
    public class SteamApiService
    {
        // Get it from: https://steamcommunity.com/dev/apikey
        private const string ApiKey = "YOUR_STEAM_API_KEY_HERE";
        private readonly HttpClient _httpClient = new HttpClient();

        public async Task<List<Server>> FetchAllServersAsync()
        {
            var filters = new[]
            {
                "\\appid\\221100\\noplayers\\1",
                "\\appid\\221100\\nor\\1\\noplayers\\1",
                "\\appid\\221100\\region\\0",
                "\\appid\\221100\\region\\255",
                "\\appid\\221100\\map\\chernarusplus",
                "\\appid\\221100\\map\\livonia",
                "\\appid\\221100\\map\\sakhal",
                "\\appid\\221100\\nor\\3\\map\\chernarusplus\\map\\livonia\\map\\sakhal"
            };

            var tasks = filters.Select(f => FetchServersWithFilter(f));
            var results = await Task.WhenAll(tasks);

            var uniqueServers = new Dictionary<string, Server>();

            foreach (var serverList in results)
            {
                foreach (var srv in serverList)
                {
                    if (!uniqueServers.ContainsKey(srv.Address))
                    {
                        uniqueServers[srv.Address] = srv;
                    }
                }
            }

            return uniqueServers.Values.OrderByDescending(s => s.Players).ToList();
        }

        private async Task<List<Server>> FetchServersWithFilter(string filter)
        {
            try
            {
                string url = $"https://api.steampowered.com/IGameServersService/GetServerList/v1/?key={ApiKey}&filter={filter}&limit=10000";
                var response = await _httpClient.GetStringAsync(url);
                var json = JObject.Parse(response);
                var servers = json["response"]?["servers"];

                if (servers == null) return new List<Server>();

                return servers.Select(s => new Server
                {
                    Address = s["addr"]?.ToString() ?? "",
                    Ip = s["addr"]?.ToString().Split(':')[0] ?? "",
                    QueryPort = int.TryParse(s["addr"]?.ToString().Split(':')[1], out int qp) ? qp : 0,
                    GamePort = s["gameport"]?.Value<int>() ?? 2302,
                    Name = s["name"]?.ToString() ?? "Unknown",
                    Players = s["players"]?.Value<int>() ?? 0,
                    MaxPlayers = s["max_players"]?.Value<int>() ?? 0,
                    Map = s["map"]?.ToString() ?? "Chernarus",
                    IsModded = s["gametype"]?.ToString().Contains("mod") ?? false
                }).ToList();
            }
            catch
            {
                return new List<Server>();
            }
        }
    }
}
