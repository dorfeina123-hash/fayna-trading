// Fayna Sync for ATAS — sends every execution (all connected accounts) to the
// Fayna Trading journal. Add it to any one chart and paste your pairing key.
using System;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using ATAS.DataFeedsCore;
using ATAS.Indicators;

namespace FaynaSync
{
    [DisplayName("Fayna Sync")]
    [Description("Sends your executions to the Fayna Trading journal. Read-only: it never places orders.")]
    public class FaynaSyncIndicator : Indicator
    {
        FaynaClient? _client;
        string _key = "";
        bool _backfilled;

        [Display(Name = "Pairing key (from Fayna → Settings → Connections)", GroupName = "Fayna Sync", Order = 10)]
        public string PairingKey
        {
            get => _key;
            set { _key = (value ?? "").Trim(); if (_client != null) _client.Key = _key; _ = _client?.FlushAsync(); }
        }

        [Display(Name = "Status", GroupName = "Fayna Sync", Order = 20)]
        [ReadOnly(true)]
        public string Status => _client == null ? "Not started" : _client.LastStatus;

        public FaynaSyncIndicator()
        {
            DataSeries[0].IsHidden = true;
        }

        protected override void OnInitialize()
        {
            _client ??= new FaynaClient("atas") { Key = _key };
        }

        protected override void OnCalculate(int bar, decimal value)
        {
            if (_backfilled) return;
            _backfilled = true;
            _client ??= new FaynaClient("atas") { Key = _key };
            // Executions ATAS already holds for this session (sent once; the server dedupes).
            var tm = TradingManager;
            if (tm?.MyTrades == null) return;
            foreach (var t in tm.MyTrades) Enqueue(t);
        }

        protected override void OnNewMyTrade(MyTrade myTrade) => Enqueue(myTrade);

        void Enqueue(MyTrade? t)
        {
            if (t == null || _client == null || t.Volume <= 0 || t.Price <= 0) return;
            var account = t.AccountID ?? t.Portfolio?.AccountID ?? "";
            var symbol = t.SecurityId ?? t.Security?.SecurityId ?? "";
            if (account.Length == 0 || symbol.Length == 0 || string.IsNullOrEmpty(t.Id)) return;
            _client.Add(new FaynaFill
            {
                id = t.Id,
                orderId = t.OrderId,
                account = account,
                symbol = symbol,
                side = t.OrderDirection == OrderDirections.Buy ? "buy" : "sell",
                qty = t.Volume,
                price = t.Price,
                time = FaynaClient.Iso(t.Time),
                commission = t.Commission,
            });
        }

        protected override void OnDispose()
        {
            _client?.Dispose();
            _client = null;
        }
    }
}
