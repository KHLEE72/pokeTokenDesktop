# GitHub Releases 업데이트

별도 서버 없이 `KHLEE72/pokeTokenDesktop`의 공개 GitHub Releases를 조회합니다. 앱에는 GitHub 토큰을 넣지 않습니다. 현재 저장소가 비공개라면 공개 업데이트 피드를 읽을 수 없다는 안내가 나오며, 앱의 성장·사용량 수집은 계속 동작합니다. 실제 사용자에게 제공하기 전 공개된 배포 저장소가 필요합니다. 릴리스 게시와 저장소 공개 전환은 별도로 관리합니다.

## 사용 방식

저장소 이름은 `pokeTokenShimeji`에서 `pokeTokenDesktop`으로 변경했습니다. v1.2.1부터 업데이트 API·다운로드 주소 검증·패키징 설정에 새 이름을 사용합니다. 기존 v1.2.0 이하 실행 파일은 GitHub API가 새 주소로 연결되더라도 다운로드 URL의 이전 저장소 이름을 엄격하게 검사하므로 v1.2.2 이상을 한 번 수동으로 받아야 합니다. GitHub의 웹/Git 주소 리디렉션과 앱의 업데이트 검증은 다릅니다. 이전 저장소와 릴리스는 별도의 비공개 보관 저장소에 유지합니다. 현재 저장소는 정리된 Git 기록으로 독립 생성했으며, 사용자 데이터 위치는 같습니다.

- 앱 시작 20초 후와 6시간마다 확인합니다. 사이드바 **설정 아래의 업데이트 확인** 버튼 또는 트레이에서 확인할 수 있고, 별도의 업데이트 대화상자가 열립니다. 연속 확인은 1분 간격으로 제한합니다.
- **Windows 설치형:** 새 버전 알림 → 사용자가 다운로드 → `저장하고 재시작하여 업데이트`. 적용 직전에 사용량 스캔과 SQLite WAL 체크포인트를 기다립니다. 단순 종료 시 자동 설치하거나 사용자 확인 없이 앱을 재시작하지 않습니다.
- **Windows portable:** `업데이트하고 재시작`을 누르면 portable EXE만 다운로드합니다. GitHub 자산의 SHA-256·크기와 EXE 헤더를 검증하고, 사용량 스캔과 SQLite WAL 저장을 기다립니다. 잠깐 실행되는 숨겨진 PowerShell 보조 프로그램이 새 파일을 원래 EXE와 같은 폴더에 준비한 뒤 앱을 종료합니다. Portable 런처의 파일 잠금까지 풀리면 원래 이름/위치의 EXE를 백업하면서 원자적으로 교체하고 다시 실행합니다. 새 버전에서 DB와 두 화면의 시작 확인을 받으면 백업/다운로드를 정리합니다. 사용자가 파일 이름을 바꾼 경우에도 같은 이름을 유지합니다.
- 다운로드·검증·폴더 쓰기/준비 오류에서는 기존 앱을 종료하지 않습니다. 새 EXE가 시작 확인 전에 종료되면 이전 EXE로 복구하고 다시 실행합니다. 새 EXE가 멈춘 채 파일을 잠그고 있으면 강제로 프로세스를 종료하거나 덮어쓰지 않고 `.backup-<ID>` 파일을 보관합니다. 디스크/권한 문제까지 모든 상황에서 자동 복구를 보장하지 않습니다. 보조 프로그램은 업데이트 동안에만 실행하며, 원본 로그/사용자 DB를 교체하거나 삭제하지 않습니다.
- **현재 Mac 배포:** 해당 아키텍처의 새 DMG를 확인하고 다운로드합니다. 임시 서명 배포에서 자동 교체를 시도하지 않습니다. Mac의 앱 내 자동 교체는 Developer ID 서명과 DMG+ZIP 배포를 준비한 뒤 별도로 검증해야 합니다.
- 프리뷰/초안은 업데이트 대상으로 삼지 않습니다. Windows 설치형은 `latest.yml`, portable/Mac은 공개 릴리스 중 해당 OS/아키텍처 파일이 있는 최신 정식 버전을 확인합니다. Portable은 설치형으로 전환하지 않으며, GitHub 자산에 SHA-256/크기가 없으면 검증 오류로 중단합니다. 다른 OS만 새로 배포된 경우 잘못된 파일을 제안하지 않습니다.
- 설치형/portable의 데이터 위치는 기존과 같은 `PokeToken Desktop/poketoken.sqlite`입니다. 설치 프로그램의 제거 설정은 사용자 데이터를 자동 삭제하지 않습니다.

## 빌드와 게시

현재 릴리스에는 **Windows x64 portable EXE 1개와 Mac arm64/x64 DMG 2개**, 실행 파일 3개만 첨부합니다. 설치형·blockmap·업데이트 YAML·별도 해시/빌드 정보 파일은 첨부하지 않습니다. 해시와 빌드 커밋·검증 범위는 릴리스 본문에 기록하고 상세 보고서는 로컬/CI에 보관합니다. Portable 업데이트는 GitHub 자산의 SHA-256과 크기를 사용하므로 별도 해시 파일이 필요하지 않습니다. 기존 릴리스의 첨부 파일은 소급 삭제하지 않습니다.

Windows는 `npm run dist:win:portable`로 빌드합니다. 기존 `npm run dist:win`과 **Windows release build** 워크플로는 설치형·blockmap·`latest.yml`도 만드는 전체 배포용이므로 현재의 포터블 전용 배포에 그대로 사용하지 않습니다. GitHub 릴리스의 **Set as a pre-release** 플래그는 버전과 일치시켜야 합니다. 앱은 프리뷰 릴리스를 건너뜁니다. `--publish never`를 사용하므로 로컬 빌드로 게시하지 않습니다.

1. 배포할 커밋의 `package.json` 버전과 태그가 같은지 확인합니다.
2. 해당 커밋을 가리키는 `v<version>` 태그와 GitHub 릴리스 **초안**을 준비합니다. 프리뷰 버전이면 pre-release를 켜고, 정식 버전이면 끕니다. 게시 스크립트가 버전과 이 플래그의 일치를 검사합니다.
3. 해당 커밋의 Windows portable을 빌드·확인하고 EXE만 초안에 첨부합니다. Mac은 **Mac test build**를 같은 태그에서 실행하고 `architecture=both`, `release_tag`에 초안 태그를 지정합니다.
4. Mac 워크플로는 네이티브 빌드·서명 검증·패키지 실행 확인 후 DMG와 빌드 정보를 초안에 첨부합니다. 빌드 정보는 로컬로 내려받아 소스 커밋·아키텍처·해시를 확인하고, 해당 메타데이터 첨부를 새 초안에서 제거합니다. 실행 파일 3개의 이름·크기·GitHub SHA-256을 다시 대조하고 본문에 해시와 검증 범위를 기록합니다. GitHub가 자동 제공하는 소스 압축 파일은 별도입니다.
5. 파일 3개와 태그·버전이 일치하면 초안을 게시합니다. 워크플로는 공개 게시를 하지 않습니다. 설치형 업데이트 메타데이터는 설치형을 함께 배포할 때만 제공합니다. 기존 설치형 사용자는 portable EXE를 직접 받아 같은 저장 데이터를 이어서 사용할 수 있습니다.

`scripts/publish-windows-release.mjs`는 기존 설치형/portable 전체 배포용입니다. 이를 사용하는 경우 `RELEASE_TAG`·`GITHUB_REPOSITORY`·`GITHUB_SHA`가 실제 버전·저장소·태그 커밋과 일치해야 합니다. Actions 실행이 아닌 경우 빌드 정보의 `workflowRun`은 `null`이며, 소스 커밋·파일 해시·실행 검사 결과는 동일하게 기록합니다. 첨부 검증에는 홈과 경험치 100% 사탕 버튼의 실행 검사도 포함합니다. 현재의 실행 파일 3개 배포에서는 이 스크립트의 전체 첨부 기능을 사용하지 않습니다.

배포 저장소를 별도로 쓰려면 `src/shared/updates.ts`의 저장소와 `electron-builder.yml`의 Windows/공통 및 Mac `publish` 주소를 함께 바꿉니다. 이번 워크플로는 현재 소스 저장소의 초안과 태그를 검증하도록 되어 있으므로, 별도 배포 저장소를 채택할 때는 게시 스크립트의 대상과 소스 태그 검증도 분리해 설정해야 합니다. 공개 배포 저장소의 쓰기 권한은 릴리스 작업에만 제공하고, 앱에 인증 정보를 동봉하지 않습니다.

## 검증 범위

`npm run smoke:updater`는 임시 데이터/캐시와 loopback HTTP 피드에서 **실제 Electron 네트워크 + NsisUpdater**를 실행합니다. 버전 확인만으로 다운로드하지 않는 것, 요청 시 다운로드, SHA-512 확인, 완료 파일 재사용, 손상된 파일 거절, 피드 장애를 확인합니다. 테스트 파일은 실행하지 않습니다.

`smoke:portable-update`는 Windows의 **실제 portable EXE를 임시 폴더에 복사**해, 변경된 이름/한글/공백/특수문자 경로에서 파일 교체·실행 성공 확인·저장 보존을 검증합니다. 잘린 다운로드와 실행 직후 종료되는 테스트 EXE로 거절/자동 복구도 확인합니다. 테스트용 `9.9.9` 패키지는 아래처럼 별도 폴더에 만들며 게시하지 않습니다. 실행 대상은 이 임시 복사본뿐입니다.

```powershell
npm run dist:win:portable
npm exec electron-builder -- --win portable --x64 --publish never --config.extraMetadata.version=9.9.9 --config.directories.output=artifacts/update-target --config.compression=store
npm run smoke:portable-update
```

Windows SDK가 없는 경우에만 AGENTS.md의 조건을 확인하고 빌드 명령 한 번에 `--config.npmRebuild=false`를 붙입니다. 테스트 바이너리의 다운로드 서버는 loopback이며, 다운로드 주소 우회/디버깅 포트 재사용은 `POKETOKEN_TEST_MODE=1`일 때만 가능합니다. 실제 버전의 공개 피드를 인증 없이 읽을 수 있게 하려면 여전히 공개된 배포 저장소가 필요합니다.

`tests/updates.test.ts`·`portable-update.test.ts`는 OS/아키텍처, semver, 정식/프리뷰 구분, 동시 확인 중복 방지, 잘못된 URL/크기/해시, 다운로드/저장/비동기 설치 오류와 시작 확인 조건을 검증합니다. `smoke:league`는 사이드바/업데이트 대화상자와 두 위치의 전시 상태를 확인합니다. Loopback 검사는 공개 GitHub 릴리스를 통한 실제 설치 교체나 Mac의 서명된 자동 교체가 성공했다는 증거는 아닙니다.

공식 참고: [electron-updater](https://www.electron.build/v26/docs/features/auto-update/), [NSIS](https://www.electron.build/v26/docs/nsis/), [GitHub Releases API](https://docs.github.com/en/rest/releases/releases).
