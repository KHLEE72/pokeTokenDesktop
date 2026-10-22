<p align="center">
  <a href="CONTRIBUTING.md"><kbd>English</kbd></a> &nbsp; <a href="CONTRIBUTING.ko.md"><kbd><strong>한국어</strong></kbd></a>
</p>

<p align="center"><img src="docs/images/pokemon-1.gif" width="64" alt="이상해씨"></p>

<h1 align="center">PokeToken Desktop 기여 안내</h1>

<p align="center">
  <strong>작은 기여가 새로운 모험의 시작이 됩니다.</strong><br>
  오류 수정, 더 쉬운 문서, 번역과 새로운 아이디어를 환영합니다.<br>
  <sub>이슈와 PR은 한국어·English·日本語로 작성할 수 있습니다.</sub>
</p>

<p align="center">
  <a href="#첫-기여-찾기">첫 기여 찾기</a> · <a href="#pr을-보내기-전에">PR 안내</a> · <a href="#오류-제보">오류 제보</a> · <a href="#라이선스와-크레딧">라이선스</a>
</p>

## 첫 기여 찾기

| 하고 싶은 일 | 시작하는 방법 |
| --- | --- |
| 🐛 오류 수정 | [열린 이슈](https://github.com/KHLEE72/pokeTokenDesktop/issues)를 살펴보거나, 재현 순서와 함께 작은 수정 PR을 보내 주세요. |
| 🌍 번역 개선 | 한국어·영어·일본어 UI 문구를 함께 반영하고, 포켓몬의 공식 현지화 명칭을 사용해 주세요. |
| 📖 문서 개선 | 설명을 바로잡고, 링크를 고치거나, 사용 방법을 더 쉽게 풀어 주세요. |
| 💡 기능 추가 | 큰 기능이나 구조 변경은 먼저 이슈로 방향을 이야기해 주세요. |

## 개발 시작하기

저장소를 포크하고 내 포크를 복제한 뒤, 변경할 작업의 브랜치를 만듭니다. **Node.js 22.12 이상**과 npm을 사용합니다.

```sh
npm ci
npm run dev
```

관리 화면을 닫아도 펫은 계속 실행됩니다. 개발 앱을 다 사용했다면 트레이나 메뉴바에서 종료하세요.

| 위치 | 주요 내용 |
| --- | --- |
| `src/main/` | 데스크톱 창·입력, 사용량 수집, SQLite 저장과 이미지 캐시 |
| `src/preload/` | 화면에 노출하는 제한된 IPC 연결 |
| `src/renderer/` | 펫 화면·관리 화면과 스타일 |
| `src/shared/` | 성장·도감·진화·보상·목록과 번역 |
| `tests/`, `scripts/`, `native/` | 테스트·빌드 도구와 OS별 보조 프로그램 |

자세한 빌드 명령과 OS별 준비 사항은 [개발 안내](docs/DEVELOPMENT.md)를 참고하세요. 상세 개발·검증 문서는 현재 한국어로 제공합니다.

## PR을 보내기 전에

한 PR에서는 관련된 변경에 집중하고, **무엇을 왜 바꿨는지**와 실행한 검사를 적어 주세요. 화면을 바꿨다면 스크린샷을 첨부해 주세요. OS의 창·입력 동작은 실제로 확인한 OS, 화면 배율과 모니터 구성을 적어 주세요.

코드를 바꿨다면 다음 명령을 실행합니다.

```sh
npm run typecheck
npm test
npm run build
```

이어서 [package.json](package.json)의 `smoke:*` 중 변경한 기능에 해당하는 검사를 진행하세요. 빌드 성공만으로 다른 OS의 데스크톱 동작을 검증한 것은 아닙니다. 문서만 바꿨다면 내용·링크·명령 확인으로 충분하며 앱 테스트는 필요하지 않습니다.

기존 성장·도감·설정 데이터와 개체가 거친 진화 경로를 보존해 주세요. 화면 문구는 세 언어를 함께 반영하고, 포켓몬 이름은 직접 번역하는 대신 공식 명칭 목록에서 가져옵니다.

## 오류 제보

[오류 제보 양식](https://github.com/KHLEE72/pokeTokenDesktop/issues/new?template=bug_report.yml)에 다음 내용을 적어 주세요.

- 앱 버전과 OS 버전.
- 화면 배율과 모니터 구성.
- 재현 순서, 기대한 동작과 실제로 일어난 동작.
- 도움이 된다면 스크린샷이나 필요한 부분만 확인한 진단 기록.

입력 문제라면 트레이의 진단 기능으로 발생 시점을 기록할 수 있습니다. 내용을 확인한 뒤 관련된 최소 범위만 익명화해 공유해 주세요.

> **개인정보를 보호해 주세요.** Claude Code·Codex의 원본 대화 로그, 전체 설정·DB, 인증 정보와 개인 폴더 경로를 공개 이슈나 PR에 올리지 마세요. 테스트에는 실제 저장 데이터·사용량 로그 대신 임시 `POKETOKEN_DATA_DIR`, `POKETOKEN_TEST_MODE=1`과 익명화한 fixture를 사용합니다.

## 라이선스와 크레딧

직접 작성한 앱 코드는 [MIT](LICENSE)로 공개합니다. 기여하는 코드는 같은 조건으로 제공해 주세요. 포켓몬 이미지·명칭, 외부 도트와 글꼴은 각각의 권리·라이선스를 유지하며 [서드파티 고지](THIRD_PARTY_NOTICES.md)를 따릅니다.

외부 자료를 추가할 때 출처·제작자 크레딧·사용 조건을 함께 기록하고 필요한 고지를 유지해 주세요.

---

<p align="center">
  <img src="docs/images/pokemon-133.gif" width="40" alt="이브이"><br>
  <strong>작은 친구의 성장에 함께해 주셔서 감사합니다.</strong><br>
  <sub><a href="README.ko.md">PokeToken Desktop으로 돌아가기</a> · <a href="CONTRIBUTING.md">Contributing in English</a></sub>
</p>
