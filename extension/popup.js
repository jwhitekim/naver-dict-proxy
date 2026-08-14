const NAVER_SERVER = 'http://localhost:3001';

const form = document.getElementById('search-form');
const input = document.getElementById('word-input');
const resultEl = document.getElementById('result');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const word = input.value.trim();
  if (word) lookup(word);
});

async function fetchNaverMeaning(word) {
  const res = await fetch(`${NAVER_SERVER}/api/naver/lookup?word=${encodeURIComponent(word)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Naver lookup responded ${res.status}`);
  }
  return res.json();
}

async function lookup(word) {
  resultEl.innerHTML = '<p class="status">Searching...</p>';

  try {
    const result = await fetchNaverMeaning(word);
    render(result);
  } catch (err) {
    resultEl.innerHTML = `<p class="status error">"${escapeHtml(word)}" 검색 결과가 없습니다. (${escapeHtml(
      err.message
    )})</p>`;
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
