using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;
using OpenDayZLauncher.Models;

namespace OpenDayZLauncher.Services
{
    public class QueryService
    {
        public async Task<List<Mod>> GetServerModsAsync(string ip, int port)
        {
            var mods = new List<Mod>();
            try
            {
                using var client = new UdpClient();
                client.Client.ReceiveTimeout = 3000;
                client.Connect(ip, port);

                // 1. A2S_RULES Request
                byte[] header = { 0xFF, 0xFF, 0xFF, 0xFF, 0x56, 0xFF, 0xFF, 0xFF, 0xFF };
                await client.SendAsync(header, header.Length);

                var response = await client.ReceiveAsync();
                if (response.Buffer[4] == 0x41) // Challenge response
                {
                    byte[] challengeRequest = new byte[9];
                    Array.Copy(new byte[] { 0xFF, 0xFF, 0xFF, 0xFF, 0x56 }, challengeRequest, 5);
                    Array.Copy(response.Buffer, 5, challengeRequest, 5, 4);
                    await client.SendAsync(challengeRequest, challengeRequest.Length);
                    response = await client.ReceiveAsync();
                }

                if (response.Buffer[4] == 0x45) // Rules response
                {
                    string data = Encoding.UTF8.GetString(response.Buffer);
                    // Простой парсинг modList или modNames из строки
                    int modIdx = data.IndexOf("modList");
                    if (modIdx == -1) modIdx = data.IndexOf("modNames");

                    if (modIdx != -1)
                    {
                        string modStr = data.Substring(modIdx).Split('\0')[1];
                        foreach (var m in modStr.Split(';'))
                        {
                            if (string.IsNullOrEmpty(m)) continue;
                            var parts = m.Split(':');
                            mods.Add(new Mod {
                                Id = parts[0],
                                Name = parts.Length > 1 ? parts[1] : $"Mod ({parts[0]})"
                            });
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"UDP Query Error: {ex.Message}");
            }
            return mods;
        }
    }
}
