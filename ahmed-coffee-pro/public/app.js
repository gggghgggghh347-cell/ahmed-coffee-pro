/* أحمد كوفي PRO — المنطق المشترك لكل الصفحات */
const SITE = { // ✏️ عدّل بيانات الكافيه هنا
  phone: '01055407049', wa: '201055407049ٌ',
  address: 'المنصوره ',
  hours: '٨ صباحًا — ١٢ منتصف الليل',
};
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
const page = document.body.dataset.page;

async function api(url, body) {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'حصل خطأ، حاول تاني');
  return d;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t.h); t.h = setTimeout(() => t.classList.remove('on'), 4500); }

/* ---------- الهيكل: شريط علوي + فوتر + سلة ---------- */
const LINKS = [['/', 'الرئيسية', 'home'], ['/menu', 'المنيو', 'menu'], ['/about', 'من نحن', 'about'], ['/reserve', 'احجز طاولة', 'reserve'], ['/contact', 'تواصل معنا', 'contact']];
if (page !== 'admin') {
  document.body.insertAdjacentHTML('afterbegin', `
  <div class="aurora"><i></i><i></i><i></i></div><canvas id="fx"></canvas><div class="cursor"></div>
  <nav id="nav"><a class="logo" href="/">أحمد <b>كوفي</b></a>
    <div class="links">${LINKS.map(l => `<a href="${l[0]}" class="${l[2] === page ? 'on' : ''}">${l[1]}</a>`).join('')}
      <button class="cartbtn" id="openCart" aria-label="سلة الطلب">طلبي<em id="count">0</em></button></div>
    <button class="burger" id="burger" aria-label="القائمة">☰</button></nav>`);
  document.body.insertAdjacentHTML('beforeend', `
  <footer><div class="fgrid">
    <div><a class="logo" href="/" style="display:flex">أحمد <b>كوفي</b></a><p>قهوة مختصة محمّصة يوميًا، في مكان بتصميم من المستقبل.</p></div>
    <div><h4>الموقع</h4>${LINKS.map(l => `<a href="${l[0]}">${l[1]}</a>`).join('')}</div>
    <div><h4>تواصل</h4><p>${esc(SITE.phone)}</p><p>${esc(SITE.address)}</p><p>${esc(SITE.hours)}</p></div></div>
    <div class="copy">© ${new Date().getFullYear()} أحمد كوفي — كل الحقوق محفوظة</div></footer>
  <div class="veil" id="veil"></div>
  <aside class="drawer" id="drawer" aria-label="سلة الطلب"><button class="close" id="closeCart" aria-label="إغلاق">✕</button>
    <h2 style="font-size:1.6rem;margin:0">طلبي</h2><div class="lines" id="lines"></div>
    <div class="total"><span>الإجمالي</span><span id="total">0 ج.م</span></div>
    <form id="orderForm" style="display:grid;gap:10px"><input name="name" placeholder="الاسم" required maxlength="40" autocomplete="name">
      <input name="phone" type="tel" placeholder="رقم الموبايل" required autocomplete="tel"><input name="note" placeholder="ملاحظات (اختياري)" maxlength="200">
      <button class="cta" type="submit">ابعت الطلب</button></form></aside>
  <div class="toast" id="toast" role="status"></div>`);

  // شاشة البداية (مرة واحدة في الجلسة)
  if (!sessionStorage.getItem('intro') && !reduce) {
    sessionStorage.setItem('intro', 1);
    document.body.insertAdjacentHTML('afterbegin', '<div class="intro" id="intro"><div><b>أحمد كوفي</b><span></span></div></div>');
    setTimeout(() => $('#intro').classList.add('out'), 1300); setTimeout(() => $('#intro').remove(), 2100);
  }
  $('#burger').onclick = () => $('#nav').classList.toggle('open');
}

/* ---------- كوب SVG ---------- */
const cup = c => `<svg width="130" height="130" viewBox="0 0 130 130" aria-hidden="true">
<defs><linearGradient id="g${c.slice(1)}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/></linearGradient></defs>
<g class="steam"><path d="M48 34c-8-8 8-14 0-24"/><path d="M65 34c-8-8 8-14 0-24"/><path d="M82 34c-8-8 8-14 0-24"/></g>
<ellipse cx="65" cy="110" rx="46" ry="9" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.3)"/>
<path d="M28 48h74v26c0 20-14 34-37 34S28 94 28 74z" fill="url(#g${c.slice(1)})" stroke="rgba(255,255,255,.5)"/>
<path d="M102 56h8a12 12 0 0 1 0 24h-9" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="4"/>
<ellipse cx="65" cy="50" rx="37" ry="8" fill="${c}" stroke="rgba(255,255,255,.5)"/><ellipse cx="65" cy="49" rx="24" ry="4" fill="rgba(255,255,255,.18)"/></svg>`;
$$('[data-cup]').forEach(e => e.innerHTML = cup(e.dataset.cup));

/* ---------- السلة ---------- */
let MENU = [], cart = {};
try { cart = JSON.parse(localStorage.getItem('ac_cart') || '{}'); } catch { }
const saveCart = () => { try { localStorage.setItem('ac_cart', JSON.stringify(cart)); } catch { } };
function drawCart() {
  if (!$('#lines')) return;
  const ids = Object.keys(cart).filter(k => cart[k] > 0 && MENU.find(m => m.id == k));
  const n = ids.reduce((s, k) => s + cart[k], 0), em = $('#count');
  if (em.textContent != n) { em.classList.add('bump'); setTimeout(() => em.classList.remove('bump'), 250); }
  em.textContent = n;
  $('#lines').innerHTML = ids.length ? ids.map(k => { const m = MENU.find(x => x.id == k);
    return `<div class="line"><span>${esc(m.name)}</span><button data-k="${k}" data-d="-1" aria-label="أنقص">−</button><b>${cart[k]}</b><button data-k="${k}" data-d="1" aria-label="زوّد">+</button></div>`; }).join('')
    : '<p class="empty">الطلب فاضي. اختار من المنيو ☕</p>';
  $('#total').textContent = ids.reduce((s, k) => s + cart[k] * MENU.find(x => x.id == k).price, 0) + ' ج.م';
}
const cardHTML = m => `<article class="tilt card rv" tabindex="0">${m.available ? '' : '<span class="sold">غير متاح</span>'}
  <div class="art">${m.img ? `<img src="${esc(m.img)}" alt="${esc(m.name)}" width="170" height="170" style="object-fit:cover;border-radius:26px;box-shadow:0 20px 40px -12px #000">` : cup(m.color)}</div>
  <div class="info"><h3>${esc(m.name)}</h3><span class="price">${m.price} ج.م</span></div>
  <div class="glass"><p>${esc(m.desc)}</p><div class="notes">${m.notes.map(n => `<span>${esc(n)}</span>`).join('')}</div>
  <button class="add" data-id="${m.id}" ${m.available ? '' : 'disabled'}>أضف للطلب</button></div></article>`;
function showCards(el, list) { el.innerHTML = list.map(cardHTML).join(''); $$('.card', el).forEach((c, i) => c.style.setProperty('--d', i * 80 + 'ms')); reveal(); }

if (page !== 'admin') {
  document.addEventListener('click', e => {
    const add = e.target.closest('.add');
    if (add) { const m = MENU.find(x => x.id == add.dataset.id); cart[m.id] = Math.min(20, (cart[m.id] || 0) + 1); saveCart(); drawCart(); toast('تمت إضافة ' + m.name + ' ☕'); return; }
    const card = e.target.closest('.card'); if (card) card.classList.toggle('open');
    const b = e.target.closest('#lines button'); if (b) { cart[b.dataset.k] = Math.max(0, cart[b.dataset.k] + +b.dataset.d); saveCart(); drawCart(); }
  });
  const drawer = (on) => { $('#drawer').classList.toggle('on', on); $('#veil').classList.toggle('on', on); };
  $('#openCart').onclick = () => drawer(true); $('#closeCart').onclick = $('#veil').onclick = () => drawer(false);
  $('#orderForm').onsubmit = async e => {
    e.preventDefault();
    const items = Object.keys(cart).filter(k => cart[k] > 0).map(k => ({ id: +k, qty: cart[k] }));
    try {
      const o = await api('/api/orders', { ...Object.fromEntries(new FormData(e.target)), items });
      cart = {}; saveCart(); drawCart(); e.target.reset(); drawer(false);
      toast(`تم استلام طلبك رقم ${o.number} · الإجمالي ${o.total} ج.م`);
    } catch (err) { toast(err.message); }
  };
  api('/api/menu').then(m => {
    MENU = m; drawCart();
    const g = $('#grid'), f = $('#featured');
    if (g) { showCards(g, MENU); $('#chips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; $$('.chip').forEach(x => x.setAttribute('aria-pressed', x === b)); showCards(g, MENU.filter(x => b.dataset.c === 'all' || x.cat === b.dataset.c)); }; }
    if (f) showCards(f, [5, 4, 9].map(id => MENU.find(x => x.id === id)).filter(Boolean));
    $$('[data-count="menu"]').forEach(e => e.dataset.count = MENU.length);
    counters();
  }).catch(() => toast('تعذّر تحميل المنيو'));
}

/* ---------- حركات ---------- */
// ميلان 3D (تفويض أحداث يشمل العناصر الديناميكية)
let lastTilt = null;
document.addEventListener('pointermove', e => {
  const el = e.target.closest?.('.tilt');
  if (lastTilt && lastTilt !== el) { lastTilt.classList.remove('live'); lastTilt.style.setProperty('--rx', '0deg'); lastTilt.style.setProperty('--ry', '0deg'); }
  lastTilt = el;
  const cur = $('.cursor'); if (cur && fine) { cur.style.opacity = 1; cur.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }
  if (!el || reduce) return;
  const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  el.classList.add('live'); el.style.setProperty('--ry', (x - .5) * 18 + 'deg'); el.style.setProperty('--rx', (.5 - y) * 18 + 'deg');
  el.style.setProperty('--mx', x * 100 + '%'); el.style.setProperty('--my', y * 100 + '%');
});
// عمق متحرك مع الماوس + أزرار مغناطيسية
document.addEventListener('pointermove', e => {
  if (reduce || !fine) return;
  const cx = e.clientX / innerWidth - .5, cy = e.clientY / innerHeight - .5;
  $$('[data-depth]').forEach(d => d.style.translate = `${cx * -d.dataset.depth}px ${cy * -d.dataset.depth}px`);
  $$('.mag').forEach(b => { const r = b.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    b.style.translate = Math.hypot(dx, dy) < 110 ? `${dx * .25}px ${dy * .25}px` : '0 0'; });
});
// ظهور عند التمرير
const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { threshold: .12 });
function reveal() { $$('.rv:not(.in)').forEach(e => io.observe(e)); }
$$('[data-stagger]').forEach(p => [...p.children].forEach((c, i) => { c.classList.add('rv'); c.style.setProperty('--d', i * 120 + 'ms'); }));
reveal();
// كلمات العنوان تظهر واحدة واحدة (بالكلمة عشان حروف العربي متتفككش)
$$('[data-split]').forEach(h => { h.innerHTML = h.textContent.trim().split(/\s+/).map((w, i) => `<span class="w" style="--i:${i}">${esc(w)}</span>`).join(' '); });
// عدّادات
function counters() {
  const co = new IntersectionObserver(es => es.forEach(x => { if (!x.isIntersecting) return; co.unobserve(x.target);
    const to = +x.target.dataset.count, t0 = performance.now();
    (function tick(t) { const p = Math.min(1, (t - t0) / 1600); x.target.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString('ar-EG'); if (p < 1) requestAnimationFrame(tick); })(t0);
  }), { threshold: .5 });
  $$('[data-count]').forEach(e => { if (+e.dataset.count) co.observe(e); });
}
counters();
// انتقال ناعم بين الصفحات
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="/"]'); if (!a || a.target || e.metaKey || e.ctrlKey || a.getAttribute('href').startsWith('//')) return;
  e.preventDefault(); document.body.classList.add('leave'); setTimeout(() => location.href = a.href, 260);
});
addEventListener('pageshow', e => { if (e.persisted) document.body.classList.remove('leave'); });
// جسيمات عائمة
(function () {
  const c = $('#fx'); if (!c || reduce) return;
  const x = c.getContext('2d'); let w, h, P = [];
  const size = () => { w = c.width = innerWidth; h = c.height = innerHeight; };
  size(); addEventListener('resize', size);
  for (let i = 0; i < 38; i++) P.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 2.6 + .6, v: Math.random() * .35 + .1, a: Math.random() * .5 + .15, t: Math.random() > .5 });
  (function loop() {
    if (!document.hidden) { x.clearRect(0, 0, w, h);
      P.forEach(p => { p.y -= p.v; p.x += Math.sin(p.y / 60) * .25; if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fillStyle = (p.t ? 'rgba(255,167,51,' : 'rgba(33,230,193,') + p.a + ')'; x.shadowBlur = 12; x.shadowColor = p.t ? '#ffa733' : '#21e6c1'; x.fill(); }); }
    requestAnimationFrame(loop);
  })();
})();

/* ---------- صفحة الحجز ---------- */
const rf = $('#resForm');
if (rf) {
  const d = rf.date, now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  d.min = d.value = now.toISOString().slice(0, 10);
  for (let h = 8; h <= 23; h++) for (const m of ['00', '30']) { if (h === 23 && m === '30') continue; const t = `${String(h).padStart(2, '0')}:${m}`; rf.time.add(new Option(t, t, false, t === '20:00')); }
  for (let g = 1; g <= 10; g++) rf.guests.add(new Option(g + (g === 1 ? ' فرد' : ' أفراد'), g, false, g === 2));
  rf.onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api('/api/reservations', Object.fromEntries(new FormData(rf)));
      $('#resOut').innerHTML = `<div class="tilt result"><p>تم تأكيد حجزك ✨</p><b>${esc(r.number)}</b><p>${esc(r.table)} · ${esc(r.date)} الساعة ${esc(r.time)} · ${r.guests} أفراد</p></div>`;
      rf.reset(); d.value = d.min; $('#resOut').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) { toast(err.message); }
  };
}
/* ---------- صفحة التواصل ---------- */
const mf = $('#msgForm');
if (mf) mf.onsubmit = async e => { e.preventDefault(); try { await api('/api/messages', Object.fromEntries(new FormData(mf))); mf.reset(); toast('وصلت رسالتك، هنرد عليك قريب 💌'); } catch (err) { toast(err.message); } };
$$('[data-site]').forEach(e => e.textContent = SITE[e.dataset.site]);
$$('[data-wa]').forEach(e => e.href = 'https://wa.me/' + SITE.wa);
