# Changelog fragments (fork)

A branch never edits [FORK-CHANGELOG.md](../FORK-CHANGELOG.md) directly. It adds **one file here per change**, named
after what it changes (`changes/<what-it-changes>.md`, lowercase words joined by hyphens), so parallel branches never
conflict on the changelog. The lead folds the fragments into FORK-CHANGELOG.md on `dev-0.2` with
`npm run changelog` (at the latest before each release; never on a feature branch) and commits the result.

## Format

```markdown
## 2026-11-11

### What changed, as a player-facing title

- What it does now, in plain English.
- Before: what it did.

### A second section, when one change has two parts

- …
```

- The first line is `## YYYY-MM-DD`: the day of the change. Then one or more `### Heading` sections, each with at least
  one `- ` bullet. Nothing else at heading level 1 or 2. LF line ends.
- The sections are written exactly as they will read in FORK-CHANGELOG.md (English only, credits as there: "thanks to
  @login" for contributions, upstream merges as one linked line).
- A later fix to the same change edits its fragment while it is still here; once folded, it is a new fragment.

## Commands

| Command | What it does |
|---|---|
| `npm run changelog -- --check` | Checks every fragment (also done by `test/changelog.test.js`) |
| `npm run changelog -- --dry-run` | Prints FORK-CHANGELOG.md with the fragments folded in; writes nothing |
| `npm run changelog` | Folds them in (newest first within a day, by the time git added the file) and deletes them |
