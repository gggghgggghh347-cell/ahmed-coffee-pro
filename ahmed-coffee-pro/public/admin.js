const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let D = null, tab = 'orders', timer, last = -1;
const OS = ['جديد', 'قيد التحضير', 'جاهز', 'تم التسليم', 'ملغي'], RS = ['جديد', 'مؤكد', 'حضر', 'ملغي'];

async function call(url, body) {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.includes('login')) throw 401;
  if (!r.ok) throw new Error(d.error || 'خطأ');
  return d;
}
const wa = p => { let n = String(p || '').replace(/\D/g, ''); if (n.startsWith('0')) n = '2' + n; return 'https://wa.me/' + n; };
const opts = (l, c) => l.map(x => `<option ${x === c ? 'selected' : ''}>${x}</option>`).join('');
function beep() { try { const a = new AudioContext(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.setValueAtTime(.15, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .5); o.start(); o.stop(a.currentTime + .5); } catch { } }

async function load() {
  D = await call('/api/admin/data');
  const day = D.today, to = D.orders.filter(o => o.at && new Date(o.at).toLocaleDateString('sv-SE') === day);
  const nO = D.orders.filter(o => o.status === 'جديد').length, nR = D.reservations.filter(r => r.status === 'جديد').length, nM = D.messages.filter(m => !m.seen).length;
  $('#s1').textContent = to.length; $('#s2').textContent = to.filter(o => o.status !== 'ملغي').reduce((s, o) => s + o.total, 0) + ' ج.م';
  $('#s3').textContent = nO; $('#s4').textContent = D.reservations.filter(r => r.date === day && r.status !== 'ملغي').length;
  [['b1', nO], ['b2', nR], ['b3', nM]].forEach(([id, n]) => { const e = $('#' + id); e.hidden = !n; e.textContent = n; });
  const tot = nO + nR + nM;
  if (last >= 0 && tot > last) { beep(); document.title = '🔔 جديد! — لوحة أحمد كوفي'; } else if (!tot) document.title = 'لوحة إدارة أحمد كوفي';
  last = tot; draw();
}
function draw() {
  const L = $('#list'); let h = '';
  if (tab === 'orders') h = D.orders.map(o => `<div class="g item st-${esc(o.status)}"><div><h3>${esc(o.number)} · ${esc(o.name)} <small>${esc(o.phone)}</small></h3>
    <ul>${o.items.map(i => `<li>${i.qty} × ${esc(i.name)}</li>`).join('')}</ul>${o.note ? `<small>ملاحظة: ${esc(o.note)}</small><br>` : ''}
    <small>${new Date(o.at).toLocaleString('ar-EG')}</small><br><a class="wa" target="_blank" rel="noopener" href="${wa(o.phone)}">واتساب</a></div>
    <div style="text-align:left"><div class="tot">${o.total} ج.م</div><select data-ty="order" data-id="${o.id}">${opts(OS, o.status)}</select></div></div>`).join('');
  if (tab === 'reservations') h = D.reservations.map(r => `<div class="g item st-${esc(r.status)}"><div><h3>${esc(r.number)} · ${esc(r.name)} <small>${esc(r.phone)}</small></h3>
    <small>${esc(r.date)}${r.date === D.today ? ' (النهارده)' : ''} الساعة ${esc(r.time)} · ${r.guests} أفراد · ${esc(r.table_name || '')}</small><br><a class="wa" target="_blank" rel="noopener" href="${wa(r.phone)}">واتساب</a></div>
    <select data-ty="reservation" data-id="${r.id}">${opts(RS, r.status)}</select></div>`).join('');
  if (tab === 'messages') h = D.messages.map(m => `<div class="g item" style="${m.seen ? 'opacity:.55' : 'border-inline-start:4px solid var(--teal)'}"><div><h3>${esc(m.name)} <small>${esc(m.phone || '')}</small></h3>
    <p>${esc(m.text)}</p><small>${new Date(m.at).toLocaleString('ar-EG')}</small>${m.phone ? `<br><a class="wa" target="_blank" rel="noopener" href="${wa(m.phone)}">رد واتساب</a>` : ''}</div>
    ${m.seen ? '' : `<button class="btn sm" data-seen="${m.id}">تمت القراءة</button>`}</div>`).join('');
  if (tab === 'menu') h = D.menu.map(m => `<div class="g item"><div><h3>${esc(m.name)}</h3></div><div style="display:flex;gap:10px;align-items:center">
    <input class="mini" type="number" min="1" value="${m.price}" data-price="${m.id}" aria-label="السعر"><span>ج.م</span>
    <select data-avail="${m.id}"><option value="1" ${m.available ? 'selected' : ''}>متاح</option><option value="0" ${m.available ? '' : 'selected'}>غير متاح</option></select></div></div>`).join('');
  L.innerHTML = h || '<p class="empty" style="text-align:center;color:var(--mute);padding:40px">مفيش حاجة هنا لسه.</p>';
}
$('#list').onchange = async e => {
  const t = e.target;
  try {
    if (t.dataset.ty) await call('/api/admin/status', { type: t.dataset.ty, id: t.dataset.id, status: t.value });
    else if (t.dataset.price) await call('/api/admin/menu', { id: t.dataset.price, price: t.value });
    else if (t.dataset.avail) await call('/api/admin/menu', { id: t.dataset.avail, available: t.value === '1' });
    else return;
    load();
  } catch (err) { alert(err === 401 ? 'انتهت الجلسة' : err.message); }
};
$('#list').onclick = async e => { const b = e.target.closest('[data-seen]'); if (b) { await call('/api/admin/seen', { id: b.dataset.seen }); load(); } };
$('#tabs').onclick = e => { const b = e.target.closest('.tab'); if (!b) return; tab = b.dataset.t; document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); };

async function enter() {
  try { await load(); } catch (e) { $('#login').hidden = false; $('#app').hidden = true; return false; }
  $('#login').hidden = true; $('#app').hidden = false;
  clearInterval(timer); timer = setInterval(() => load().catch(() => { clearInterval(timer); location.reload(); }), 10000);
  return true;
}
$('#login').onsubmit = async e => {
  e.preventDefault(); $('#err').textContent = '';
  try { await call('/api/admin/login', { username: $('#user').value, password: $('#pw').value }); $('#pw').value = ''; last = -1; await enter(); }
  catch (err) { $('#err').textContent = err.message || 'خطأ'; }
};
$('#out').onclick = async () => { await call('/api/admin/logout', {}); location.reload(); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = 'لوحة إدارة أحمد كوفي'; });
$('#login').hidden = true; enter();
