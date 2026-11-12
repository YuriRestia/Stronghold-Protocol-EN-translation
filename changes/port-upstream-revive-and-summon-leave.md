## 2026-11-12

### Aegir operators already down at co-op defence revive

- An Aegir operator that is already down when co-op defence starts now gets the bond's revive on the battle-start check
  and spends one of the bond's revives, as in the official game. Before, it stayed down for the whole defence and the
  revive was never used. Ported from upstream's fix for
  [issue #882](https://github.com/sganggs/Stronghold-Protocol/issues/882), thanks to @sganggs; reported by @19p-0 with a
  recording by @modongfox.

### Swire the Elegant Wit's champagne bomb leaves with her

- Swire the Elegant Wit's S2 champagne bomb now leaves the field when she does (knocked out, retreated or sold), as in
  the official game. Before, an unexploded bomb stayed behind without her. Only her own bombs leave: other summons and
  other operators' exits are unchanged. From [PR #872](https://github.com/sganggs/Stronghold-Protocol/pull/872)
  (issue #871), thanks to @zasx77771, narrowed to the bomb as @sganggs asked in its review after checking it in the
  official client.
