// test/render/dynillust-key.test.js — render/dynillust/index.js findDynIllustKey: an operator's outfit → its
// illustration key in the `dynillust` group, ids compared without case (the index spells some outfit ids in lowercase).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDynIllustKey } from '../../public/js/render/dynillust/index.js';

const group = {
  'char_1046_sbell2_2': { charId: 'char_1046_sbell2', skinId: 'char_1046_sbell2#2' },
  'char_1046_sbell2@ambiencesynesthesia#8': { charId: 'char_1046_sbell2', skinId: 'char_1046_sbell2@ambiencesynesthesia#8' },
  'char_003_kalts_boc#6': { charId: 'char_003_kalts', skinId: 'char_003_kalts@boc#6' },
};

test('an outfit id spelt with other case still finds its illustration', () => {
  // the outfit data's spelling (camel case) against the index's lowercase
  assert.equal(findDynIllustKey(group, 'char_1046_sbell2', 'char_1046_sbell2@ambienceSynesthesia#8'), 'char_1046_sbell2@ambiencesynesthesia#8');
  assert.equal(findDynIllustKey(group, 'CHAR_1046_SBELL2', 'char_1046_sbell2@AMBIENCESYNESTHESIA#8'), 'char_1046_sbell2@ambiencesynesthesia#8');
});

test('exact ids, the E2 default, and no match', () => {
  assert.equal(findDynIllustKey(group, 'char_003_kalts', 'char_003_kalts@boc#6'), 'char_003_kalts_boc#6');
  assert.equal(findDynIllustKey(group, 'char_1046_sbell2', null), 'char_1046_sbell2_2');
  assert.equal(findDynIllustKey(group, 'char_003_kalts', null), null);
  assert.equal(findDynIllustKey(group, 'char_003_kalts', 'char_003_kalts@other#1'), null);
  assert.equal(findDynIllustKey(null, 'char_003_kalts', null), null);
  assert.equal(findDynIllustKey(group, '', null), null);
});
