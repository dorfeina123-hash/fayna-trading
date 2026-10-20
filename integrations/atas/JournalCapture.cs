using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ATAS.DataFeedsCore;
using ATAS.Indicators;

namespace Fayna.Atas;

// Diagnostic capture only: never places orders and never makes network requests.
// Account selection is explicit. ATAS journal/history coverage must be verified
// against the running platform before this is promoted to a live connector.
[DisplayName("Fayna journal capture (preview)")]
public sealed class JournalCapture : Indicator
{
    private readonly object _gate = new();
    private DateTime _lastScan = DateTime.MinValue;
    private readonly Dictionary<string, string> _seen = new();

    [DisplayName("Enable local capture")]
    public bool CaptureEnabled { get; set; }

    [DisplayName("Exact ATAS account ID")]
    public string AccountId { get; set; } = "";

    [Browsable(false)]
    public string CaptureStatus { get; private set; } = "Disabled";

    protected override void OnCalculate(int bar, decimal value)
    {
        if (!CaptureEnabled || string.IsNullOrWhiteSpace(AccountId)) return;
        lock (_gate)
        {
            if (DateTime.UtcNow - _lastScan < TimeSpan.FromSeconds(5)) return;
            _lastScan = DateTime.UtcNow;
        }
        try
        {
            // This is the history exposed by this chart's TradingManager,
            // not a promise of complete account history from the journal.
            if (TradingManager is { } manager)
                foreach (var trade in manager.MyTrades.ToArray()) Capture(trade);
        }
        catch (Exception ex) { CaptureStatus = "Scan failed: " + ex.GetType().Name; }
    }

    protected override void OnNewMyTrade(MyTrade myTrade) => Capture(myTrade);

    private void Capture(MyTrade trade)
    {
        if (!CaptureEnabled || string.IsNullOrWhiteSpace(AccountId)) return;
        var account = trade.AccountID ?? trade.Portfolio?.AccountID;
        if (!string.Equals(account, AccountId, StringComparison.Ordinal)) return;
        if (string.IsNullOrWhiteSpace(trade.Id) || string.IsNullOrWhiteSpace(trade.SecurityId))
        { CaptureStatus = "Missing stable trade/security ID"; return; }
        try
        {
            var data = new
            {
                schemaVersion = 1, provider = "atas", accountId = account,
                route = trade.Route, fillId = trade.Id, orderId = trade.OrderId,
                instrument = trade.SecurityId, side = trade.OrderDirection.ToString(),
                price = trade.Price.ToString(CultureInfo.InvariantCulture),
                quantity = trade.Volume.ToString(CultureInfo.InvariantCulture),
                commission = trade.Commission?.ToString(CultureInfo.InvariantCulture),
                commissionCurrency = trade.CommissionCurrency,
                // Preserve unknown timestamps; never assume the PC zone is ATAS's zone.
                sourceTime = trade.Time.ToString("O", CultureInfo.InvariantCulture),
                sourceTimeKind = trade.Time.Kind.ToString(),
                occurredAt = trade.Time.Kind == DateTimeKind.Utc
                    ? trade.Time.ToString("O", CultureInfo.InvariantCulture) : null
            };
            var json = JsonSerializer.Serialize(data);
            var identity = JsonSerializer.Serialize(new[] { account, trade.Route, trade.Id });
            var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity)));
            var revision = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json)));
            lock (_gate)
            {
                if (_seen.TryGetValue(key, out var previous) && previous == revision) return;
                var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Fayna", "AtasPreview", "outbox");
                Directory.CreateDirectory(folder);
                var path = Path.Combine(folder, key + "-" + revision + ".json");
                // CreateNew retains correction revisions and is idempotent after restarts.
                try
                {
                    using var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
                    var bytes = Encoding.UTF8.GetBytes(json);
                    file.Write(bytes);
                    file.Flush(true);
                }
                catch (IOException) when (File.Exists(path))
                {
                    // Do not silently accept a partial/corrupt file from an interrupted write.
                    if (File.ReadAllText(path) != json) throw;
                }
                _seen[key] = revision;
                CaptureStatus = "Captured locally; not uploaded";
            }
        }
        catch (Exception ex) { CaptureStatus = "Capture failed: " + ex.GetType().Name; }
    }
}
