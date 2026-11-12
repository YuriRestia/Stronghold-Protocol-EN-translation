## 2026-11-13

### One command for the PC side of a release

- `node scripts/release.mjs` on `dev-0.2` runs every PC step up to a prepared release on every server:
  - folds the changelog fragments and drafts the lobby's live update news from them, for you to edit in Notepad;
  - pushes `dev-0.2`;
  - waits for GitHub's checks;
  - uploads only the art the art server lacks, then checks that nothing the release lists is missing there;
  - runs `prepare` on every server, then prints the `activate` command and the command that puts the news live right after it.
- It stops at the first failure and says why. A failed CI stops it unless you answer y or pass `--skip-ci`. It never activates.
- `--dry-run` reads everything (server status, art list, CI) and changes nothing.
