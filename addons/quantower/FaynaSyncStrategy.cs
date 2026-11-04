// Fayna Sync for Quantower — sends every execution on all connections to the
// Fayna Trading journal. Run it once from the Strategies Manager with your pairing key.
using System;
using TradingPlatform.BusinessLayer;

namespace FaynaSync
{
    public class FaynaSyncStrategy : Strategy
    {
        [InputParameter("Pairing key (from Fayna → Settings → Connections)", 10)]
        public string PairingKey = "";

        [InputParameter("Send history from the last N days on start", 20, 0, 30, 1, 0)]
        public int BackfillDays = 3;

        FaynaClient? _client;

        public FaynaSyncStrategy() : base()
        {
            Name = "Fayna Sync";
            Description = "Sends your executions to the Fayna Trading journal. Read-only: it never places orders.";
        }

        protected override void OnRun()
        {
            _client = new FaynaClient("quantower") { Key = (PairingKey ?? "").Trim() };
            _client.Log += m => Log(m, StrategyLoggingLevel.Info);
            Core.Instance.TradeAdded += OnTrade;
            if (BackfillDays > 0)
            {
                try
                {
                    var p = new TradesHistoryRequestParameters { From = DateTime.UtcNow.AddDays(-BackfillDays), To = DateTime.UtcNow };
                    foreach (var t in Core.Instance.GetTrades(p)) OnTrade(t);
                }
                catch (Exception e) { Log("History not available on this connection: " + e.Message, StrategyLoggingLevel.Info); }
            }
        }

        void OnTrade(Trade t)
        {
            if (_client == null || t == null || t.Quantity <= 0 || t.Price <= 0) return;
            var account = t.Account?.Name ?? t.Account?.Id ?? "";
            var symbol = t.Symbol?.Name ?? "";
            if (account.Length == 0 || symbol.Length == 0 || string.IsNullOrEmpty(t.Id)) return;
            _client.Add(new FaynaFill
            {
                id = t.Id,
                orderId = t.OrderId,
                account = account,
                symbol = symbol,
                side = t.Side == Side.Buy ? "buy" : "sell",
                qty = (decimal)t.Quantity,
                price = (decimal)t.Price,
                time = FaynaClient.Iso(t.DateTime),
                commission = t.Fee != null ? (decimal?)Math.Abs(t.Fee.Value) : null,
            });
        }

        protected override void OnStop()
        {
            Core.Instance.TradeAdded -= OnTrade;
            _client?.Dispose();
            _client = null;
        }
    }
}
