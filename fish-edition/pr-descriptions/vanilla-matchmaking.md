Matchmaking is the original game unless a player says otherwise. A room that opens to strangers now says what it promises: **vanilla** (the lobby rules are cleared and locked) or **modded** (the host may still change them, and only players who allow mods meet it). A Grand Alliance opens private. Answers the matchmaking concern of #222.

Base: `mini/0.3.4-4`. Branch `feature/vanilla-matchmaking`. One audience: matchmaking and rooms (server, protocol, lobby screens).

## What changes for players

- **Find teammates asks first.** The host picks *This will be vanilla only (prevents further edits)* or *Mark this lobby as modded (allows editing lobby rules)*. Vanilla clears the rules already chosen and locks them. The lock lifts once the host stops the search and is alone again; it stays while another human is seated (a stranger who matched in stays after the match).
- **Grand Alliances open private** (4 random letters unless the host types one). Making one public is a separate press (the *Public* button glows) that asks the same vanilla / modded question. A public Grand Alliance is locked the same way.
- **Preference button on the home screen**: *Preference: Vanilla only* (default) / *Preference: Allow mods*, kept per browser. Vanilla only: the solo queue only fills vanilla rooms and the room browser hides modded ones. Allow mods: modded rooms too.
- The room browser marks modded rooms (*Modded*). The lobby rules window says why it is locked in a vanilla room.

## What changes in the server

- `Room.searchKind` (`'vanilla' | 'modded' | null`) and a derived `Room.vanillaLocked` (searching, a public Grand Alliance, or another human seated). Derived, not stored, so a maintenance stop or the end of a match cannot reopen the rules.
- `room.search {on, kind?}` and `room.setLock {on, password?, kind?}`: a missing `kind` is vanilla, so older clients stay safe. `queue.join {mods?}`: a missing `mods` means vanilla only.
- `room.setRules` and gameplay plugins are refused in a locked vanilla room (`CUSTOM_RULES` / `PLUGIN_BLOCKED`). The old rule "a room with rules cannot search" is gone: searching clears them instead.
- Pools: a vanilla room's pool key is unchanged. A modded room's adds `|mod<rules>`, so it meets only modded rooms with the same rules. The solo queue puts a Doctor in a modded room only with `mods`, and a room the queue forms is vanilla and locked. A modded room is left out of the cross-region digest (other servers only see vanilla rooms).
- `room.state` gains `searchKind` and `vanillaLock` (only when set); the room list gains `modded`.

## Not in this PR

- Merging a modded room into a vanilla one (modded rooms could be a source for a vanilla target). Two separate pools first; if the modded pool runs thin this is the follow-up.
- Rooms with gameplay plugins stay joined by code only.
- The challenge generator does not know the preference yet (mod-dependent lines can't be done in matchmaking by a vanilla-only player).
- Friends who join a Grand Alliance by its code now also need its password until the host makes it public.

## Checks

- New `test/vanilla-matchmaking.test.js` (9 tests; the lock test was checked by disabling the guard and watching 3 fail). Tests that assumed a Grand Alliance is public at creation now make it public first.
- Local: lobby, matchmaking, Grand Alliance, One for All, queue, rules, i18n, protocol and docs tests (539 pass). CI runs the full suite.
- Text: blind read of the new dialog and buttons (fresh reader, text only). It could not tell what happens to the chosen rules under *modded*, or whether *vanilla* can be undone; both lines were added to the dialog. "Doctors" is the game's word for players and is kept.

## Changelog

### Lobby rules and matchmaking
- Matchmaking is the original game unless a player allows mods. Find teammates asks whether the lobby is vanilla only (rules cleared and locked) or modded (rules stay editable, and only players who allow mods meet it); the home screen has a *Preference: Vanilla only / Allow mods* button (#222).
- Grand Alliances open private; making one public asks the same question.

— Claude (orca)
