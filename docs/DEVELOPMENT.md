# 개발 안내

Electron + TypeScript + React로 만드는 Windows/macOS 데스크톱 펫입니다. 저장은 SQLite + better-sqlite3를 사용합니다.

## 로컬 실행

Node.js 22.12 이상과 npm을 준비합니다.

```sh
git clone https://github.com/KHLEE72/pokeTokenShimeji.git
cd pokeTokenShimeji
npm ci
npm run dev
```

관리 화면을 닫아도 트레이에서 실행됩니다. 테스트할 앱은 트레이에서 종료하세요.

## 자주 쓰는 명령

| 명령 | 용도 |
| --- | --- |
| `npm run dev` | 개발 실행 |
| `npm run typecheck` | 타입 검사 |
| `npm test` | 단위·통합 테스트 |
| `npm run build` | 타입 검사·네이티브 준비·앱 빌드 |
| `npm run start` | 빌드 결과 실행 |
| `npm run smoke` | 성장·저장·재실행 검사 |
| `npm run smoke:rewards` | 업적·볼·테마 검사 |
| `npm run smoke:i18n` | 세 언어·공식 이름·검색·저장 검사 |
| `npm run smoke:catalog` | 9세대 도감·일반/이로치 GIF/PNG·분기 진화·저장 검사 |
| `npm run smoke:rarity` | 분류 배지·희귀 수집 업적·볼/테마·캐릭터 대사·최소 크기 말풍선 검사 |
| `npm run smoke:forms` | 리전 진화·메가 무료/사탕 구매·공유·화면·저장 검사 |
| `npm run smoke:portable` | Windows portable EXE 실제 실행 검사 |

그 밖의 기능별 실행 검사는 `package.json`의 `smoke:*` 명령을 참고하세요. `npm test`는 Electron의 Node 런타임을 사용해 같은 SQLite 모듈을 검증합니다.

테스트는 임시 `POKETOKEN_DATA_DIR`와 `POKETOKEN_TEST_MODE=1`을 사용합니다. 실제 사용자 저장 데이터나 기본 로그 폴더를 테스트 fixture로 사용하지 않습니다.

### 포켓몬 데이터

`src/shared/catalog-data.json`에 1~9세대 기본 모습 1,025종·551계열, `localized-catalog.json`에 세 언어의 공식 명칭, `sprite-catalog.json`에 일반·이로치 이미지의 존재 여부와 소스 커밋을 보관합니다. 앱 실행 중 API로 목록을 가져오지 않으며 이미지만 필요할 때 다운로드합니다.

```sh
node scripts/update-pokemon-catalog.mjs
node scripts/update-localized-catalog.mjs
node scripts/update-sprite-catalog.mjs
```

추가 모습은 `node scripts/update-form-catalog.mjs`로 `form-catalog.json`을 만든 뒤 이미지 목록을 갱신합니다. 리전폼 57개, 진화/메가에 필요한 특별한 모습 6개, 메가폼 97개를 포함합니다. `form-dialogue.tsv`는 리전폼과 선행 모습의 창작 대사이며 일반 모습의 불꽃·몸 구조 설명을 그대로 복사하지 않습니다. 메가폼은 같은 포켓몬의 성격을 이어받고 달라진 몸 구조를 보정합니다.

기존 551개 계열 ID와 개체의 경로를 유지하며 새 계열 33개를 뒤에 붙입니다. 리전폼 전용 진화 종의 기존 독립 계열 10개는 저장 호환성을 위해 남기고 새 부화 후보에서는 제외합니다. 개체가 실제로 가진 경로에서 단계를 구해야 하므로 전역 `phase`를 선택 위치로 사용하지 않습니다.

`game.appearances`에 추가 모습의 일반/이로치 도감, 영구 해금 ID와 무료 선택 소진 여부를 저장합니다. 첫 메가 해금 1개는 무료, 이후에는 사탕 1,000개이며 사탕 차감과 상태 저장은 한 트랜잭션입니다. 스톤은 개체별 소모품이 아닌 공유 해금입니다. `pet.mega`는 표시 상태이고 성장 경로에 메가 노드를 넣지 않습니다. 레쿠쟈는 실제 스톤 대신 화룡점정 해금 ID를 사용합니다.

추가 2D 도트는 `scripts/extra-sprite-sources.json`에서 제작자·원본 URL·커밋·PNG 해시와 PBS 폼 번호를 고정하고 `python scripts/update-extra-sprites.py`로 검증·재생성합니다. 이 개발용 도구에는 Pillow가 필요하며 앱에는 포함하지 않습니다. 찌리비의 아틀라스 2개와 EBDX의 정사각형 PNG 스트립 430개를 GIF로 동봉합니다. 변환 전후 모든 프레임의 색·투명도·좌표·순서와 반복 프레임의 재생 시간을 비교하며, EBDX는 원본 프레임당 90ms로 재생합니다. 기존 Ghasty001 GIF 72개는 원본 그대로 실행 중 다운로드합니다.

동봉 GIF는 이전 PNG/GIF 캐시보다 먼저 사용하고 캐시 파일은 유지합니다. 다운로드형 GIF는 기존 PNG를 표시하며 백그라운드에서 갱신하고 실패 시 60초 뒤 재시도합니다. `npm run smoke:sprites`는 누적 255개 모습·504개 GIF를 실제 Electron IPC로 읽고 모든 프레임을 디코딩해 실제 픽셀 변화·해시·프레임 수를 검사합니다. 홈·펫 화면의 대표 이미지 재생, 재시작과 상태/캐시 보존도 확인합니다. 메가메가니움·메가장크로다일·메가거북손데스의 이로치는 EBDX의 일반/이로치 파일이 동일하므로 기존 PNG를 유지합니다. 이 세 종류만 이로치 애니메이션을 추가하지 않으며 일반 모습은 GIF입니다.

기본·125%·150% 실행 검사는 `POKETOKEN_TEST_SCALE`을 지정할 수 있습니다. 메가지가르데도 일반/이로치 2D 도트를 사용하며 GIF에 일러스트용 부드러운 렌더링을 적용하지 않습니다. 기존 PokeAPI PNG/일러스트는 동봉 파일이 없는 경우를 위한 대체 소스로 남겨 둡니다. 원본 PNG·개발용 다운로드 캐시와 검증 보고서는 `artifacts/`에만 남기고, 실행에 필요한 변환 GIF와 크레딧은 `src/renderer/public/`에 보관합니다.

앞의 두 스크립트는 같은 고정 PokeAPI CSV 커밋을 사용합니다. 스프라이트 스크립트는 GitHub CLI의 `gh api`로 고정 커밋의 파일 목록을 확인합니다. 새 이미지 목록으로 갱신하려면 `--refresh`를 지정합니다. 개발용 다운로드 캐시는 `artifacts/`에 남고 배포·Git에 포함되지 않습니다. 기존 19개 `family` 번호는 저장 호환성 때문에 순서를 바꾸지 않습니다. 이후 추가되는 계열 번호도 변경 시 저장 데이터 이동이 필요합니다.

알 타입은 계열 첫 형태의 타입입니다. 원작 조건은 생략하고 여러 진화형은 목표 선택으로 처리합니다. 리전폼 전용 연결은 일반 모습의 진화로 연결하지 않고 후속 종을 독립 부화시킵니다. 일반·전설·환상 계열의 부화 가중치는 같은 타입 알 안에서 각각 100·10·3이며 고정 퍼센트가 아닙니다. 이로치 판정은 부화당 1/64로 별도입니다.

도감 분류는 `rarity.ts`에서 주요 전설 27종·준전설 44종·환상 23종으로 나눕니다. 준전설은 공식 용어가 아닌 앱의 표시 구분이며 실제 대회의 현재 출전 가능 여부를 뜻하지 않습니다. 분류 배지는 부화 가중치를 바꾸지 않습니다. 업적은 일반·이로치를 합쳐 같은 종을 한 번만 세고, 기존 보상 날짜와 개체·언어·성장 데이터를 유지합니다.

### 캐릭터 대사

`node scripts/update-dialogue-profiles.mjs`로 `character-profiles.json`을 생성합니다. 고정된 도감 자료의 처음 3개 영어 출시판 설명을 근거로 사용하며, 나중의 리전폼·메가진화 설명이 기본 모습에 섞이지 않도록 합니다. 원문 도감 설명은 앱에 넣지 않습니다.

- `dialogue-facts.tsv`: 생태·행동 특징 142개의 원본 창작 문구와 근거 키워드.
- `dialogue-signatures.tsv`: 전설·환상 전종과 스타팅을 포함한 334종의 개별 대표 대사·말투.
- `dialogue-scenes.tsv`: 몸 구조 13종·말투 12종과 특징별 상황 문장, 주요 종의 전용 상호작용.
- `character-dialogue.ts`: 종별 프로필을 조합해 7상황·3언어·각 3개 대안을 선택합니다. 이름·타입을 공통 문장 앞에 붙이는 방식은 쓰지 않습니다. 초기 스타팅과 이브이 계열의 한국어 전용 대사는 유지합니다.

자료를 수정한 후 생성 스크립트와 타입 검사·대사 테스트·`smoke:rarity`를 실행하세요. 꼬리·날개·껍질·가면·지느러미 등의 신체 특징과 잡기/낙하 문장이 맞는지 확인합니다. 앱 실행 중 LLM이나 도감 API를 호출하지 않습니다.

테스트 런처는 `POKETOKEN_TEST_MODE=1`일 때만 `POKETOKEN_TEST_HATCH=first`로 부화를 재현하며 운영 앱의 무작위 선택에는 영향을 주지 않습니다.

## 패키징

### Windows x64

```sh
npm run dist:win
npm run smoke:portable
```

### macOS

대상 아키텍처의 Mac에서 의존성을 설치한 뒤 빌드합니다.

```sh
npm ci
npm run dist:mac:arm64
# Intel Mac: npm run dist:mac:x64
```

결과는 `release/`에 생성됩니다. SQLite 네이티브 모듈은 Electron과 대상 아키텍처에 맞춰 재빌드합니다. 소스 빌드가 필요한 경우 Windows에는 Visual Studio C++ 빌드 도구와 Windows SDK, Mac에는 Xcode Command Line Tools가 필요합니다.

배포 패키지에는 대상 OS·아키텍처에 맞는 SQLite prebuild 하나와 실행용 JavaScript·라이선스를 넣습니다. 다른 OS용 바이너리와 SQLite·node-addon-api의 C/C++ 소스·헤더·빌드 도구는 제외하며, 개발용 `node_modules`는 그대로 유지합니다. Electron 언어 리소스는 영어·한국어·일본어와 Mac 공통 `Base` 리소스만 포함합니다. `afterPack`의 `scripts/verify-package.cjs` 검사가 필수 파일·라이선스 누락이나 잘못된 바이너리를 발견하면 빌드를 중단합니다.

개인용 빌드는 배포 인증서·공증·자동 업데이트를 사용하지 않습니다. Mac에는 테스트용 ad-hoc 서명을 적용하며, 빌드 성공과 실제 OS에서의 실행 검증을 구분합니다. Mac이 없다면 **Actions → Mac test build → Run workflow**에서 아키텍처를 선택해 Mac 러너에서 빌드·검사할 수 있습니다. 배포 파일에 맞는 실행 안내는 [Mac 안내](MAC_TESTING.md)를 참고하세요.

## 주요 코드

| 위치 | 역할 |
| --- | --- |
| `src/main/` | 앱·트레이·창·입력, 로그 수집·파서·저장, 이미지 캐시 |
| `src/preload/` | 화면에 노출하는 제한된 IPC |
| `src/renderer/` | 펫 화면·관리 화면·스타일 |
| `src/shared/` | 성장·도감·사탕·진화·업적·번역·대사 |
| `native/` | Windows PowerShell/Win32, Mac Swift/Core Graphics 창 감지 |
| `tests/`, `scripts/` | fixture와 단위·통합·실행 검사 |

## 문서와 이미지

[README](../README.md)의 화면은 개인 데이터와 분리한 예시 저장 상태로 촬영했습니다. `docs/images/`의 PNG는 실제 앱 화면과 앱 아이콘이며, 네 개의 포켓몬 GIF는 앱이 사용하는 [PokeAPI/sprites](https://github.com/PokeAPI/sprites/tree/master/sprites/pokemon/versions/generation-v/black-white/animated)에서 받은 원본입니다. 이미지를 바꿀 때 로그 경로·개인 사용량·대화 내용이 포함되지 않는지 확인하세요.

[작업 안내](../AGENTS.md) · [검증 기록](VALIDATION.md) · [서드파티 고지](../THIRD_PARTY_NOTICES.md)
