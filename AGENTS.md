# PokeToken Desktop 작업 안내

Claude Code·Codex의 로컬 토큰 기록으로 포켓몬을 키우는 Windows/macOS 데스크톱 펫이다.
Electron + React + TypeScript + SQLite를 사용한다. 사용법은 [README.md](README.md), 기존 검증과 알려진 한계는 [docs/VALIDATION.md](docs/VALIDATION.md)를 참고한다.

## 작업 방식

- 개인 프로젝트다. 작은 변경은 기존 코드 스타일에 맞춰 바로 진행하고, 불필요한 절차나 큰 구조 변경을 추가하지 않는다.
- 작업 설명은 한국어로 한다. 앱의 첫 실행 언어는 영어이며, 사용자가 고른 한국어·영어·일본어는 재실행 후에도 유지한다.
- 요청한 기능에 집중한다. 새로운 의존성이나 추상화는 실제로 필요할 때만 추가한다.
- 작업 중 반복해서 도움이 될 프로젝트 지식이나 주의점을 확인하면 이 문서를 짧게 보완한다.

## 코드 위치

- `src/main/`: 앱·트레이·창 관리, 펫 이동과 입력, 로그 파싱·스캔, SQLite 저장, 이미지 캐시. 스캔과 저장은 worker에서 처리한다.
- `src/preload/`: 화면에 노출하는 IPC API. 화면에서 Node.js를 직접 사용하지 않는다.
- `src/renderer/`: React 관리 화면, 펫 화면과 포인터 이벤트, 스타일.
- 관리 화면의 `scrollbar-gutter: stable`은 알 보관함을 열고 닫을 때 카드 폭을 유지한다. 투명 펫 창에는 적용하지 않는다. `smoke:dashboard`는 세 언어·라이트/다크·최소/기본 창에서 폭을 비교하며 `POKETOKEN_TEST_SCALE`로 배율을 지정할 수 있다.
- `src/shared/`: 데이터 모델, 성장·사탕·도감 규칙, 포켓몬 목록과 대사.
- `form-catalog.json`은 `scripts/update-form-catalog.mjs`와 `form-dialogue.tsv`에서 생성한다. 기존 551개 계열 ID를 보존하고 새 계열만 뒤에 붙인다. 연결된 리전폼 진화 전용 종은 새 알 후보에서 제외하되, 기존 독립 개체·경로·완료 기록은 유지한다. 단계는 전역 `PokemonSpecies.phase` 대신 개체 `path` 안의 위치로 판정한다.
- 리전폼·특별한 모습·메가폼 수집은 `game.appearances`에 기본 도감과 별도로 저장한다. `megaStones`와 첫 무료 선택 소진 상태는 일반/이로치·모든 개체가 공유하며 구매와 사탕 차감을 같은 트랜잭션으로 저장한다. 메가는 성장 단계가 아닌 `pet.mega` 표시 상태이고 `appearanceId`로 렌더링한다. `smoke:forms`로 구매·리전 진화·세 언어·최소 창·재시작을 확인한다.
- `src/shared/rewards.ts`: 업적 조건·볼·테마 목록. 볼 아이콘과 업적·테마 UI는 `src/renderer/src/balls.tsx`, `rewards-ui.tsx`, `rewards.css`에 있다.
- `league-catalog.json`은 작품별 파티·채택 전투·출처를 보관한다. 집계는 일반/이로치/폼을 전국도감 종으로 합치고 `league-v1`에 영구 해금과 배지 8개·칭호 1개 전시를 저장한다. 기존 목표 ID를 바꾸지 않는다. 기준은 `docs/LEAGUE_CATALOG.md`, 실행 검사는 `smoke:league`를 따른다. 사이드바 검사는 순서 대신 `data-tab`을 사용한다.
- 업데이트는 `src/main/update-service.ts`·`updates.ts`에서 수행한다. Windows 설치형은 `electron-updater`, portable은 `portable-update.ts`·`native/portable-update.ps1`로 SHA-256 검증·저장 후 종료·원래 EXE 교체·시작 확인/복구를 수행한다. 임시 서명 Mac은 다운로드 링크를 사용한다. 앱에 GitHub 토큰을 넣지 않는다. 업데이트 버튼은 사이드바에 있고 전시한 증표는 그 아래와 홈 인사말 오른쪽에 표시한다. `docs/UPDATES.md`·`smoke:updater`·`smoke:portable-update`를 참고한다. 교체 테스트는 실제 사용자 EXE를 대상으로 하지 않는다.
- Windows 업데이트는 숨긴 bootstrap에서 `.NET ProcessStartInfo`의 `UseShellExecute`·`WindowStyle.Hidden`으로 독립된 보조 프로그램을 시작한다. `Start-Process`는 `[]`가 있는 작업 폴더를 와일드카드로 처리할 수 있으므로 쓰지 않는다. 직접 연결한 자식은 앱 종료와 함께 닫힐 수 있고, `detached`는 PowerShell 스크립트를 실행하지 않고 끝날 수 있다. 파일 stdio·캐시 cwd·리터럴 경로 인용을 유지한다. 해시는 `.NET`으로 계산하고 PowerShell `File.Replace` 복구 인수에 `$null` 대신 구체적인 임시 경로를 사용한다.
- `src/shared/rarity.ts`: 주요 전설·준전설·환상의 앱 표시 분류. 600족·울트라비스트·패러독스를 임의로 전설로 바꾸지 않으며 부화 가중치와 분리한다. 새 업적은 일반/이로치 합산 종수로 기존 기록도 인정한다. `smoke:rarity`로 배지·테마·언어·저장 상태를 확인한다.
- `character-profiles.json`: 고정된 도감 근거와 `dialogue-facts.tsv`·`dialogue-signatures.tsv`·`dialogue-scenes.tsv`에서 `node scripts/update-dialogue-profiles.mjs`로 생성한다. 공식 원문을 그대로 대사로 넣지 않는다. 리전폼 설명을 기본 모습에 적용하거나 날개 없는 종에게 비행·지느러미 종에게 발 착지를 말하게 하지 않는다. 이름/타입 접두사만 바꾼 공통 대사를 다시 넣지 않는다.
- `src/shared/i18n.ts`, `messages.json`: 한국어·영어·일본어 문구와 저장된 알림 표시. 포켓몬·타입·볼의 공식 명칭은 ID로 `localized-catalog.json`에서 조회한다. 언어 변경은 게임·사용량 기록을 수정하지 않는다. 화면 변경은 `smoke:i18n`으로 세 언어의 최소 창 크기·검색·저장도 확인한다.
- `src/shared/dex.ts`: 도감 번호·공식 이름·최초 등록 순서 정렬. `owned`·`ownedShiny`의 기존 등록 순서를 보존한다. 한국어 선택자를 쓰는 실행 검사는 `scripts/test-electron.mjs`에서 언어를 명시하고, 기본 언어 검사는 원래 Playwright 런처를 사용한다.
- `catalog-data.json`·`localized-catalog.json`·`sprite-catalog.json`: 1~9세대 기본 모습 1,025종·공식 이름·고정 커밋 이미지 목록. `scripts/update-*-catalog.mjs`로 생성한다. 기존 19계열의 `family` 번호를 재배열하지 않는다. 리전폼 전용 진화는 기본 모습에 연결하지 않는다. GIF 없는 종은 정적 PNG를 쓰고 일반/이로치 캐시를 구분한다. 목록·부화·이미지 변경은 `smoke:catalog`도 확인한다.
- `native/`: Windows PowerShell/Win32 및 macOS Swift 창 감지 보조 프로그램.
- `tests/`, `scripts/`: 단위·통합 테스트와 Electron 실행 검사, 빌드 도구.

## 실행과 검증

Node.js 22.12 이상과 npm을 사용하며, 의존성 설치는 `npm ci`로 한다.

| 명령 | 용도 |
| --- | --- |
| `npm run dev` | 개발 실행 |
| `npm run typecheck` | TypeScript 검사 |
| `npm test` | Electron의 Node 런타임으로 테스트 실행 |
| `npm run build` | 타입 검사·네이티브 준비·앱 빌드 |
| `npm run smoke` | 빌드된 앱의 성장·저장·화면·재시작 검사 |
| `npm run dist:win` | `release/`에 Windows x64 portable EXE 생성 |

- 코드 변경은 타입 검사와 관련 테스트로 확인한다. 버그 수정은 재현 조건을 검증하는 테스트가 유용하면 추가한다.
- 앱 실행에 영향을 주면 빌드 후 실행 검사도 한다. 펫·창·배율·입력 변경은 `package.json`의 관련 `smoke:*` 명령을 선택한다.
- Windows 입력 변경은 `smoke:delivery`로 잠금 없는 누름 누락·자동 창 교체·상태 보존도 확인한다. 네이티브 좌표는 물리 픽셀이고, 판정에는 샘플 창 크기로 변환한 좌표와 실제 잡기 시작 응답을 함께 사용한다. 단순 hover나 짧은 클릭의 샘플 부재만으로 복구하지 않는다.
- 문서만 변경하면 내용·링크·명령 확인으로 충분하다. 결과를 보고할 때 실제로 확인한 범위를 적는다.
- 네이티브 모듈 설치가 실패하면 Electron 호환성과 빌드 도구를 확인한다. Windows에는 C++ 빌드 도구와 Windows SDK, macOS에는 Xcode Command Line Tools가 필요할 수 있다.
- 릴리스 빌드 전에는 현재 브랜치와 `package.json`의 버전을 확인한다. EXE 생성 후 `npm run smoke:portable`로 실제 실행 파일도 확인한다.
- 패키징은 대상 OS·아키텍처의 SQLite prebuild만 남기고 C/C++ 소스·빌드 도구를 제외한다. 개발용 `node_modules`는 수정하지 않는다. `scripts/verify-package.cjs`가 실제 패키지의 바이너리·필수 파일·라이선스를 검사하므로 의존성이나 패키지 필터 변경 시 함께 확인한다.
- `electron-builder.yml`의 OS별 `files`에는 전체 허용 목록을 유지한다. 제외 규칙만 별도 FileSet에 넣으면 전체 체크아웃이 복사될 수 있다. 패키지에는 `out/`·실행 의존성·트레이 아이콘·필수 메타데이터/라이선스만 허용한다.
- Portable 검사에서 `petting` 대신 `landing`이 나오면 테스트 중 실제 커서 이동이 드래그로 판정됐는지 `ipc.drag`의 전후 좌표와 결과를 먼저 확인한다. 입력 누락과 구분해 검증 결과를 기록한다. 검사는 네이티브 커서가 4px 넘게 움직여 `drop`으로 처리된 경우만 최대 3회 다시 클릭하며, 입력 누락·정지 커서의 잘못된 `drop`은 실패로 남긴다.
- Mac 워크플로의 `release_tag`에 기존 릴리스 초안 태그를 지정하면 검증 후 DMG와 빌드 정보를 초안에 직접 첨부한다. 태그와 빌드 커밋이 같아야 하며 Actions 아티팩트 용량 제한을 사용하지 않는다. 최종 게시 전에 모든 파일과 해시를 확인한다.

### Windows SDK가 없는 환경에서의 빌드

`better-sqlite3 13.0.3`에는 Windows x64 Node-API 바이너리가 포함되어 있다. v0.4.8에서 아래 방법으로 설치·패키징 후 Electron 테스트와 실제 portable EXE 실행을 확인했다.

- 설치가 자동 재빌드에서 실패하면 `npm ci --ignore-scripts` 후 `node node_modules/electron/install.js`로 Electron을 설치할 수 있다.
- `npm test`와 `npm run build`가 통과하면 `npm exec electron-builder -- --win portable --x64 --publish never --config.npmRebuild=false`로 이번 빌드의 재빌드만 건너뛴다.
- 패키지 버전·플랫폼 변경 시에는 동봉 바이너리 호환성을 다시 확인한다. 이 우회를 전역 npm 설정이나 기본 빌드 설정에 넣지 않는다.

## 유지할 동작

- 기존 성장·도감·설정과 SQLite 저장 데이터를 보존한다. 저장 형식을 바꾸면 기존 데이터에서의 이동도 함께 처리한다.
- 분기 진화는 개체가 실제로 거친 경로와 선택한 목표를 보존한다. 도감에 등록하는 형태와 완료 기록도 실제 진화 결과를 따른다.
- 업적은 `achievements-v1` 메타에 영구 보관하고 기존 성장·도감 기록으로도 해금한다. 토큰 업적은 최초 연결의 과거 사용량 대신 `game.tokensEarned`로 판정한다. 개체의 `ball`, 설정의 `theme`·`inBall`은 각각 독립적이다.
- 작은 볼은 40px이며 펫 창의 크기·클릭 영역·낙하·창 착지도 이 크기를 따른다. 볼·테마 변경은 `smoke:rewards`로 확인한다.
- 볼 그림은 `src/renderer/src/assets/balls/`에 동봉한 게임 원본 160px PNG를 사용한다. 돌출된 장식과 버튼을 자르지 않고 `object-fit: contain`, `image-rendering: auto`를 유지한다. 출처·해시는 같은 폴더의 `sources.json`에 기록한다. 포켓몬 스프라이트의 픽셀 렌더링은 별도다.
- 최초 연결의 과거 로그는 사용량에만 반영한다. 재시작·로그 이동·세션 보관으로 토큰이나 경험치를 중복 지급하지 않으며, Codex 추론 토큰은 출력에 포함되어 있으므로 다시 더하지 않는다.
- 펫의 클릭 통과·드래그·낙하·창 착지·절전 복귀와 작업 중인 앱의 키보드 포커스를 유지한다. OS 창 동작은 빌드 성공만으로 검증됐다고 판단하지 않는다.
- 원본 도구 로그는 읽기만 한다. 대화 본문·인증 정보·키보드 입력·다른 창 제목을 저장하거나 전송하지 않고, 대사는 로컬에서 선택한다.
- 테스트 실행은 임시 `POKETOKEN_DATA_DIR`와 `POKETOKEN_TEST_MODE=1`을 사용해 실제 성장 데이터와 기본 로그 폴더에서 분리한다.
- 생성물·실행 파일·개인 로그·DB는 Git에 넣지 않는다. 예외인 테스트 fixture와 필요한 `build/` 아이콘은 기존 `.gitignore`를 따른다.
