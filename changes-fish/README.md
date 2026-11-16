# Fish Edition changelog fragments (GitHub #158)

A pull request never edits the "### Fish Edition" section of `CHANGELOG.md` or `CHANGELOG.en.md`. It adds two small
files here instead, so parallel pull requests never conflict on the changelog:

- `changes-fish/<PR>-<what>.md`: the Chinese bullets;
- `changes-fish/<PR>-<what>.en.md`: the same bullets in English.

`<PR>` is the pull request's number (open the PR first, then add the files), `<what>` lowercase words joined by
hyphens, e.g. `159-evobot.md` and `159-evobot.en.md`.

## Format

One or more `- ` bullets, written exactly as they will read in the changelog, with the pull request's number at the end
as usual: `- New bot profile, Evobot: … (#159).` A continuation line is indented by two spaces. Nothing else.

## How they show

- **In the game:** the server folds the fragments into the first version's "### Fish Edition" list whenever it serves
  `/CHANGELOG.md` or `/CHANGELOG.en.md` (`server/changelogFish.js`), newest pull request first. The release notes
  are current as soon as a pull request is merged.
- **Before a release:** `npm run changelog:fish -- --write` folds them into both files for good and deletes them.
  `npm run changelog:fish` checks them (each needs its other language); `test/changelog-fish.test.js` runs that check.
