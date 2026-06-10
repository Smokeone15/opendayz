namespace OpenDayZLauncher.Models
{
    public class Server
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty; // IP:QueryPort
        public string Ip { get; set; } = string.Empty;
        public int QueryPort { get; set; }
        public int GamePort { get; set; }
        public int Players { get; set; }
        public int MaxPlayers { get; set; }
        public string Map { get; set; } = string.Empty;
        public bool IsModded { get; set; }
        public List<Mod> Mods { get; set; } = new();
        public bool IsOnline { get; set; } = true;
        public bool IsFeatured { get; set; }
    }

    public class Mod
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
    }
}
