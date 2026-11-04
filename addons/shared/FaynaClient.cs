// Fayna Sync: רכיב השליחה המשותף לתוספים של ATAS ו־Quantower.
// אוסף ביצועים, שולח אותם במנות כל כמה שניות, ושומר בדיסק את מה שעוד לא נשלח
// כדי ששום דבר לא יאבד אם הפלטפורמה נסגרת או האינטרנט נופל.
// נשלחים רק נתוני ביצוע: סימבול, כיוון, כמות, מחיר, זמן ועמלה.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace FaynaSync
{
    public sealed class FaynaFill
    {
        public string id { get; set; } = "";
        public string? orderId { get; set; }
        public string account { get; set; } = "";
        public string symbol { get; set; } = "";
        public string side { get; set; } = "";      // "buy" | "sell"
        public decimal qty { get; set; }
        public decimal price { get; set; }
        public string time { get; set; } = "";      // ISO 8601, UTC
        public decimal? commission { get; set; }
    }

    public sealed class FaynaClient : IDisposable
    {
        public const string DefaultUrl = "https://us-central1-fayna-trading.cloudfunctions.net/syncIngest";
        public const string Version = "1.0.0";
        static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };

        readonly string _source;
        readonly object _lock = new object();
        readonly Dictionary<string, FaynaFill> _pending = new Dictionary<string, FaynaFill>();
        readonly HashSet<string> _sent = new HashSet<string>();
        readonly Timer _timer;
        readonly string _file;
        int _busy;

        public string Key { get; set; } = "";
        public string Url { get; set; } = DefaultUrl;
        public string LastStatus { get; private set; } = "ממתין לביצועים";
        public DateTime? LastSuccessUtc { get; private set; }
        public event Action<string>? Log;

        public FaynaClient(string source, int intervalSeconds = 10)
        {
            _source = source;
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FaynaSync");
            Directory.CreateDirectory(dir);
            _file = Path.Combine(dir, $"pending-{source}.json");
            Load();
            _timer = new Timer(_ => _ = FlushAsync(), null, TimeSpan.FromSeconds(3), TimeSpan.FromSeconds(Math.Max(5, intervalSeconds)));
        }

        public void Add(FaynaFill f)
        {
            if (string.IsNullOrWhiteSpace(f.id)) return;
            var k = f.account + "|" + f.id;
            lock (_lock)
            {
                if (_sent.Contains(k) || _pending.ContainsKey(k)) return;
                _pending[k] = f;
            }
            Save();
        }

        public async Task FlushAsync()
        {
            if (string.IsNullOrWhiteSpace(Key) || Interlocked.Exchange(ref _busy, 1) == 1) return;
            try
            {
                List<KeyValuePair<string, FaynaFill>> batch;
                lock (_lock) batch = _pending.Take(500).ToList();
                if (batch.Count == 0) return;
                var body = JsonSerializer.Serialize(new { source = _source, version = Version, fills = batch.Select(b => b.Value) });
                using var req = new HttpRequestMessage(HttpMethod.Post, Url) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
                req.Headers.TryAddWithoutValidation("Authorization", "Bearer " + Key.Trim());
                using var res = await Http.SendAsync(req).ConfigureAwait(false);
                var text = await res.Content.ReadAsStringAsync().ConfigureAwait(false);
                if ((int)res.StatusCode == 401) { LastStatus = "המפתח לא תקין או נותק — צור מפתח חדש בפיינה"; Log?.Invoke(LastStatus); return; }
                if (!res.IsSuccessStatusCode) { LastStatus = $"שגיאת שרת {(int)res.StatusCode}, ננסה שוב"; Log?.Invoke(LastStatus + " " + text); return; }
                lock (_lock) foreach (var b in batch) { _pending.Remove(b.Key); _sent.Add(b.Key); }
                Save();
                LastSuccessUtc = DateTime.UtcNow;
                LastStatus = $"נשלחו {batch.Count} ביצועים";
                Log?.Invoke(LastStatus + " " + text);
            }
            catch (Exception e) { LastStatus = "אין חיבור, ננסה שוב"; Log?.Invoke(LastStatus + ": " + e.Message); }
            finally { Interlocked.Exchange(ref _busy, 0); }
        }

        void Save()
        {
            try { List<FaynaFill> list; lock (_lock) list = _pending.Values.ToList(); File.WriteAllText(_file, JsonSerializer.Serialize(list)); }
            catch { /* disk is best-effort; the server also dedupes */ }
        }
        void Load()
        {
            try
            {
                if (!File.Exists(_file)) return;
                var list = JsonSerializer.Deserialize<List<FaynaFill>>(File.ReadAllText(_file)) ?? new List<FaynaFill>();
                lock (_lock) foreach (var f in list) _pending[f.account + "|" + f.id] = f;
            }
            catch { }
        }

        public static string Iso(DateTime t)
        {
            var u = t.Kind == DateTimeKind.Local ? t.ToUniversalTime() : DateTime.SpecifyKind(t, DateTimeKind.Utc);
            return u.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");
        }

        public void Dispose()
        {
            _timer.Dispose();
            try { FlushAsync().Wait(TimeSpan.FromSeconds(5)); } catch { }
            Save();
        }
    }
}
