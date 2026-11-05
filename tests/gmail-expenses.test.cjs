'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const g = require('../fayna-gmail-expenses.js');

const mk = (from, subject, body, date = '2026-10-20') => ({ id: 'm' + Math.random(), from, subject, body, date });

test('Stripe receipt for Apex: amount paid, evaluation', () => {
  const r = g.classify(mk('Apex Trader Funding <receipts+abc@stripe.com>', 'Your receipt from Apex Trader Funding #2314-5521',
    'Receipt from Apex Trader Funding\nAmount paid $167.00\nDate paid Oct 20, 2026\nSummary\n50K Full Evaluation $167.00\nAmount charged $167.00'));
  assert.equal(r.ok, true);
  assert.equal(r.item.company, 'Apex Trader Funding');
  assert.equal(r.item.amount, 167);
  assert.equal(r.item.cat, 'מבחן');
  assert.equal(r.item.sure, true);
});

test('Bulenox reset with subtotal and total', () => {
  const r = g.classify(mk('Bulenox <info@bulenox.com>', 'Order confirmation #88213',
    'Thank you for your order\nAccount Reset 50K   $78.00\nSubtotal $78.00\nDiscount -$7.80\nTotal $70.20'));
  assert.equal(r.ok, true);
  assert.equal(r.item.amount, 70.2);
  assert.equal(r.item.cat, 'ריסט');
});

test('MFFU activation fee is live', () => {
  const r = g.classify(mk('support@myfundedfutures.com', 'Payment confirmation', 'Your payment for the Sim Funded activation fee was received. Total: USD 129.00'));
  assert.equal(r.ok, true);
  assert.equal(r.item.cat, 'לייב');
  assert.equal(r.item.amount, 129);
});

test('TradingView subscription is a tool, thousands separator', () => {
  const r = g.classify(mk('TradingView <noreply@tradingview.com>', 'Your TradingView receipt', 'Premium annual plan\nTotal paid $1,199.40'));
  assert.equal(r.item.cat, 'כלי');
  assert.equal(r.item.amount, 1199.4);
});

test('ILS receipt keeps currency', () => {
  const r = g.classify(mk('Lucid Trading <billing@lucidtrading.com>', 'קבלה על תשלום', 'סה"כ לתשלום ₪ 520.00'));
  assert.equal(r.ok, true);
  assert.equal(r.item.currency, 'ILS');
  assert.equal(r.item.amount, 520);
});

test('promotions, payouts and failed payments are skipped', () => {
  assert.equal(g.classify(mk('Apex <news@apextraderfunding.com>', '90% OFF all evaluations this weekend!', 'Get a 50K for $16.70 only')).ok, false);
  assert.equal(g.classify(mk('Bulenox <info@bulenox.com>', 'Your payout has been processed', 'Payout amount $1,500.00')).ok, false);
  assert.equal(g.classify(mk('receipts@stripe.com', 'Payment failed for Topstep', 'Amount $49.00')).ok, false);
  assert.equal(g.classify(mk('friend@gmail.com', 'Receipt', 'Total $20.00')).ok, false);
});

test('processor mail is matched by body only for processors', () => {
  const r = g.classify(mk('service@paypal.com', 'Receipt for your payment', 'You sent a payment of $99.00 USD to Tradeify LLC'));
  assert.equal(r.ok, true);
  assert.equal(r.item.company, 'Tradeify');
  assert.equal(r.item.amount, 99);
});

test('number parsing', () => {
  assert.equal(g.parseNum('1.234,56'), 1234.56);
  assert.equal(g.parseNum('1,234'), 1234);
  assert.equal(g.parseNum('12,50'), 12.5);
});

test('html receipts become readable text', () => {
  const t = g.htmlToText('<table><tr><td>Total</td><td>&#36;55.00</td></tr></table>');
  assert.match(t, /Total \$55\.00/);
  const r = g.classify(mk('Topstep <billing@topstep.com>', 'Your invoice', t));
  assert.equal(r.item.amount, 55);
});
