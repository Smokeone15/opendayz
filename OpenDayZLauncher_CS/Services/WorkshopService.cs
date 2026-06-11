using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using OpenDayZLauncher.Models;

namespace OpenDayZLauncher.Services
{
    public class WorkshopService
    {
        private readonly HttpClient _httpClient = new HttpClient();

        public async Task ResolveModNamesAsync(List<Mod> mods)
        {
            var ids = mods.Where(m => string.IsNullOrEmpty(m.Name)).Select(m => m.Id).ToList();
            if (!ids.Any()) return;

            try
            {
                var content = new FormUrlEncodedContent(new[]
                {
                    new KeyValuePair<string, string>("itemcount", ids.Count.ToString())
                }.Concat(ids.Select((id, i) => new KeyValuePair<string, string>($"publishedfileids[{i}]", id))));

                var response = await _httpClient.PostAsync("https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/", content);
                var json = JObject.Parse(await response.Content.ReadAsStringAsync());

                var details = json["response"]?["publishedfiledetails"];
                if (details != null)
                {
                    foreach (var d in details)
                    {
                        var id = d["publishedfileid"]?.ToString();
                        var name = d["title"]?.ToString();
                        var mod = mods.FirstOrDefault(m => m.Id == id);
                        if (mod != null && !string.IsNullOrEmpty(name))
                        {
                            mod.Name = name;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Workshop error: {ex.message}");
            }
        }

        // В DayZ лаунчерах "закачка" обычно происходит через подписку в Steam
        public void SubscribeToMod(string modId)
        {
            // Открывает страницу мода в Steam для подписки (простейший способ без интеграции SDK)
            Process.Start(new ProcessStartInfo
            {
                FileName = $"steam://url/CommunityFilePage/{modId}",
                UseShellExecute = true
            });
        }
    }
}
