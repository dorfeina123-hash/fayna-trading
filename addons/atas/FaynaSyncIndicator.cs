// Fayna Sync ל־ATAS: שולח כל ביצוע (מכל החשבונות המחוברים) ליומן Fayna Trading.
// מוסיפים אותו לגרף אחד ומדביקים את מפתח החיבור.
using System;
using System.ComponentModel;
using ATAS.DataFeedsCore;
using ATAS.Indicators;

namespace FaynaSync
{
    [DisplayName("Fayna Sync")]
    [Description("שולח את הביצועים שלך ליומן Fayna Trading. קריאה בלבד: לא מבצע פקודות.")]
    public class FaynaSyncIndicator : Indicator
    {
        FaynaClient? _client;
        string _key = "";
        bool _backfilled;

        [DisplayName("מפתח חיבור (מפיינה ← הגדרות ← חיבורים)")]
        [Category("Fayna Sync")]
        public string PairingKey
        {
            get => _key;
            set { _key = (value ?? "").Trim(); if (_client != null) _client.Key = _key; _ = _client?.FlushAsync(); }
        }

        [DisplayName("מצב")]
        [Category("Fayna Sync")]
        [ReadOnly(true)]
        public string Status => _client == null ? "לא הופעל" : _client.LastStatus;

        protected override void OnInitialize()
        {
            _client ??= new FaynaClient("atas") { Key = _key };
        }

        protected override void OnCalculate(int bar, decimal value)
        {
            if (_backfilled) return;
            _backfilled = true;
            _client ??= new FaynaClient("atas") { Key = _key };
            // ביצועים שכבר קיימים ב־ATAS מהסשן הנוכחי (נשלחים פעם אחת; השרת מסנן כפילויות).
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
