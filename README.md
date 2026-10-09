# Pickaxe

A fork of [Desktop Plus](https://github.com/desktop-plus/desktop-plus) (itself a fork of [GitHub Desktop](https://github.com/desktop/desktop)) focused on **finding things in your changes and your history**.

> Not affiliated with or endorsed by GitHub, Inc. Everything Desktop Plus adds to GitHub Desktop (commit graph, several stashes per branch, worktrees, multiple accounts, ...) is still here, see [its README](https://github.com/desktop-plus/desktop-plus#readme).

The name comes from git's *pickaxe*: `git log -S` / `-G`, the search that finds the commits that added or removed some code.

## What this fork adds

### Filter changed files with regular expressions

Next to the filter box of the Changes list:

- **`.*`** turns on regular expressions, matched against the **full file path**. **`Aa`** makes them case-sensitive.
- An **Exclude** box appears to hide files.
- Both boxes take a **comma-separated list**: `test, lock, json` hides every file matching any of them, `\.tsx?$, \.scss$` shows only those. Commas inside `( )`, `[ ]`, `{ }` or escaped with `\,` stay part of their pattern.
- A pattern that doesn't parse is flagged and skipped; the others still apply, and the list never goes blank while you type.

### Search the history by what the code says

Click the funnel button left of the search box, in the **History** tab and in the **Commit Graph**:

| Search in | Finds commits where... |
|---|---|
| Commit message | the message, tags or SHA contain the text |
| Code changes (exact text) | the text was added or removed (`git log -S`) |
| Code changes (regex) | a changed line matches the regex (`git log -G`) |

- **Commit message** and **Code changes (regex)** are checked by default. Check any combination; a commit is shown if it matches in **any** checked place. At least one stays checked.
- Code searches ignore case unless you check **Match case**.
- **Only commits touching this file** restricts the search to one file, with suggestions from the files in the repository as you type. Renames are followed. It also makes code searches much faster.
- **All branches** (Commit Graph only) searches every branch and tag instead of the ones shown.
- Commits whose *message* matches appear immediately; commits whose *code* matches are added once git answers. A newer search stops the one still running.

> Searching code reads the whole history. Expect several seconds on a big repository (about 7 s for 40,000 commits) unless you restrict it to a file. Text shorter than 3 characters isn't searched in the code when the message is searched too.

### The history of a single file

Right-click a file in the Changes list or in a commit's file list, then **Show history of this file**. It opens the History tab restricted to that file, following renames. Any tracked file works through the search options above.

## Installing

There are no prebuilt installers yet. Build it yourself (a few minutes, no Apple or Microsoft account needed):

```sh
git clone <this repository> && cd <this repository>
nvm install && nvm use      # Node version from .nvmrc
corepack yarn               # install dependencies
corepack yarn build:prod    # ~1 minute
corepack yarn package       # zip / installer in dist/
```

- **macOS:** the app is in `dist/` (and zipped). Copy the `.app` to `/Applications`. The app is ad-hoc signed, not notarized. One you built yourself carries no quarantine flag, so macOS doesn't block it; one you *downloaded* does, and needs **System Settings → Privacy & Security → Open Anyway** the first time.
- **Windows / Linux:** the same commands produce an installer, `.deb`, `.rpm` or AppImage. These are built by the upstream CI but have not been tested on this fork.
- **Updating:** there is no auto-update. `git pull`, then build and install again.

### Known limitations

- The app still has Desktop Plus's identity (name, bundle id, data folder), so it **replaces an installed Desktop Plus and shares its settings**. Don't install both.
- Signing in with GitHub uses the OAuth credentials bundled in the source for development builds. To use your own OAuth app, set `DESKTOP_OAUTH_CLIENT_ID` and `DESKTOP_OAUTH_CLIENT_SECRET` when building.

## Development

```sh
corepack yarn build:dev && corepack yarn start   # run the app
corepack yarn test:unit                          # unit tests
corepack yarn lint                               # prettier + eslint
```

The code of the features above lives in `app/src/ui/changes/filter-changes-regex.ts`, `app/src/lib/commit-search-filter.ts` and `app/src/lib/git/log-search.ts` (pure logic with unit tests) and the small components next to them, so they stay easy to rebase on Desktop Plus.

## License and credits

[MIT](LICENSE). Copyright GitHub, Inc. and contributors. Built on [GitHub Desktop](https://github.com/desktop/desktop) and [Desktop Plus](https://github.com/desktop-plus/desktop-plus).
