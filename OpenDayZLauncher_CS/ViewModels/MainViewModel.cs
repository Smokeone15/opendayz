using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Input;
using OpenDayZLauncher.Models;
using OpenDayZLauncher.Services;

namespace OpenDayZLauncher.ViewModels
{
    public class MainViewModel : INotifyPropertyChanged
    {
        private readonly SteamApiService _apiService = new();
        private readonly LaunchService _launchService = new();
        private readonly QueryService _queryService = new();
        private readonly WorkshopService _workshopService = new();

        private List<Server> _allServers = new();

        public ObservableCollection<Server> DisplayedServers { get; } = new();
        public ObservableCollection<string> Maps { get; } = new()
        {
            "Все карты", "Chernarus", "Livonia", "Sakhal", "Namalsk", "DeerIsle",
            "Esseker", "Takistan", "Banov", "Chiemsee", "Rostow", "Pripyat"
        };

        private string _selectedMap = "Все карты";
        public string SelectedMap
        {
            get => _selectedMap;
            set { _selectedMap = value; OnPropertyChanged(); ApplyFilters(); }
        }

        private Server? _selectedServer;
        public Server? SelectedServer
        {
            get => _selectedServer;
            set
            {
                _selectedServer = value;
                OnPropertyChanged();
                if (value != null) _ = LoadServerDetails(value);
            }
        }

        private string _searchQuery = "";
        public string SearchQuery
        {
            get => _searchQuery;
            set { _searchQuery = value; OnPropertyChanged(); ApplyFilters(); }
        }

        public ICommand RefreshCommand { get; }
        public ICommand JoinCommand { get; }

        public MainViewModel()
        {
            RefreshCommand = new RelayCommand(async () => await RefreshServers());
            JoinCommand = new RelayCommand(() => JoinServer());
            _ = RefreshServers();
        }

        private async Task LoadServerDetails(Server srv)
        {
            if (!srv.IsModded) return;
            // В C# версии мы опрашиваем UDP прямо с клиента (как в DZSA)
            var mods = await _queryService.GetServerModsAsync(srv.Ip, srv.QueryPort);
            if (mods.Any())
            {
                await _workshopService.ResolveModNamesAsync(mods);
                srv.Mods = mods;
                OnPropertyChanged(nameof(SelectedServer));
            }
        }

        public async Task RefreshServers()
        {
            _allServers = await _apiService.FetchAllServersAsync();
            ApplyFilters();
        }

        private void ApplyFilters()
        {
            var filtered = _allServers.AsEnumerable();

            if (!string.IsNullOrEmpty(SearchQuery))
                filtered = filtered.Where(s => s.Name.Contains(SearchQuery, StringComparison.OrdinalIgnoreCase) || s.Address.Contains(SearchQuery));

            if (SelectedMap != "Все карты")
                filtered = filtered.Where(s => s.Map.Contains(SelectedMap, StringComparison.OrdinalIgnoreCase));

            var result = filtered.Take(1000).ToList();

            DisplayedServers.Clear();
            foreach (var s in result) DisplayedServers.Add(s);
        }

        private void JoinServer()
        {
            if (SelectedServer == null) return;
            string mods = string.Join(";", SelectedServer.Mods.Select(m => "@" + (string.IsNullOrEmpty(m.Name) ? m.Id : m.Name)));
            _launchService.LaunchGame(SelectedServer.Ip, SelectedServer.GamePort, mods, "");
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged([CallerMemberName] string? name = null) =>
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
