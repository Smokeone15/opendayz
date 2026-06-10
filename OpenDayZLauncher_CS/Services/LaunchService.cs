using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace OpenDayZLauncher.Services
{
    public class LaunchService
    {
        public void LaunchGame(string ip, int port, string mods, string additionalArgs)
        {
            string exePath = GetDayZPath();
            if (string.IsNullOrEmpty(exePath) || !File.Exists(exePath))
            {
                throw new Exception("DayZ_x64.exe не найден. Пожалуйста, проверьте настройки.");
            }

            string arguments = $"-connect={ip} -port={port}";
            if (!string.IsNullOrEmpty(mods))
            {
                arguments += $" \"-mod={mods}\"";
            }
            arguments += $" {additionalArgs}";

            Process.Start(new ProcessStartInfo
            {
                FileName = exePath,
                Arguments = arguments,
                UseShellExecute = true,
                Verb = "runas"
            });
        }

        public string GetDayZPath()
        {
            // 1. Из реестра
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                using var key = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam");
                if (key?.GetValue("SteamPath") is string steamPath)
                {
                    string path = Path.Combine(steamPath, "steamapps", "common", "DayZ", "DayZ_x64.exe");
                    if (File.Exists(path)) return path;
                }
            }

            // 2. Стандартные пути
            string[] commonPaths = {
                @"C:\Program Files (x86)\Steam\steamapps\common\DayZ\DayZ_x64.exe",
                @"D:\SteamLibrary\steamapps\common\DayZ\DayZ_x64.exe",
                @"E:\SteamLibrary\steamapps\common\DayZ\DayZ_x64.exe"
            };

            foreach (var p in commonPaths)
            {
                if (File.Exists(p)) return p;
            }

            return string.Empty;
        }
    }
}
