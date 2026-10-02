# PokeToken Desktop

Claude Code·Codex에 쓴 토큰으로 포켓몬을 키우는 윈도우·맥 데스크톱 펫입니다. 세 스타터 계열, 총 9종의 부화·진화·수집을 지원합니다.

## 실행

윈도우 빌드 결과는 `release/PokeToken-Desktop-0.2.0-win-x64.exe`입니다. 실행하면 관리 화면과 화면 아래의 알이 나타납니다. 관리 화면을 닫아도 트레이에서 계속 실행됩니다. 완전히 종료하려면 트레이 메뉴의 **종료**를 선택하세요. 실행 파일은 Git에 포함하지 않으며 아래 패키징 명령으로 만듭니다.

기존 버전이 실행 중이면 트레이에서 종료한 뒤 새 실행 파일을 실행하세요. 같은 앱 데이터 폴더를 사용하므로 기존 성장·도감·설정은 유지됩니다.

개발 환경에는 Node.js 22.12 이상이 필요합니다.

```sh
git clone https://github.com/KHLEE72/pokeTokenShimeji.git
cd pokeTokenShimeji
npm ci
npm run dev
```

운영 빌드 실행과 검증:

```sh
npm run build
npm run start
npm test
npm run smoke
npm run smoke:pet
# Windows portable 파일을 만든 뒤에는 npm run smoke:portable
```

`npm test`는 Electron의 Node 런타임으로 실행하므로 Electron에 맞춰 빌드된 SQLite 모듈을 그대로 검증합니다. 설치에 사용하는 npm registry는 이 프로젝트의 `.npmrc`에서만 공개 npm으로 지정합니다.

## 사용법

- 기본 로그 폴더에서 Claude Code·Codex 기록을 자동으로 찾습니다. 처음 연결한 기록은 사용량에만 표시하고 이후 새로 사용하는 토큰부터 성장합니다.
- 캐릭터를 클릭하면 관리 화면이 열립니다. 마우스로 집어 옮기면 놓은 화면의 아래쪽으로 내려갑니다. 오른쪽 클릭과 트레이에서 숨기기·이동 일시정지·설정·종료를 사용할 수 있습니다.
- 잡고 움직이면 캐릭터가 매달려 흔들리고, 놓으면 그 높이에서 가속하며 떨어집니다. 착지할 때 살짝 눌렸다 튀며 쉬었다가 다시 걷습니다. 걷기를 일시정지해도 낙하는 마칩니다.
- 알과 9종의 포켓몬은 평소·잡기·낙하·착지·성장·토큰 증가 상황에 맞는 대사를 랜덤으로 말합니다. 같은 상황에서 같은 문장이 연달아 나오지 않으며, 평소 대사는 약 35~65초 간격입니다. 토큰 반응은 최대 1분에 한 번입니다. 대사는 로컬 목록에서 선택하며 AI를 호출하지 않습니다.
- 설정에서 성장 속도, 96/128/192px 크기, 모니터와 자동 시작을 변경합니다. 자동 시작은 기본으로 꺼져 있습니다.
- 로그는 10초마다 확인하고 새 파일은 60초마다 찾습니다. **새로고침**은 새 파일도 즉시 탐색합니다.
- 없는 폴더는 오류 없이 기다리고, 불완전한 기록은 다음 변경 때 다시 읽습니다. 로그가 기록되지 않는 도구 사용은 집계할 수 없습니다.
- 기존 파일을 이동하거나 세션을 보관해도 동일한 사용량을 다시 경험치로 지급하지 않습니다. 앱을 꺼둔 동안의 새 사용량은 다음 실행 때 반영합니다.

## 로그 위치와 WSL

| 도구 | 기본 로그 위치 |
| --- | --- |
| Claude Code | `$CLAUDE_CONFIG_DIR/projects` 또는 `~/.claude/projects` |
| Codex | `$CODEX_HOME/sessions`, `$CODEX_HOME/archived_sessions` 또는 `~/.codex` 아래 동일 폴더 |

추가 폴더는 **설정 → 토큰 사용 기록 연결 → 폴더 추가**에서 도구별로 연결합니다. Claude는 `projects` 폴더를, Codex는 `sessions`/`archived_sessions` 폴더를 선택하세요. WSL은 `\\wsl.localhost\배포판\home\사용자\.claude\projects` 등의 Windows에서 접근 가능한 경로를 선택합니다. 배포판이 실행 중이고 경로를 읽을 수 있어야 합니다.

이 앱은 로컬 개발도구 기록을 읽습니다. ChatGPT·Claude 웹사이트의 사용량이나 공식 계정 사용 한도는 조회하지 않습니다.

## 성장

입력·출력·캐시를 중복 없이 합산한 1토큰이 1XP가 됩니다. Codex의 추론 토큰은 출력 토큰에 포함되어 있으므로 다시 더하지 않습니다. 캐시 쓰기는 원본 Codex 파서의 집계 규칙에 따라 별도 합산하지 않습니다.

| 단계 | 빠름 (기본) | 기본 | 느림 |
| --- | ---: | ---: | ---: |
| 부화 | 50만 | 500만 | 1,000만 |
| 첫 진화 | 추가 5,000만 | 추가 5억 | 추가 10억 |
| 최종 진화 | 추가 1억 | 추가 10억 | 추가 20억 |
| 성장 완료 | 추가 1억 5,000만 | 추가 15억 | 추가 30억 |

초과 경험치는 다음 단계로 넘어갑니다. 세 계열을 모두 완성하기 전에는 미완성 계열 중에서 부화하고, 이후에는 중복 수집할 수 있습니다. 속도 변경은 현재 단계의 진행률을 유지합니다.

## 저장과 네트워크

SQLite 파일과 이미지 캐시는 Electron의 앱 데이터 폴더 아래 `PokeToken Desktop`에 저장됩니다. Windows의 기본 위치는 `%APPDATA%\PokeToken Desktop`, Mac은 `~/Library/Application Support/PokeToken Desktop`입니다. 앱이 닫혀 있을 때 폴더 전체를 복사하면 수동 백업할 수 있습니다.

저장되는 로그 정보는 토큰 수, 시각, 세션/이벤트 식별 정보입니다. 대화 본문과 인증 정보는 저장하거나 전송하지 않습니다. 네트워크 요청은 포켓몬 이미지 다운로드용 `raw.githubusercontent.com`에만 보냅니다. 받은 이미지는 오프라인에서도 사용하며 다운로드 실패 시 이름이 있는 대체 그림을 보여줍니다. 펫은 AI를 호출하지 않습니다.

## 패키징

Windows x64에서:

```sh
npm run dist:win
```

Mac에서 대상 아키텍처에 맞춰 의존성을 설치한 뒤:

```sh
npm ci
npm run dist:mac:arm64
# Intel Mac에서는 npm run dist:mac:x64
```

결과는 `release/`에 저장됩니다. SQLite 네이티브 모듈은 설치·패키징 시 Electron과 대상 아키텍처에 맞춰 재빌드합니다. 소스 빌드가 필요한 경우 Windows에는 Visual Studio C++ 빌드 도구, Mac에는 Xcode Command Line Tools가 필요합니다.

개인용 빌드는 개발자 인증서 서명·공증과 자동 업데이트를 사용하지 않습니다. Mac 앱에는 테스트용 ad-hoc 서명을 적용합니다. Mac은 해당 OS에서 패키징하고 실제 실행을 확인해야 합니다. 빌드 성공만으로 클릭 통과·Spaces·모니터·절전 복귀가 검증되지는 않습니다. 상세한 실기 확인 항목은 [검증 기록](docs/VALIDATION.md)을 참고하세요.

Mac이 없는 개발 환경에서는 저장소 **Actions → Mac test build → Run workflow**에서 `arm64`(M 시리즈) 또는 `x64`(Intel)를 선택합니다. 각 아키텍처의 Mac 러너에서 의존성 설치·테스트·DMG 패키징·패키지 앱 실행을 수행합니다. 결과 파일과 안내문은 실행 결과의 Artifacts에 저장됩니다. [친구에게 전달할 Mac 테스트 안내](docs/MAC_TESTING.md)를 참고하세요.

## 참고 소스

PokeTokenBar의 로그 처리와 성장 규칙을 참고한 별도의 Electron 앱입니다. 원본 저장 파일은 가져오지 않습니다. 코드와 테스트의 원본 고지는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있습니다. 포켓몬 이미지·명칭의 권리는 해당 권리자에게 있으며 앱 코드는 이미지 권리를 포함하지 않습니다.
