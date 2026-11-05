import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upcomingAlarms, alarmsOf, alarmsLabel, toggleAlarm, parseQuick, key, addDays, today0 } from '../../shared/core.js';

const inDays = (n) => key(addDays(today0(), n));

test('rappel 1 semaine avant + la veille sur un rendu', () => {
  const ev = { id: 'r1', title: 'Rendu portfolio', type: 'rendu', date: inDays(10), start: '23:59', end: '23:59', alarms: [10080, 1440], repeat: 'none' };
  const list = upcomingAlarms([ev], 14);
  assert.deepEqual(list.map((a) => a.lead), [10080, 1440]);
  assert.equal(new Date(list[0].fireAt).getDate(), addDays(today0(), 3).getDate());
  assert.equal(alarmsLabel(ev), '1 semaine avant + la veille');
});

test('un rappel 1 semaine avant visé à J+8 sonne demain, même avec un horizon de 2 jours', () => {
  const ev = { id: 'r2', title: 'Soutenance', type: 'eval', date: inDays(8), start: '09:00', end: '12:00', alarms: [10080] };
  assert.equal(upcomingAlarms([ev], 2).length, 1);
});

test('compatibilité avec les anciens événements à alarme unique', () => {
  assert.deepEqual(alarmsOf({ alarm: 10 }), [10]);
  assert.deepEqual(alarmsOf({ alarm: null }), []);
  assert.deepEqual(toggleAlarm([1440], 10080), [10080, 1440]);
  assert.deepEqual(toggleAlarm([10080, 1440], 1440), [10080]);
});

test('ajout rapide : « rappel 1 semaine »', () => {
  assert.deepEqual(parseQuick('Rendu dossier vendredi 18h rappel 1 semaine').alarms, [10080]);
  assert.deepEqual(parseQuick('Rendu dossier vendredi 18h').alarms, [10080, 1440]);
});
