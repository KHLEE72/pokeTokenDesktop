# Third-party notices

## PokeTokenBar

Usage parsing/fork normalization in `src/main/parsers.ts`, growth balance in `src/shared/game.ts`, and the fixtures in `tests/fixtures/upstream` are adapted from:

- https://github.com/chattymin/PokeTokenBar
- Revision: `42df4e61590fd049b299ec21c349f6d84f93a96a`
- Original files: `Sources/PokeTokenBar/Core/LocalUsageReader.swift`, `Sources/PokeTokenBar/Core/CompanionModel.swift`, and `Tests/PokeTokenBarTests/Fixtures`.
- Fixtures retain only session metadata and token-count events; conversation/tool records are removed.

The original MIT license follows below.

## Pokémon sprites

Sprites are downloaded at runtime from https://github.com/PokeAPI/sprites and cached locally. They are not bundled with this project. Pokémon names and artwork belong to their respective rights holders. This is an unofficial personal fan project and is not affiliated with Nintendo, Game Freak, or The Pokémon Company.

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
