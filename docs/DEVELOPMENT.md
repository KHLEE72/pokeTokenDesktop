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
| `npm run smoke:portable` | Windows portable EXE 실제 실행 검사 |

그 밖의 기능별 실행 검사는 `package.json`의 `smoke:*` 명령을 참고하세요. `npm test`는 Electron의 Node 런타임을 사용해 같은 SQLite 모듈을 검증합니다.

테스트는 임시 `POKETOKEN_DATA_DIR`와 `POKETOKEN_TEST_MODE=1`을 사용합니다. 실제 사용자 저장 데이터나 기본 로그 폴더를 테스트 fixture로 사용하지 않습니다.

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
