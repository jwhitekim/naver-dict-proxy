# 바로영한

웹을 읽다가 바로 찾는 영한사전입니다. Naver의 비공식 영한사전 API를
프록시하는 Express 서버와 Chrome 사이드패널 확장프로그램으로 구성됩니다.

## Setup

```bash
npm install
npm start
```

Server runs on `http://localhost:3001`. Load `extension/` as an unpacked
extension in `chrome://extensions` (Developer mode → Load unpacked).

## 워크플로우

1. **단축키(Alt+K)나 툴바 아이콘으로 사이드패널을 연다.** 열려 있던 다른 탭의
   패널은 자동으로 닫혀서, 항상 한 탭에서만 열려 있다.
2. **검색 전에는 최근 본 단어와 추천 단어를 먼저 보여준다.** 최근 검색어는
   `chrome.storage.local`에 최대 8개까지 쌓이고, 빈 화면 대신 바로 누를 거리를
   제공한다.

   <img src="docs/screenshots/empty-state.png" width="640" height="400" alt="검색 전 화면: 검색창과 최근 본 단어, 추천 단어" />

3. **단어를 입력하고 검색하면** 결과 위에 사전 선택(Oxford/동아/YBM)이 나타나고,
   뜻·품사·예문이 표시된다. 패널 모서리의 탭에는 방금 찾은 단어의 첫 글자가
   남아, 마지막으로 무엇을 찾았는지 항상 보인다.

   <img src="docs/screenshots/result-state.png" width="640" height="400" alt="검색 결과 화면: 사전 선택, 품사, 뜻, 예문" />

4. **사전을 바꾸면** 같은 단어를 다른 사전으로 다시 조회한다. 해당 사전에
   항목이 없으면 다른 사전을 시도해보라는 안내가 뜬다.
5. **검색한 단어는 자동으로 최근 목록에 저장돼**, 다음에 패널을 열었을 때
   다시 보인다.

## API

- `GET /api/naver/search?query=<word>` — raw proxy of Naver's search API.
- `GET /api/naver/entry?entryId=<id>` — raw proxy of Naver's entry detail API.
- `GET /api/naver/lookup?word=<word>` — search + entry combined into:
  ```json
  {
    "word": "serendipity",
    "phonetic": "ˌserənˈdɪpəti",
    "partOfSpeech": "명사",
    "definition": "명사: 뜻밖의 재미[기쁨]",
    "example": "Finding the old book at the library was serendipity. (도서관에서 그 오래된 책을 발견한 것은 뜻밖의 재미였다.)",
    "koreanMeaning": "뜻밖의 재미"
  }
  ```
  Returns `404` with the raw search payload if no entry could be matched, and
  `502` if the upstream Naver API fails or its response shape has changed.

## ⚠️ About the Naver proxy

- **Unofficial, undocumented API.** These endpoints were reverse-engineered
  from browser network traffic (`en.dict.naver.com`), not from any published
  Naver documentation. Naver can change response shapes or block access at
  any time without notice — if `/api/naver/lookup` starts returning `502`s,
  the upstream JSON structure has likely changed and the parsing logic in
  `server/server.js` needs to be updated.
- **Personal, local use only.** This is intended to run on `localhost` for
  your own lookups. Naver's terms of service have not been reviewed for
  redistribution or multi-user deployment — do not deploy this publicly or
  serve it to other users without reviewing those terms yourself.
- **Do not remove the cache/throttle logic.** `server/server.js` caches
  lookups in memory for 1 hour and throttles outgoing requests to Naver
  (~3/sec max) to avoid hammering an API that isn't meant to be called
  programmatically. Excessive request volume risks an IP ban. Keep this
  logic in place if you modify the proxy.
