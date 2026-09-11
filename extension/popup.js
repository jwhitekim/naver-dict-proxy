const NAVER_SERVER = window.DICT_SERVER;

const form = document.getElementById('search-form');
const input = document.getElementById('word-input');
const resultEl = document.getElementById('result');
const searchButton = form.querySelector('.search-button');
const suggestionButtons = document.querySelectorAll('.suggestion');
const foreEdgeTab = document.getElementById('fore-edge-tab');
const recentBlock = document.getElementById('recent-block');
const recentRow = document.getElementById('recent-row');
const wotdCard = document.getElementById('wotd-card');

const SOURCES = [
  { value: '', label: 'Oxford' },
  { value: '동아', label: '동아' },
  { value: 'YBM', label: 'YBM' },
];

const RECENT_KEY = 'recentWords';
const RECENT_MAX = 8;

let currentSource = '';
let currentWord = '';
let activeLookup = 0;

// The side panel document isn't reloaded when it's closed and reopened, so
// the `autofocus` attribute only fires once. Refocus the input whenever the
// panel becomes visible again.
input.focus();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') input.focus();
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const word = input.value.trim();
  if (word) lookup(word);
});

// The source picker is now rendered inside #result (see sourcePillRow), so
// its buttons don't exist until a lookup has happened — delegate instead of
// binding listeners to elements that get thrown away on every render.
resultEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.source-pill');
  if (!btn || btn.classList.contains('active')) return;
  currentSource = btn.dataset.source;
  if (currentWord) lookup(currentWord);
});

suggestionButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    input.value = btn.dataset.word;
    lookup(btn.dataset.word);
  });
});

recentRow.addEventListener('click', (e) => {
  const btn = e.target.closest('.recent-chip');
  if (btn) lookup(btn.dataset.word);
});

wotdCard.addEventListener('click', () => lookup(wotdCard.dataset.word));

initWordOfTheDay();
initRecent();

async function fetchNaverMeaning(word, source) {
  const params = new URLSearchParams({ word });
  if (source) params.set('source', source);
  const res = await fetch(`${NAVER_SERVER}/api/naver/lookup?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Naver lookup responded ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function lookup(word) {
  const lookupId = ++activeLookup;
  currentWord = word;
  input.value = '';
  resultEl.setAttribute('aria-busy', 'true');
  searchButton.disabled = true;
  updateForeEdgeTab(word);
  setResult('<p class="status">사전에서 단어를 찾고 있어요…</p>');

  try {
    const result = await fetchNaverMeaning(word, currentSource);
    if (lookupId !== activeLookup) return;
    render(result);
    addRecent(word);
  } catch (err) {
    if (lookupId !== activeLookup) return;
    // A 404 while a specific dictionary is selected just means that
    // dictionary doesn't have this word — not that the word doesn't exist
    // anywhere. Say so instead of a generic failure, and point at the
    // other tabs rather than surfacing the raw server error text.
    if (err.status === 404 && currentSource) {
      const sourceLabel = SOURCES.find((s) => s.value === currentSource)?.label || currentSource;
      setResult(`<p class="status error">"${escapeHtml(word)}"의 ${escapeHtml(
        sourceLabel
      )} 사전 항목이 없습니다. 다른 사전을 선택해보세요.</p>`);
      return;
    }
    setResult(`<p class="status error">"${escapeHtml(word)}" 검색 결과가 없습니다.</p>`);
  } finally {
    if (lookupId === activeLookup) {
      resultEl.setAttribute('aria-busy', 'false');
      searchButton.disabled = false;
    }
  }
}

// Which dictionary to read only matters once there's something to read, so
// the picker is built here instead of sitting in the header before any
// search has happened.
function sourcePillRow() {
  const pills = SOURCES.map(
    (s) =>
      `<button type="button" class="source-pill${s.value === currentSource ? ' active' : ''}" data-source="${escapeHtml(
        s.value
      )}">${escapeHtml(s.label)}</button>`
  ).join('');
  return `
    <div class="source-pill-row">
      <span class="source-pill-label">사전 선택</span>
      <div class="source-pill-group">${pills}</div>
    </div>
  `;
}

function setResult(bodyHtml) {
  resultEl.innerHTML = sourcePillRow() + bodyHtml;
}

function render(result) {
  setResult(`
    <div class="entry">
      <div class="entry-header">
        <span class="entry-word">${escapeHtml(result.word)}</span>
        ${result.phonetic ? `<span class="entry-phonetic">/${escapeHtml(result.phonetic)}/</span>` : ''}
      </div>
      ${
        result.meanings?.length
          ? result.meanings.map(renderMeaning).join('')
          : '<p class="status error">뜻을 찾을 수 없습니다.</p>'
      }
      ${result.source ? `<p class="source">${escapeHtml(result.source)}</p>` : ''}
    </div>
  `);
}

function renderMeaning(meaning) {
  const senses = meaning.senses.map(renderSense).join('');
  return `
    <div class="section">
      <span class="pos">${escapeHtml(meaning.partOfSpeech)}</span>
      <ol class="sense-list">${senses}</ol>
    </div>
  `;
}

function renderSense(sense) {
  const examples = sense.examples
    .map(
      (ex) => `
        <div class="example">
          <p class="example-en">${escapeHtml(ex.en)}</p>
          ${ex.ko ? `<p class="example-ko">${escapeHtml(ex.ko)}</p>` : ''}
        </div>
      `
    )
    .join('');

  return `
    <li>
      <span class="sense-meaning">${escapeHtml(sense.meaning)}</span>
      ${sense.level ? `<span class="level-badge">${escapeHtml(sense.level)}</span>` : ''}
      ${examples}
    </li>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// A real dictionary has thumb-index cuts on the page edge so you can flip
// straight to a letter. This tab plays the same role passively — it always
// shows the initial of whatever was last looked up.
function updateForeEdgeTab(word) {
  const letter = word.trim().charAt(0).toUpperCase();
  if (!letter) return;
  foreEdgeTab.textContent = letter;
  foreEdgeTab.hidden = false;
}

// ── Recent words ──────────────────────────────────────────────────────
// Kept in chrome.storage.local so the empty state has something to do
// besides show placeholder copy.
function renderRecent(words) {
  if (!words.length) {
    recentBlock.hidden = true;
    return;
  }
  recentBlock.hidden = false;
  recentRow.innerHTML = words
    .map((w) => `<button type="button" class="recent-chip" data-word="${escapeHtml(w)}">${escapeHtml(w)}</button>`)
    .join('');
}

function initRecent() {
  chrome.storage?.local.get(RECENT_KEY, (data) => {
    const words = data[RECENT_KEY] || [];
    renderRecent(words);
    if (words[0]) updateForeEdgeTab(words[0]);
  });
}

function addRecent(word) {
  if (!chrome.storage) return;
  chrome.storage.local.get(RECENT_KEY, (data) => {
    const existing = data[RECENT_KEY] || [];
    const words = [word, ...existing.filter((w) => w.toLowerCase() !== word.toLowerCase())].slice(0, RECENT_MAX);
    chrome.storage.local.set({ [RECENT_KEY]: words });
    renderRecent(words);
  });
}

// ── Word of the day ──────────────────────────────────────────────────
// Picked locally from a fixed list by day of year, so it doesn't need a
// server round trip just to fill the empty state.
const WORD_OF_THE_DAY = [
  { word: 'candor', phonetic: 'ˈkændər', def: '숨기지 않고 솔직하게 말하는 태도.' },
  { word: 'ephemeral', phonetic: 'ɪˈfemərəl', def: '오래가지 않고 금방 사라지는.' },
  { word: 'meticulous', phonetic: 'məˈtɪkjələs', def: '작은 것 하나까지 꼼꼼하게 신경 쓰는.' },
  { word: 'ambivalent', phonetic: 'æmˈbɪvələnt', def: '두 가지 상반된 감정을 동시에 느끼는.' },
  { word: 'tenacious', phonetic: 'təˈneɪʃəs', def: '쉽게 포기하지 않고 끈질긴.' },
  { word: 'nuance', phonetic: 'ˈnuːɑːns', def: '겉으로 잘 드러나지 않는 미묘한 차이.' },
  { word: 'resilient', phonetic: 'rɪˈzɪliənt', def: '어려움을 겪어도 금방 회복하는.' },
  { word: 'serendipity', phonetic: 'ˌserənˈdɪpəti', def: '찾지 않았는데 우연히 좋은 걸 발견하는 것.' },
  { word: 'candid', phonetic: 'ˈkændɪd', def: '숨김없이 솔직한. 꾸미지 않은.' },
  { word: 'lucid', phonetic: 'ˈluːsɪd', def: '생각이나 설명이 또렷하고 이해하기 쉬운.' },
  { word: 'austere', phonetic: 'ɔːˈstɪr', def: '꾸밈없이 단순하고 엄격한.' },
  { word: 'plausible', phonetic: 'ˈplɔːzəbəl', def: '그럴듯해서 믿을 만한.' },
  { word: 'inevitable', phonetic: 'ɪnˈevɪtəbəl', def: '피할 수 없이 반드시 일어나는.' },
  { word: 'subtle', phonetic: 'ˈsʌtəl', def: '눈에 잘 띄지 않을 만큼 은은한.' },
  { word: 'coherent', phonetic: 'koʊˈhɪrənt', def: '논리적으로 앞뒤가 맞고 일관된.' },
];

function pickWordOfTheDay() {
  const dayIndex = Math.floor(Date.now() / 86400000);
  return WORD_OF_THE_DAY[dayIndex % WORD_OF_THE_DAY.length];
}

function initWordOfTheDay() {
  const wotd = pickWordOfTheDay();
  wotdCard.dataset.word = wotd.word;
  wotdCard.querySelector('.wotd-word').textContent = wotd.word;
  wotdCard.querySelector('.wotd-phon').textContent = `/${wotd.phonetic}/`;
  wotdCard.querySelector('.wotd-def').textContent = wotd.def;
}
