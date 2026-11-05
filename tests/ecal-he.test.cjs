'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const h = require('../fayna-ecal-he.js');
test('common releases, stages, periods, countries and speeches', () => {
  assert.equal(h.t('Core CPI m/m'), 'מדד המחירים לצרכן ליבה (חודשי)');
  assert.equal(h.t('Advance GDP q/q'), 'תוצר מקומי גולמי (מוקדם, רבעוני)');
  assert.equal(h.t('German Final Manufacturing PMI'), 'גרמניה: מדד מנהלי הרכש – תעשייה (סופי)');
  assert.equal(h.t('Fed Chair Powell Speaks'), 'נאום יו"ר הפד פאוול');
  assert.equal(h.t('RBA Press Conference'), 'מסיבת עיתונאים של בנק אוסטרליה');
  assert.equal(h.t('Unknown English Thing'), 'Unknown English Thing');
  assert.equal(h.country('USD'), 'ארה"ב');
});
