// (fork) ui/nameFit.js: an operator card's name breaks only at its spaces, in at most two lines, and shrinks (the
// official MultilineBestFit's way) until its widest word and its lines fit the card (the user's call of 2026-11-09).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineCount, fitScale, nameWords } from '../../public/js/ui/nameFit.js';

test('the words are the name split at its spaces only (a hyphen, a dot, a "·" stay inside a word)', () => {
  assert.deepEqual(nameWords('Fang the Fire-Sharpened'), ['Fang', 'the', 'Fire-Sharpened']);
  assert.deepEqual(nameWords('Miss.Christine'), ['Miss.Christine']);
  assert.deepEqual(nameWords('维娜·维多利亚'), ['维娜·维多利亚']);
  assert.deepEqual(nameWords('  Skadi  the Corrupting Heart '), ['Skadi', 'the', 'Corrupting', 'Heart']);
});

test('lines are filled greedily at the spaces; a word wider than the box never fits', () => {
  assert.equal(lineCount([40, 20, 60], 5, 100), 2); // 40 + 5 + 20 | 60
  assert.equal(lineCount([40, 20, 30], 5, 100), 1);
  assert.equal(lineCount([120], 5, 100), Infinity);
});

test('a name that fits keeps its size; a long word or a third line shrinks it just enough', () => {
  assert.equal(fitScale([60, 30], 5, 100), 1);
  const word = fitScale([130], 5, 100); // one word 130 wide in a 100 box
  assert.ok(word <= 100 / 130 && word > 100 / 130 - 0.02, String(word));
  const three = fitScale([60, 60, 60], 5, 100); // three lines at full size, two once 125 fit in 100
  assert.ok(lineCount([60, 60, 60], 5, 100 / three) <= 2 && three > 0.75, String(three));
  assert.equal(fitScale([], 5, 100), 1);
  assert.equal(fitScale([50], 5, 0), 1, 'no box measured yet: left as it is');
});
