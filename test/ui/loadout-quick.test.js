// Quick loadout previews use the same generated records as the in-match detail, without changing a loadout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quickSkillTags } from '../../public/js/ui/loadoutModel.js';

const chess = JSON.parse(readFileSync(new URL('../../data/chess.json', import.meta.url), 'utf8'));
const operator = (name) => Object.values(chess).find((c) => c.name === name && !c.isGolden && !c.isDiy);

test('quick skill previews show the generated normal/elite SP and duration', () => {
  const base = operator('空弦');
  const elite = chess[base.goldenId];
  for (const c of [base, elite]) {
    for (const s of c.skills) {
      const tags = quickSkillTags(s);
      assert.equal(tags.recovery, '攻回');
      assert.equal(tags.init, s.initSp);
      assert.equal(tags.cost, s.spCost);
      assert.equal(tags.duration, s.duration > 0 ? `${s.duration}s` : '瞬发');
    }
  }
});

test('deployment skills have no SP cycle, while permanent passives remain passive (in either language)', () => {
  for (const name of ['缄默德克萨斯', '砾', '斯卡蒂', '野鬃']) {
    const c = operator(name);
    for (const form of [c, chess[c.goldenId]]) {
      for (const s of form.skills.filter((s) => s.spType === 'ON_DEPLOY')) {
        const tags = quickSkillTags({ ...s, desc: 'localized text', descRaw: '' });
        assert.equal(tags.recovery, '—', `${name} S${s.index + 1}`);
        assert.equal(tags.init, null);
        assert.equal(tags.cost, null);
        assert.equal(tags.duration, `${s.duration > 0 ? s.duration : s.bb.duration}s`);
      }
    }
  }
  const passive = quickSkillTags(operator('星熊').skills[1]);
  assert.equal(passive.recovery, '被动');
  assert.equal(passive.duration, '常驻');
  assert.equal(passive.cost, null);
});

test('ammo and infinite skills keep their duration semantics', () => {
  assert.equal(quickSkillTags({ skillType: 'MANUAL', spType: 'INCREASE_WITH_TIME', durationType: 'AMMO' }).duration, '弹药');
  assert.equal(quickSkillTags({ skillType: 'MANUAL', spType: 'INCREASE_WITH_TIME', duration: -1 }).duration, '∞');
  assert.equal(quickSkillTags(null).recovery, '—');
});

test('loadout attributes use the in-match block and keep obtain/rest triggers for both forms', async () => {
  globalThis.fetch = async (url) => {
    try {
      const value = JSON.parse(readFileSync(new URL(`../../data/${String(url).split('/').pop()}`, import.meta.url), 'utf8'));
      return { ok: true, json: async () => value };
    } catch { return { ok: false, status: 404 }; }
  };
  const { data } = await import('../../public/js/data.js');
  const { LoadoutGarrisons } = await import('../../public/js/screens/loadout.js');
  const { GarrisonBlock } = await import('../../public/js/ui/detailPanel.js');
  await data.loadAll('chess', 'garrisons');
  function* walk(v) {
    if (Array.isArray(v)) { for (const n of v) yield* walk(n); return; }
    if (!v || typeof v !== 'object') return;
    yield v;
    yield* walk(v.props?.children);
  }
  for (const [name, trigger] of [['空弦', '<进入休整期时>'], ['星熊', '<获得时>'], ['缄默德克萨斯', '<进入休整期时>']]) {
    const base = operator(name);
    for (const rec of [base, chess[base.goldenId]]) {
      const nodes = [...walk(LoadoutGarrisons({ chess: rec, m: null }))].filter((n) => n.type === GarrisonBlock);
      assert.equal(nodes.length, rec.garrisonIds.length);
      for (const node of nodes) {
        const original = data.lookup('garrisons', rec.garrisonIds[0]);
        assert.deepEqual(node.props.garrison, original);
        const raw = [...walk(GarrisonBlock(node.props))].find((n) => n.type?.name === 'RichText').props.text;
        assert.ok(raw.startsWith(trigger), `${name}: ${raw}`);
        assert.equal(raw, original.descRaw || original.desc);
      }
    }
  }
});
