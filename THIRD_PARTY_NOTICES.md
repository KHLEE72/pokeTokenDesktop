# Third-party notices

## PokeTokenBar

Usage parsing/fork normalization in `src/main/parsers.ts`, growth balance in `src/shared/game.ts`, and the fixtures in `tests/fixtures/upstream` are adapted from:

- https://github.com/chattymin/PokeTokenBar
- Revision: `42df4e61590fd049b299ec21c349f6d84f93a96a`
- Original files: `Sources/PokeTokenBar/Core/LocalUsageReader.swift`, `Sources/PokeTokenBar/Core/CompanionModel.swift`, and `Tests/PokeTokenBarTests/Fixtures`.
- Fixtures retain only session metadata and token-count events; conversation/tool records are removed.

The original MIT license follows below.

## Pokémon sprites

Creature sprites are downloaded at runtime from https://github.com/PokeAPI/sprites and cached locally. The UI bundles the unmodified `rare-candy.png` and `poke-ball.png` item sprites from that repository at revision `d72f64eb74912747cb5c5579061ced4842ba0a98`. Pokémon names and artwork belong to their respective rights holders. This is an unofficial personal fan project and is not affiliated with Nintendo, Game Freak, or The Pokémon Company.

The seven selectable ball images in `src/renderer/src/assets/balls/` are unmodified 160×160 bag sprites from **Pokémon Scarlet and Violet**, obtained from Bulbagarden Archives. They retain the games' silhouettes, raised panels and markings. These game images are not covered by this project's MIT license. Each original file page, download URL and SHA-256 is recorded in [`sources.json`](src/renderer/src/assets/balls/sources.json); for example, the [Luxury Ball source](https://archives.bulbagarden.net/wiki/File:Bag_Luxury_Ball_SV_Sprite.png). They are bundled locally and require no runtime connection to the archive. `node scripts/update-ball-art.mjs` refreshes these assets.

## Official localized names

Korean, English and Japanese Pokémon species, type and ball names in `src/shared/localized-catalog.json` come from the localized-name tables in [PokeAPI/pokeapi](https://github.com/PokeAPI/pokeapi/tree/81d20919845b6a445969b9265aab5cec6b04cece/data/v2/csv), revision `81d20919845b6a445969b9265aab5cec6b04cece`. The file records its source CSV URLs and language IDs (Korean 3, English 9, Japanese kana 1). Names are joined by species/type/item identifier, rather than translated from the Korean names. The upstream BSD 3-Clause notice and license are included in `src/renderer/public/licenses/PokeAPI-BSD-3-Clause.txt` and distributed in `out/renderer/licenses/PokeAPI-BSD-3-Clause.txt`. `node scripts/update-localized-catalog.mjs` regenerates this offline subset for the app's roster. Original app UI translations and contextual dialogue are authored in this repository.

## Galmuri pixel fonts

The UI bundles unmodified Galmuri11, Galmuri11 Bold, and Galmuri9 web fonts from https://github.com/quiple/galmuri at revision `71e1cacf1437a11220307120e63e30bc275312d4`, by Lee Minseo (quiple). They are licensed under the SIL Open Font License 1.1. The full upstream copyright notice and license are included in `src/renderer/public/licenses/Galmuri-OFL.txt` and distributed in `out/renderer/licenses/Galmuri-OFL.txt`.

## Runtime dependencies

Electron, React, better-sqlite3 and other dependencies retain their licenses in their respective npm packages. Build and development dependencies are listed and pinned in `package-lock.json`.

## Original PokeTokenBar license

MIT License

Copyright (c) 2026 chattymin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
