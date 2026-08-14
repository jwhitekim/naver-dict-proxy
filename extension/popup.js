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
  // definition is formatted as "품사: 뜻1, 뜻2 / 품사2: 뜻1..." — split into one line per part of speech.
  const definitionLines = (result.definition || '').split(' / ').filter(Boolean);

  resultEl.innerHTML = `
    <div class="entry">
      <div class="entry-header">
        <span class="entry-word">${escapeHtml(result.word)}</span>
        ${result.phonetic ? `<span class="entry-phonetic">${escapeHtml(result.phonetic)}</span>` : ''}
      </div>
      <div class="section">
        ${
          definitionLines.length
            ? `<ul class="definition-list">${definitionLines
                .map((line) => `<li>${escapeHtml(line)}</li>`)
                .join('')}</ul>`
            : '<p class="status error">뜻을 찾을 수 없습니다.</p>'
        }
        ${result.example ? `<p class="example">${escapeHtml(result.example)}</p>` : ''}
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
