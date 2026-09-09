const NAVER_SERVER = window.DICT_SERVER;

const form = document.getElementById('search-form');
const input = document.getElementById('word-input');
const resultEl = document.getElementById('result');
const sourceButtons = document.querySelectorAll('.source-btn');
const searchButton = form.querySelector('.search-button');
const suggestionButtons = document.querySelectorAll('.suggestion');

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

sourceButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('active')) return;
    sourceButtons.forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    currentSource = btn.dataset.source;
    if (currentWord) lookup(currentWord);
  });
});

suggestionButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    input.value = btn.dataset.word;
    lookup(btn.dataset.word);
  });
});

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
  resultEl.innerHTML = '<p class="status">사전에서 단어를 찾고 있어요…</p>';

  try {
    const result = await fetchNaverMeaning(word, currentSource);
    if (lookupId !== activeLookup) return;
    render(result);
  } catch (err) {
    if (lookupId !== activeLookup) return;
    // A 404 while a specific dictionary is selected just means that
    // dictionary doesn't have this word — not that the word doesn't exist
    // anywhere. Say so instead of a generic failure, and point at the
    // other tabs rather than surfacing the raw server error text.
    if (err.status === 404 && currentSource) {
      const sourceLabel = document.querySelector('.source-btn.active')?.textContent || currentSource;
      resultEl.innerHTML = `<p class="status error">"${escapeHtml(word)}"의 ${escapeHtml(
        sourceLabel
      )} 사전 항목이 없습니다. 다른 사전을 선택해보세요.</p>`;
      return;
    }
    resultEl.innerHTML = `<p class="status error">"${escapeHtml(word)}" 검색 결과가 없습니다.</p>`;
  } finally {
    if (lookupId === activeLookup) {
      resultEl.setAttribute('aria-busy', 'false');
      searchButton.disabled = false;
    }
  }
}

function render(result) {
  resultEl.innerHTML = `
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
  `;
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
