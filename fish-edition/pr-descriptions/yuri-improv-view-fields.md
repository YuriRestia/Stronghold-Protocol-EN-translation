# Improv: "View Fields" pulls the overlay away to look at the Fields

For Yuri's repo: base `dev-0.2`, branch `yuri/improv-view-fields` on evenifyouforget/Stronghold-Protocol-EN
(one commit, cut from `dev-0.2` at `e04c7130`). Fish opens it.

From Fish Edition #153 (issue #105). During an Improv choice the overlay covers the board, so you can't check your Field
or a teammate's before you pick.

## What it does

- A "View Fields" button pulls the Improv overlay away. Your Field, the Alliances and your teammates' Fields (tap a
  teammate) are visible and usable as usual.
- A tab at the top, with the countdown, brings the overlay back. The pick and the timer are unchanged.
- Client only (`public/js/ui/choiceOverlay.js`, `public/js/screens/game.js`, `public/css/screens/game-panels.css`),
  two new strings in en / ja / ko / zh-TW.

## Changelog

`changes/improv-view-fields.md` (`Kind: player`, `Server cost: none`). `npm run changelog -- --check` passes.

## Tests

- `test/ui/improv-peek.e2e.test.js` (headless Chrome, mock harness) runs only with `SP_E2E=1` and Chrome. Fish
  Edition's CI runs with browser tests off, and Chrome isn't available where this branch was built, so it was
  skipped both times: worth one run where Chrome is.
- `i18n check --all --strict`: complete in all four languages. Lint: no errors.

— Claude (orca)
