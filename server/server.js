// Local proxy server for the unofficial Naver English-Korean dictionary API.
//
// Naver does not publish or support this API. Endpoints, field names, and
// response shapes were reverse-engineered by inspecting network traffic from
// https://en.dict.naver.com and can change or break without notice.
// See README.md for usage caveats (personal/local use, rate limiting).

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3001;

const NAVER_BASE = 'https://en.dict.naver.com';
const NAVER_HEADERS = {
  Referer: 'https://en.dict.naver.com/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

// --- Simple throttle -------------------------------------------------------
// Naver has no published rate limit, but hammering an unofficial API risks an
// IP ban. Space out actual upstream requests instead of firing them back to
// back. This only delays; it never rejects.
const MIN_INTERVAL_MS = 300; // ~3 requests/sec max
let lastUpstreamRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle() {
  const wait = lastUpstreamRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastUpstreamRequestAt = Date.now();
}

async function naverFetch(url) {
  await throttle();
  const res = await fetch(url, { headers: NAVER_HEADERS });
  if (!res.ok) {
    const err = new Error(`Naver API responded ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// --- Simple in-memory cache -------------------------------------------------
// Same word looked up again within an hour is served from memory instead of
// hitting Naver again.
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const lookupCache = new Map(); // word (lowercase) -> { data, expiresAt }

function getCached(word) {
  const entry = lookupCache.get(word);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    lookupCache.delete(word);
    return null;
  }
  return entry.data;
}

function setCached(word, data) {
  lookupCache.set(word, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// --- Naver response parsing --------------------------------------------------

// Pull the best-match search result item out of a /api3/enko/search response.
// Real shape: searchResultMap.searchResultListMap.WORD.items[0]
function pickSearchItem(searchData) {
  const groups = searchData?.searchResultMap?.searchResultListMap;
  if (!groups) return null;

  if (groups.WORD?.items?.length) return groups.WORD.items[0];

  // Fallback: some queries (idioms, phrases) may land in a different group.
  for (const key of Object.keys(groups)) {
    if (groups[key]?.items?.length) return groups[key].items[0];
  }
  return null;
}

function extractPhonetic(searchItem) {
  const list = searchItem?.searchPhoneticSymbolList;
  if (Array.isArray(list)) {
    const combined = list.find((s) => s.symbolValue && s.symbolTypeCode === 'US∙GB');
    if (combined) return stripHtml(combined.symbolValue);
    const withValue = list.find((s) => s.symbolValue);
    if (withValue) return stripHtml(withValue.symbolValue);
  }
  return stripHtml(searchItem?.phoneticSymbol) || '';
}

// Some dictionaries (e.g. Dong-a) wrap the core translation in <b> tags.
// NOTE: angle brackets are also used as real content in this data (e.g.
// "<장소·사람을> 수색하여 찾다" marks an implied object, not markup) — only
// strip the specific known formatting tags, never a blanket <...> regex.
function stripHtml(str) {
  return typeof str === 'string' ? str.replace(/<\/?(?:b|i|u|em|strong|sup|sub)>/gi, '').trim() : str;
}

// Build the unified shape from a /api/v2/platform/enko/entry response.
// searchItem is optional (only available when this came from /lookup, which
// ran a search first) and only supplies the phonetic symbol.
function buildEntryResult(word, searchItem, entryData) {
  const entry = entryData?.entry;
  const parts = Array.isArray(entry?.parts) ? entry.parts : [];

  const partOfSpeech = parts.map((p) => p.part_ko_name).filter(Boolean).join(', ');

  const definition = parts
    .map((p) => {
      const means = (p.means || [])
        .map((m) => stripHtml(m.show_mean))
        .filter(Boolean)
        .join(', ');
      return means ? `${p.part_ko_name}: ${means}` : null;
    })
    .filter(Boolean)
    .join(' / ');

  const relatedExample = Array.isArray(entry?.relatedExamples) ? entry.relatedExamples[0] : null;
  const example = relatedExample
    ? `${relatedExample.sourceExample} (${relatedExample.sourceTranslation})`
    : null;

  // Naver joins multiple senses in primary_mean with a "|||" delimiter.
  const primaryMean = entry?.primary_mean
    ? entry.primary_mean.split('|||').join(', ')
    : null;

  return {
    word: word || entry?.members?.[0]?.entry_name || null,
    phonetic: extractPhonetic(searchItem),
    partOfSpeech,
    definition,
    example,
    koreanMeaning: primaryMean || definition || null,
    source: entry?.entrySource?.sourceDicts?.[0]?.dict_name || null,
  };
}

// --- Routes ------------------------------------------------------------------

app.get('/api/naver/search', async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'query is required' });

  try {
    const url = `${NAVER_BASE}/api3/enko/search?query=${encodeURIComponent(
      query
    )}&m=pc&range=all&shouldSearchVlive=true&lang=ko`;
    const data = await naverFetch(url);
    res.json(data);
  } catch (err) {
    console.error('[naver/search] failed:', err.message);
    res.status(502).json({ error: 'Naver search API request failed', detail: err.message });
  }
});

// Returns the same parsed shape as /api/naver/lookup, but for a specific
// entryId — useful for picking a dictionary other than the default (Oxford)
// result /lookup resolves to, e.g. Dong-a or YBM. Since entryId already
// pins an exact dictionary entry, no search step is needed.
app.get('/api/naver/entry', async (req, res) => {
  const { entryId } = req.query;
  if (!entryId) return res.status(400).json({ error: 'entryId is required' });

  const cacheKey = `entry:${entryId}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  try {
    const url = `${NAVER_BASE}/api/v2/platform/enko/entry?entryId=${encodeURIComponent(
      entryId
    )}&isConjsShowTTS=true&searchResult=false`;
    const entryData = await naverFetch(url);

    const result = buildEntryResult(null, null, entryData);
    setCached(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[naver/entry] failed:', err.message);
    res.status(502).json({ error: 'Naver entry API request failed', detail: err.message });
  }
});

app.get('/api/naver/lookup', async (req, res) => {
  const { word } = req.query;
  if (!word) return res.status(400).json({ error: 'word is required' });

  const cacheKey = word.trim().toLowerCase();
  const cached = getCached(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  try {
    const searchUrl = `${NAVER_BASE}/api3/enko/search?query=${encodeURIComponent(
      word
    )}&m=pc&range=all&shouldSearchVlive=true&lang=ko`;
    const searchData = await naverFetch(searchUrl);

    const searchItem = pickSearchItem(searchData);
    if (!searchItem?.entryId) {
      return res.status(404).json({
        error: 'No matching entry found for this word',
        searchResult: searchData,
      });
    }

    const entryUrl = `${NAVER_BASE}/api/v2/platform/enko/entry?entryId=${encodeURIComponent(
      searchItem.entryId
    )}&isConjsShowTTS=true&searchResult=false`;
    const entryData = await naverFetch(entryUrl);

    const result = buildEntryResult(word, searchItem, entryData);
    setCached(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[naver/lookup] failed:', err.message);
    res.status(502).json({ error: 'Naver lookup failed', detail: err.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Dictionary server listening on http://localhost:${PORT}`);
});
