// Muse Studio frontend
const $ = id => document.getElementById(id);

// Tabs
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    $('panel-' + t.dataset.tab).classList.add('active');
  });
});

async function postJSON(url, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal: ctl.signal
    });
    return await r.json();
  } finally { clearTimeout(timer); }
}
function busy(el, on, txt) {
  el.disabled = on;
  if (on) { el.dataset.t = el.textContent; el.innerHTML = '<span class="loading">⏳ ' + (txt || 'Kaam ho raha hai…') + '</span>'; }
  else el.textContent = el.dataset.t;
}

// ---- AI Assistant ----
document.querySelectorAll('[data-fill]').forEach(b =>
  b.addEventListener('click', () => { $('ai-prompt').value = b.dataset.fill; }));
$('ai-go').addEventListener('click', async () => {
  const p = $('ai-prompt').value.trim();
  if (!p) return;
  busy($('ai-go'), true);
  $('ai-out').innerHTML = '<span class="loading">⏳ Soch raha hai…</span>';
  const r = await postJSON('/api/ask', {prompt: p});
  busy($('ai-go'), false);
  $('ai-out').textContent = r.answer || ('❌ ' + (r.error || 'Kuch garbar hui.'));
  if (r.error) $('ai-out').innerHTML = '<span class="err">❌ ' + r.error + '</span>';
});

// ---- Web Reader ----
let readerText = '';
$('reader-go').addEventListener('click', async () => {
  const u = $('reader-url').value.trim();
  if (!u) return;
  busy($('reader-go'), true);
  $('reader-out').innerHTML = '<span class="loading">⏳ Page parh raha hai…</span>';
  const r = await postJSON('/api/read-url', {url: u});
  busy($('reader-go'), false);
  if (r.error) { $('reader-out').innerHTML = '<span class="err">❌ ' + r.error + '</span>'; readerText=''; return; }
  $('reader-title').textContent = r.title || '';
  $('reader-out').textContent = r.text;
  readerText = r.text;
});
async function readerAI(mode, btn) {
  if (!readerText) { $('reader-ai').innerHTML = '<span class="err">Pehle koi page parhen.</span>'; return; }
  busy(btn, true);
  $('reader-ai').innerHTML = '<span class="loading">⏳ AI likh raha hai…</span>';
  const r = await postJSON('/api/summarize', {text: readerText, mode});
  busy(btn, false);
  $('reader-ai').textContent = r.answer || '';
  if (r.error) $('reader-ai').innerHTML = '<span class="err">❌ ' + r.error + '</span>';
}
$('reader-sum').addEventListener('click', e => readerAI('khulasa', e.target));
$('reader-points').addEventListener('click', e => readerAI('nuktaat', e.target));

// ---- YouTube ----
$('yt-go').addEventListener('click', async () => {
  const u = $('yt-url').value.trim();
  if (!u) return;
  busy($('yt-go'), true);
  const r = await postJSON('/api/video-info', {url: u});
  busy($('yt-go'), false);
  if (r.error) { $('yt-out').innerHTML = '<span class="err">❌ ' + r.error + '</span>'; return; }
  $('yt-card').classList.remove('hidden');
  $('yt-thumb').src = r.thumbnail || '';
  $('yt-title').textContent = r.title || '';
  $('yt-author').textContent = (r.author ? 'by ' + r.author : '');
  $('yt-out').innerHTML = '<span class="ph">Details mil gayin ✅ — ab transcript paste karke Khulasa dabayen.</span>';
});
async function ytAI(mode, btn) {
  const t = $('yt-transcript').value.trim();
  if (!t) { $('yt-out').innerHTML = '<span class="err">Pehle transcript paste karein.</span>'; return; }
  busy(btn, true);
  $('yt-out').innerHTML = '<span class="loading">⏳ AI likh raha hai…</span>';
  const r = await postJSON('/api/summarize', {text: t, mode});
  busy(btn, false);
  $('yt-out').textContent = r.answer || '';
  if (r.error) $('yt-out').innerHTML = '<span class="err">❌ ' + r.error + '</span>';
}
$('yt-sum').addEventListener('click', e => ytAI('khulasa', e.target));
$('yt-ideas').addEventListener('click', e => ytAI('ideas', e.target));

// ---- Trends ----
document.querySelectorAll('[data-tq]').forEach(b =>
  b.addEventListener('click', () => { $('trends-q').value = b.dataset.tq; loadTrends(); }));
async function loadTrends() {
  const q = $('trends-q').value.trim() || 'Islamic';
  $('trends-out').innerHTML = '<span class="loading">⏳ Khabren la raha hai…</span>';
  try {
    const r = await fetch('/api/trends?q=' + encodeURIComponent(q));
    const d = await r.json();
    if (d.error || !d.items.length) {
      $('trends-out').innerHTML = '<span class="err">❌ ' + (d.error || 'Koi khabar nahi mili.') + '</span>';
      return;
    }
    $('trends-out').innerHTML = d.items.map(i =>
      '<div class="card"><a href="' + i.link + '" target="_blank" rel="noopener">' +
      i.title.replace(/</g,'&lt;') + '</a><div class="src">' +
      (i.source || '') + (i.date ? ' · ' + i.date.slice(0,16) : '') + '</div></div>'
    ).join('');
  } catch(e) {
    $('trends-out').innerHTML = '<span class="err">❌ Khabren nahi mil sakin.</span>';
  }
}
$('trends-go').addEventListener('click', loadTrends);

// ---- Islamic tools ----
$('pt-go').addEventListener('click', async () => {
  const city = $('pt-city').value.trim() || 'Karachi';
  const country = $('pt-country').value.trim() || 'Pakistan';
  busy($('pt-go'), true);
  $('pt-out').innerHTML = '<span class="loading">⏳ Timings la raha hai…</span>';
  try {
    const r = await fetch('/api/prayer-times?city=' + encodeURIComponent(city) + '&country=' + encodeURIComponent(country));
    const d = await r.json();
    busy($('pt-go'), false);
    if (d.error) { $('pt-out').innerHTML = '<span class="err">❌ ' + d.error + '</span>'; return; }
    const order = ['Fajr','Sunrise','Dhuhr','Asr','Maghrib','Isha'];
    $('pt-out').innerHTML =
      '<div class="card"><b>🕌 ' + d.city + ', ' + d.country + '</b>' +
      '<div class="src">' + d.date + ' · ' + d.hijri + '</div>' +
      '<div class="ptgrid" style="margin-top:10px">' +
      order.map(k => '<div class="ptcell"><b>' + k + '</b><span>' + (d.times[k] || '—') + '</span></div>').join('') +
      '</div></div>';
  } catch(e) {
    busy($('pt-go'), false);
    $('pt-out').innerHTML = '<span class="err">❌ Timings nahi mil sakin.</span>';
  }
});
$('ayah-go').addEventListener('click', async () => {
  busy($('ayah-go'), true);
  $('ayah-out').innerHTML = '<span class="loading">⏳ Ayah la raha hai…</span>';
  try {
    const r = await fetch('/api/random-ayah');
    const d = await r.json();
    busy($('ayah-go'), false);
    if (d.error) { $('ayah-out').innerHTML = '<span class="err">❌ ' + d.error + '</span>'; return; }
    $('ayah-out').innerHTML =
      '<div class="arabic">' + d.arabic.replace(/</g,'&lt;') + '</div>' +
      '<div class="urdu">' + d.urdu.replace(/</g,'&lt;') + '</div>' +
      '<div class="src">📖 ' + d.reference + '</div>';
  } catch(e) {
    busy($('ayah-go'), false);
    $('ayah-out').innerHTML = '<span class="err">❌ Ayah nahi mil saki.</span>';
  }
});

// ---- Leads (browser localStorage) ----
const LKEY = 'muse_studio_leads';
const getLeads = () => { try { return JSON.parse(localStorage.getItem(LKEY) || '[]'); } catch(e){ return []; } };
const setLeads = l => localStorage.setItem(LKEY, JSON.stringify(l));
function renderLeads() {
  const leads = getLeads();
  $('leads-out').innerHTML = leads.length ? leads.map((l, i) =>
    '<div class="card"><div class="leadrow"><b>' + (l.name || 'Lead').replace(/</g,'&lt;') + '</b>' +
    '<span class="st">' + l.status + '</span></div>' +
    (l.link ? '<a href="' + l.link + '" target="_blank" rel="noopener">🔗 Link kholo</a><br>' : '') +
    (l.note ? '<p>' + l.note.replace(/</g,'&lt;') + '</p>' : '') +
    '<div class="row" style="margin-top:8px"><select data-i="' + i + '" class="stsel">' +
    ['Naya','Rabta','Deal','Nakaam'].map(s => '<option' + (s===l.status?' selected':'') + '>' + s + '</option>').join('') +
    '</select><button class="del" data-i="' + i + '">Delete</button></div></div>'
  ).join('') : '<span class="ph">Abhi koi lead nahi — upar form se add karein.</span>';
  document.querySelectorAll('.stsel').forEach(s => s.addEventListener('change', e => {
    const l = getLeads(); l[+e.target.dataset.i].status = e.target.value; setLeads(l); renderLeads();
  }));
  document.querySelectorAll('.del').forEach(b => b.addEventListener('click', e => {
    const l = getLeads(); l.splice(+e.target.dataset.i, 1); setLeads(l); renderLeads();
  }));
}
$('lead-add').addEventListener('click', () => {
  const name = $('lead-name').value.trim();
  if (!name) return;
  const leads = getLeads();
  leads.unshift({name, link: $('lead-link').value.trim(), note: $('lead-note').value.trim(),
    status: $('lead-status').value, at: new Date().toISOString()});
  setLeads(leads);
  $('lead-name').value = $('lead-link').value = $('lead-note').value = '';
  renderLeads();
});
$('lead-fill').addEventListener('click', async () => {
  const u = $('lead-link').value.trim();
  if (!u) return;
  busy($('lead-fill'), true, 'Details nikal raha hai…');
  const r = await postJSON('/api/read-url', {url: u});
  busy($('lead-fill'), false);
  if (!r.error) {
    if (r.title && !$('lead-name').value) $('lead-name').value = r.title.slice(0, 80);
    $('lead-note').value = ('Link: ' + u + '\n' + r.text.slice(0, 300)).slice(0, 500);
  }
});
renderLeads();
