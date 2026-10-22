<p align="center">
  <a href="CONTRIBUTING.md"><kbd><strong>English</strong></kbd></a> &nbsp; <a href="CONTRIBUTING.ko.md"><kbd>한국어</kbd></a>
</p>

<p align="center"><img src="docs/images/pokemon-1.gif" width="64" alt="Bulbasaur"></p>

<h1 align="center">Contributing to PokeToken Desktop</h1>

<p align="center">
  <strong>A small contribution can start a new adventure.</strong><br>
  Bug fixes, clearer docs, translations, and thoughtful ideas are welcome.<br>
  <sub>Issues and pull requests are welcome in English, 한국어, or 日本語.</sub>
</p>

<p align="center">
  <a href="#get-started">Get started</a> · <a href="#before-opening-a-pull-request">Pull requests</a> · <a href="#report-a-bug">Bug reports</a> · <a href="#licenses-and-credits">Licenses</a>
</p>

## Find your first contribution

| You want to… | A good place to start |
| --- | --- |
| 🐛 Fix a bug | Browse [open issues](https://github.com/KHLEE72/pokeTokenDesktop/issues), or send a focused fix with reproduction steps. |
| 🌍 Improve a translation | Update the English, Korean, and Japanese UI messages together; use official localized Pokémon names. |
| 📖 Improve the docs | Correct an explanation, fix a link, or make a guide easier to follow. |
| 💡 Add a feature | Open an issue first for a large feature or structural change so we can agree on the direction. |

## Get started

Fork the repository, clone your fork, and create a branch for your change. Use **Node.js 22.12 or later** and npm:

```sh
npm ci
npm run dev
```

Closing the dashboard keeps the pet running. Quit the development app from the tray or menu bar when you are finished.

| Location | What lives here |
| --- | --- |
| `src/main/` | Desktop windows and input, usage scanning, SQLite storage, and sprite caching |
| `src/preload/` | The limited IPC bridge exposed to the UI |
| `src/renderer/` | The pet, dashboard, and styles |
| `src/shared/` | Growth, collections, evolution, rewards, catalogs, and translations |
| `tests/`, `scripts/`, `native/` | Tests, build tools, and platform helpers |

The [development guide](docs/DEVELOPMENT.md) has detailed build commands and platform requirements. The detailed development and validation notes are currently in Korean.

## Before opening a pull request

Keep the change focused, explain **what changed and why**, and include the checks you ran. Add screenshots for visible UI changes. For native window or input behavior, describe the OS, display scale, and monitor setup you actually tested.

For code changes, run:

```sh
npm run typecheck
npm test
npm run build
```

Then run the relevant `smoke:*` checks listed in [package.json](package.json). A successful build alone does not verify desktop behavior on another OS. For documentation-only changes, check the wording, links, and commands; app tests are not required.

Preserve existing growth, Pokédex, settings, individual evolution paths, and saved data. Keep UI messages consistent across all three languages and look up Pokémon names in the official localized catalog instead of translating them yourself.

## Report a bug

Use the [bug report form](https://github.com/KHLEE72/pokeTokenDesktop/issues/new?template=bug_report.yml) and include:

- App version and OS version.
- Display scale and monitor setup.
- Steps to reproduce, expected behavior, and what happened instead.
- A screenshot or a small, reviewed diagnostic excerpt, if useful.

For input problems, the tray diagnostic action can mark when the problem happened. Review the output and share only the relevant, anonymized portion.

> **Keep private data private.** Do not post raw Claude Code/Codex conversations, complete settings or databases, credentials, or personal folder paths in issues or pull requests. Tests must use temporary `POKETOKEN_DATA_DIR`, `POKETOKEN_TEST_MODE=1`, and anonymized fixtures instead of your real saved data or usage logs.

## Licenses and credits

Original application code is released under [MIT](LICENSE). Submit code you author under the same terms. Pokémon artwork and names, third-party sprites, and fonts retain their own rights and licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).

When adding external material, record the source, creator credits, and usage terms, and preserve the required notices.

---

<p align="center">
  <img src="docs/images/pokemon-133.gif" width="40" alt="Eevee"><br>
  <strong>Thanks for helping this little companion grow.</strong><br>
  <sub><a href="README.md">Back to PokeToken Desktop</a> · <a href="CONTRIBUTING.ko.md">한국어 기여 안내</a></sub>
</p>
