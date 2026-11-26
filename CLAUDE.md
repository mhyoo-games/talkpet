# 이 저장소에서 작업할 때 지킬 것

심심풀이(mhyoo-games)의 개인 프로젝트 "톡펫" — 카카오톡 단톡방 모두가 함께 키우는 펫(봇). 사용자는 한국어로 대화합니다. 게임 글자도 한국어.

- 게임 화면·README에 실명을 넣지 않는다. 만든 사람은 "심심풀이"로 적는다.
- 처음 고른 것(2026-11-27): 대장장이(강화) 봇은 이미 있어서 다른 단톡방 게임 → "단톡방 다마고치". **"다마고치"는 다른 회사 상표라 이름·화면·README에 쓰지 않는다** (이름은 톡펫). 다른 게임·봇·회사 이름도 넣지 않는다.
- 게임 규칙은 카톡과 따로 순수 코드(`src/core/`, import에 `.ts` → `node --test`, enum·parameter property 금지). 카톡·웹 어디서든 `handle(room, msg)`·`due(room, now)`만 부른다. 방 상태는 JSON(`Room`)으로 저장, 모양을 바꾸면 `parseRoom`이 예전 값을 읽게 하고 시험을 더한다.
- 카톡 연결: 사용자가 **집 Windows PC + 카카오톡 PC(봇 부계정)**를 고름. `bridge/talkpet-bridge.ps1`(PowerShell, 설치 없음, UTF-8 BOM·CRLF로 저장 — Windows PowerShell 5.1이 한글을 읽게)가 따로 열어 둔 채팅방 창(`EVA_VH_ListControl_Dblclk` 목록 + `RICHEDIT50W` 입력칸)에 Ctrl+A·C를 보내 클립보드로 읽고(원래 클립보드 되돌림), 서버(`server/main.ts`, Docker `127.0.0.1:8790`)의 `/api/kakao`가 글 읽기·새 메시지 고르기(`src/core/kakao.ts`)를 한다. 1분마다 `/api/due`. 봇 이름(`BOT_NAME`)의 말에는 답하지 않는다. 처음 보는 방은 명령이나 "톡펫"을 말해야 시작(초대만 해 둔 방에서 떠들지 않게).
- 카카오 공식 기능이 아니라 부계정이 제한될 수 있다는 것을 README에 적어 둔다. 본 계정으로 돌리라고 하지 않는다.
- 펫이 먼저 말하는 것은 아껴서: 급한 것 3시간에 한 번, 밤(0~8시) 조용, 이틀 넘게 조용한 방엔 안 함.
- 웹 연습판(`src/web/`, `index.html`) → GitHub Pages `https://mhyoo-games.github.io/talkpet/` (CI가 main에서 배포). 저장은 localStorage `tp_sim`. 주소에 `?dev=1`이면 `window.__tp`.
- 방문 통계: Google Analytics(`G-J2XRD7X74X`, 속성 mhyooGames) — `index.html`. 광고 기능(Google 신호·광고 맞춤) 끔. 자동 시험 브라우저(`navigator.webdriver`)·github.io 밖에서는 켜지 않는다.
- 글꼴: 갈무리(OFL, `public/fonts/`). 그림은 글자(이모지·얼굴 문자)로.
- CI(`ci.yml`): 규칙 시험 → 타입 검사 → 서버가 답하는지 → Docker 이미지 → 웹 빌드 → headless Chrome(`scripts/smoke.mjs`) → Pages 배포. 기능을 더하면 시험·smoke에도 더한다.
- 큰 기능이 바뀌면 이력서 저장소(minhyuk94.github.io)의 `games` 카드와 mhyoo-games.github.io의 `games.json`도 ko/ja/en으로 맞춘다. 소스 코드·저장소 링크는 넣지 않는다.

## 이 작업 환경에서 돌려 보기

- npm 설치가 막혀 있을 수 있다. `ln -s /opt/npm-tools/node_modules node_modules` 후 `node scripts/build.mjs`, 시험 `npm test`, 타입 검사 `/opt/npm-tools/node_modules/.bin/tsc --noEmit -p .`
- 화면 확인: `(cd dist && python3 -m http.server 8766 &)` 후 `URL=http://localhost:8766/ SHOTS=/tmp/tps CHROME=/usr/bin/google-chrome PLAYWRIGHT_PATH=/opt/npm-tools/node_modules/playwright/index.mjs node scripts/smoke.mjs`
- Windows 연결 프로그램은 여기서 돌려 볼 수 없다 → 사용자 PC에서 함께 확인한다.
