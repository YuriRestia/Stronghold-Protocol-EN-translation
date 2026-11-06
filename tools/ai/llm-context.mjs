// §35.11. [ASSUMED] Advisor summaries/feasibility estimates, never authoritative gameplay or live stock.
// Counts/thresholds/costs come from the seat digest and knowledge generated from activity_table.json.
const pick = (x, keys) => Object.fromEntries(keys.filter(k => x?.[k] !== undefined).map(k => [k, x[k]]));
// The plan addresses operator IDs, not piece UIDs. Static names/base IDs already live in the cached prefix.
const unit = p => ({ ...pick(p, ['id', 'name', 'stars', 'row', 'col', 'dir', 'class', 'caps']),
  ...(p.kind !== 'chess' ? pick(p, ['kind', 'count', 'name']) : {}),
  ...(p.items?.length ? { items: p.items.map(i => typeof i === 'string' ? i : pick(i, ['id', 'name'])) } : {}) });

export function compactChoices(d) {
  return (d.actions || []).filter(a => ['g.band', 'g.bandSkip', 'g.choice', 'g.offer', 'g.reward'].includes(a.intent.t)).map(a => {
    const i = a.intent;
    const card = i.t === 'g.choice' ? (i.choiceId ? d.personalChoice?.cards?.[i.idx] : d.choices?.cards?.find(c => c.idx === i.idx))
      : i.t === 'g.reward' ? d.rewards?.[i.idx]
        : i.t === 'g.offer' ? d.choices?.offers?.find(w => w.id === i.offerId && w.pluginId === i.pluginId && w.seq === i.seq)
          ?.seats.find(s => s.playerId === d.playerId)?.slots.find(c => c.idx === i.idx) : null;
    return { ...a, ...(card ? { card: pick(card, ['id', 'name', 'desc', 'kind', 'price', 'tier', 'bonds', 'coin', 'payout', 'rounds', 'enemyKey', 'count', 'team', 'killChance', 'enemy']) } : {}) };
  });
}

// §35.63 [ASSUMED]: the seat's own copy counts and the shop arithmetic, computed here so the model does not have to
// (cycle 2: plans skipped third copies, and holds were justified by miscounted prices).
const baseOf = p => p.baseId || String(p.id).replace(/_b$/, '_a');
export function levelOptions(economy, mergeCosts) {
  const gold = economy?.gold, price = economy?.upgradePrice, level = economy?.level;
  if (!Number.isInteger(gold) || !Number.isInteger(price) || !Number.isInteger(level)) return undefined;
  const merges = mergeCosts.slice().sort((a, b) => a - b);
  const affordable = funds => { let n = 0, left = funds; for (const c of merges) if (c <= left) { left -= c; n++; } return n; };
  return [{ action: 'hold', fundsAfter: gold, mergesAffordable: affordable(gold), nextRoundPrice: Math.max(0, price - 1) },
    ...(gold >= price && level < 6 ? [{ action: 'level', toLevel: level + 1, fundsAfter: gold - price, mergesAffordable: affordable(gold - price) }] : [])];
}

export function compactDigest(d, pack) {
  const board = (d.board || []).map(unit), bench = (d.bench || []).map(unit), overflow = (d.overflow || []).map(unit);
  const offers = (d.shop || []).filter(s => s && !s.sold);
  const held = [...(d.board || []), ...(d.bench || [])].filter(p => p.kind === 'chess');
  const copies = new Map(), elites = new Set();
  for (const p of [...held, ...(d.overflow || []).filter(p => p.kind === 'chess')]) {
    if (p.stars === 2) elites.add(baseOf(p)); else copies.set(baseOf(p), (copies.get(baseOf(p)) || 0) + 1);
  }
  const mergeCopies = new Map((pack.operators || []).map(o => [o.id, o.mergeCopies || 3]));
  const shop = offers.map(s => {
    const row = { ...pick(s, ['id', 'name', 'kind', 'slot', 'bonds', 'frozen', 'class', 'caps']), cost: s.price, tier: s.tier };
    if (s.kind !== 'chess' || s.stars === 2) return row;
    const n = copies.get(baseOf(s)) || 0;
    return { ...row, copiesHeld: n, ...(elites.has(baseOf(s)) ? { eliteHeld: true } : {}),
      completesMerge: !elites.has(baseOf(s)) && n + 1 >= (mergeCopies.get(s.id) || mergeCopies.get(baseOf(s)) || 3) };
  });
  const disabled = new Set(d.availability?.disabledBonds || []);
  const banned = new Set([...(d.availability?.bannedChess || []), ...(d.availability?.diyBanned || [])]);
  const pool = pack.operators.filter(p => p.poolEligible && !p.elite && p.tier <= d.economy?.level
    && !banned.has(p.id) && !banned.has(p.baseId));
  const counts = new Map((d.bonds || []).map(b => [b.bondId, b]));
  const bonds = pack.bonds.filter(b => !disabled.has(b.id)).map(b => {
    const current = counts.get(b.id);
    const golden = b.countMode === 'BOARD_ALL_CHESS' || b.countsGoldenOnly;
    const members = held.filter(p => golden ? p.stars === 2 : p.bonds?.includes(b.id));
    const owned = new Set(members.map(p => p.baseId || p.id));
    const shown = offers.filter(p => p.kind === 'chess' && (golden ? p.stars === 2 : p.bonds?.includes(b.id)));
    const eligible = pool.filter(p => !golden && p.bonds?.includes(b.id));
    const count = current?.count || 0;
    const nextThreshold = current?.nextThreshold ?? b.thresholds.find(n => n > count) ?? null;
    // Bench pieces are potential, not activated count. Cap estimates by deployment slots except deck-counting bonds.
    // Golden-only bonds require already owned elites; never claim ordinary shop pieces activate them directly.
    const potential = golden ? members.length : new Set([...owned, ...shown.map(p => p.baseId || p.id), ...eligible.map(p => p.baseId || p.id)]).size;
    const capacity = b.countMode === 'BOARD_AND_DECK' ? potential : Math.min(potential, d.deployCap || 0);
    const reachable = !!current?.active || (nextThreshold !== null && Math.max(count, capacity) >= nextThreshold);
    // Preserve actual accumulated investment when assessing pivots; never infer layers from member counts.
    return { id: b.id, kind: b.core ? 'core' : 'class', count, nextThreshold, ...(current?.layers ? { layers: current.layers } : {}),
      ...(current?.tier ? { tier: current.tier } : {}), held: members.length,
      shopOptions: new Set(shown.map(p => p.baseId || p.id)).size, poolOptions: eligible.length,
      candidate: members.length > 0 && reachable };
  }).filter(b => b.count || b.held || b.shopOptions);
  // Official mode data (config enemyScale): the catalogue rows above are unscaled, co-op R7-R10 enemies have 3.6-4.3x HP.
  const scale = (pack.difficulties || []).find(x => x.id === pack.modeId)?.enemyScale?.[d.round];
  const options = levelOptions(d.economy, shop.filter(s => s.completesMerge).map(s => s.cost));
  const coreIds = new Set((pack.bonds || []).filter(b => b.core).map(b => b.id));
  return { ...pick(d, ['round', 'phase', 'lp', 'deployCap', 'factions']), band: d.band?.id,
    economy: { ...pick(d.economy, ['gold', 'interest', 'level', 'upgradePrice', 'refreshPrice', 'expiringFunds', 'frozenSlots', 'bankOperators']),
      ...(options ? { levelOptions: options } : {}) },
    ...(scale ? { enemyScale: pick(scale, ['atk', 'hp']) } : {}),
    board, bench, overflow, shop, bonds,
    upcoming: (d.upcoming || []).map(e => pick(e, ['enemyKey', 'name', 'count', 'gate', 't', 'fly', 'elite', 'boss', 'source', 'mods'])),
    boss: pick(d.boss, ['id', 'name', 'round']),
    teammates: (d.opponents || []).map(p => {
      const main = (p.bonds || []).filter(b => coreIds.has(b.bondId) && b.count >= 2).sort((a, b) => b.count - a.count || a.bondId.localeCompare(b.bondId))[0];
      return { playerId: p.playerId, lp: p.lp, bandId: p.bandId, ...(main ? { main: main.bondId } : {}),
        bonds: (p.bonds || []).filter(b => b.active).map(b => ({ id: b.bondId, count: b.count })) };
    }) };
}

export function continuity(d, previous) {
  const feedback = d.feedback;
  // The host's acknowledgement prevents a timed-out/rejected reply being described as an executed plan.
  const accepted = feedback?.acceptedPlan;
  const confirmed = previous && (!feedback || accepted?.id === previous.id) ? previous : null;
  const plan = confirmed?.plan || accepted?.plan;
  if (!plan) return null;
  const before = new Map((confirmed?.digest.bonds || []).map(b => [b.id, b.count]));
  const after = new Map((d.bonds || []).map(b => [b.bondId, b.count]));
  const cursor = confirmed?.through;
  const events = (feedback?.events || []).filter(e => cursor === undefined ? e.round >= accepted.round : e.seq > cursor);
  const { choice, ...priorPlan } = plan; void choice; // observation-local choice IDs must never be reused
  return { round: confirmed?.round ?? accepted.round, previousPlan: priorPlan,
    outcome: { events, eventsComplete: cursor !== undefined && (!events.length || events[0].seq === cursor + 1),
      bonds: [...new Set([...before.keys(), ...after.keys()])].map(id => ({ id, before: confirmed ? before.get(id) || 0 : null, after: after.get(id) || 0 })),
      lp: { before: confirmed?.digest.lp ?? null, after: d.lp ?? null }, lastBattle: feedback?.lastBattle || null } };
}

// §35.62 [ASSUMED]: the band draft sets a direction before any member is owned (玛恩纳 → 卡西米尔 waited until R6 for a
// first copy). `intent` lists the mains of the current strategy candidates: those bonds may lead the plan without a
// held member. A primary change still needs pivot:true and a reason.
export function focusPlan(plan, meta, digest, previousPlan, repairs, intent = []) {
  // §35.9's explicit empty-plan delegation remains unweighted, even when an earlier plan had targets.
  if (!Object.keys(plan).length) return { pivot: false, pivotReason: '' };
  const candidates = new Set([...digest.bonds.filter(b => b.candidate).map(b => b.id), ...intent]);
  const select = bonds => (bonds || []).filter(b => candidates.has(b.id)).sort((a, b) => b.priority - a.priority).slice(0, 3);
  const proposed = select(plan.bonds);
  for (const b of plan.bonds || []) if (!proposed.includes(b)) repairs.push({ path: 'bonds', id: b.id, reason: 'no held/reachable progress or three-bond cap' });
  const old = previousPlan?.bonds || [], viable = select(old);
  // Only the highest-priority bond is the direction. Adding, dropping or reordering sub-bonds is not a pivot.
  const primaryId = bonds => (bonds || []).slice().sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0]?.id || '';
  let pivot = false, pivotReason = '';
  let bonds = proposed;
  if (old.length && primaryId(old) !== primaryId(proposed)) {
    if (meta.pivot === true && meta.pivotReason) { pivot = true; pivotReason = meta.pivotReason; }
    else {
      bonds = viable;
      repairs.push({ path: 'bonds', reason: 'unexplained primary-bond change; retain viable previous targets' });
      if (primaryId(viable) !== primaryId(old)) { pivot = true; pivotReason = 'Previous targets no longer have held, publicly reachable progress.'; }
    }
  }
  if (plan.bonds !== undefined || old.length) plan.bonds = bonds;
  return { pivot, pivotReason };
}
