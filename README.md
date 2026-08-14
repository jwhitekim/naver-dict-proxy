# My Dictionary

Local English-Korean dictionary tool: a small Express server that proxies
Naver's unofficial English-Korean dictionary API, plus a Chrome extension
popup that queries it.

## Setup

```bash
npm install
npm start
```

Server runs on `http://localhost:3001`. Load `extension/` as an unpacked
extension in `chrome://extensions` (Developer mode → Load unpacked).

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
