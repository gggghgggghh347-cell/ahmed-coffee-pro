// أحمد كوفي PRO — باك إند بدون مكتبات خارجية (يحتاج Node 22.13 أو أحدث)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const WEBHOOK = process.env.NOTIFY_WEBHOOK || '';           // رابط Discord/Slack لإشعار الطلبات الجديدة
const OWNER = (() => { let n = String(process.env.OWNER_WHATSAPP || '01055407049').replace(/\D/g, ''); if (n.startsWith('0')) n = '2' + n; return n; })(); // رقم صاحب الكافيه (واتساب)
const WA_TOKEN = process.env.WA_TOKEN || '', WA_PHONE_ID = process.env.WA_PHONE_ID || '';        // واتساب الرسمي (Meta Cloud API) — إشعارات + تحكم
const WA_VERIFY = process.env.WA_VERIFY_TOKEN || '', WA_SECRET = process.env.WA_APP_SECRET || '';
const CMB_KEY = process.env.CALLMEBOT_APIKEY || '';                                              // CallMeBot المجاني — إشعارات فقط
const DEFAULT_PW = 'ahmedyoussef';
const PROD = process.env.NODE_ENV === 'production';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';         // فعّله خلف Render/Railway/Nginx
const TZ = process.env.TZ_NAME || 'Africa/Cairo';
const PUB = path.join(__dirname, 'public');
const DUR = 90;                                              // مدة الحجز بالدقائق
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- قاعدة البيانات ----------
const db = new DatabaseSync(path.join(DATA_DIR, 'ahmed-coffee.db'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS menu(id INTEGER PRIMARY KEY, cat TEXT, name TEXT, price INTEGER, color TEXT, descr TEXT, notes TEXT, available INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS dtables(id INTEGER PRIMARY KEY, name TEXT, seats INTEGER);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT, name TEXT, phone TEXT, note TEXT, items TEXT, total INTEGER, status TEXT DEFAULT 'جديد', at TEXT);
CREATE TABLE IF NOT EXISTS reservations(id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT, name TEXT, phone TEXT, date TEXT, time TEXT, guests INTEGER, table_id INTEGER, status TEXT DEFAULT 'جديد', at TEXT);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, text TEXT, at TEXT, seen INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY, username TEXT UNIQUE, hash TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, exp INTEGER);
CREATE INDEX IF NOT EXISTS idx_res ON reservations(date, status);`);

if (!db.prepare('SELECT COUNT(*) c FROM menu').get().c) {
  const M = [
    ['hot', 'إسبريسو مزدوج', 55, '#3b1f10', 'شوتين مركزين من بن برازيلي محمص داكن، كريما كثيفة وطعم شيكولاتة مُرّة.', ['بن برازيلي', '٩ بار', 'داكن']],
    ['hot', 'فلات وايت', 75, '#8a5a33', 'ميكروفوم حريري فوق شوتين ريستريتو، متوازن وناعم.', ['حليب كامل', 'ريستريتو']],
    ['hot', 'قهوة أحمد بالهيل', 60, '#5a3a1e', 'القهوة التركي على الطريقة القديمة بهيل مطحون وقرفة خفيفة.', ['هيل', 'قرفة', 'رملة']],
    ['hot', 'موكا كراميل مملّح', 90, '#a8683a', 'إسبريسو وشيكولاتة بلجيكي وصوص كراميل بملح البحر.', ['شيكولاتة بلجيكي', 'كراميل']],
    ['cold', 'نيترو كولد برو', 95, '#1b1209', 'مخمّر ١٨ ساعة ومُحقن بالنيتروجين، رغوة كثيفة وحلاوة طبيعية.', ['١٨ ساعة', 'نيتروجين']],
    ['cold', 'آيس سبانش لاتيه', 85, '#c9a06a', 'لاتيه مثلج بحليب مكثف محلّى وطبقة إسبريسو فوقه.', ['حليب مكثف', 'مثلج']],
    ['cold', 'فرابيه فانيليا', 80, '#e3c9a0', 'مشروب مثلج كريمي بفانيليا طبيعية وكريمة مخفوقة.', ['فانيليا', 'كريمة']],
    ['sweet', 'كرواسون اللوز', 70, '#d9a441', 'كرواسون زبدة فرنسي بحشوة كريمة اللوز، يتسخّن عند الطلب.', ['زبدة', 'لوز']],
    ['sweet', 'تشيز كيك لوتس', 110, '#b5562b', 'تشيز كيك ناعم على قاعدة بسكويت لوتس وصوص كراميل دافئ.', ['لوتس', 'كراميل']],
  ];
  const ins = db.prepare('INSERT INTO menu(cat,name,price,color,descr,notes) VALUES(?,?,?,?,?,?)');
  M.forEach(m => ins.run(m[0], m[1], m[2], m[3], m[4], JSON.stringify(m[5])));
}
if (!db.prepare('SELECT COUNT(*) c FROM dtables').get().c) {
  const ins = db.prepare('INSERT INTO dtables(name,seats) VALUES(?,?)');
  [['طاولة ١', 2], ['طاولة ٢', 2], ['طاولة ٣', 4], ['طاولة ٤', 4], ['طاولة ٥', 4], ['طاولة ٦', 6], ['طاولة ٧', 6], ['كبار الزوار', 10]].forEach(t => ins.run(t[0], t[1]));
}

// ---------- أدوات ----------
const hashPw = pw => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(pw, s, 64).toString('hex'); };
const checkPw = (pw, st) => { const [s, h] = st.split(':'), a = Buffer.from(h, 'hex'), b = crypto.scryptSync(pw, s, 64); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const envPw = process.env.ADMIN_PASSWORD, adm = db.prepare('SELECT id FROM admins WHERE username=?').get('admin');
if (envPw) { adm ? db.prepare('UPDATE admins SET hash=? WHERE username=?').run(hashPw(envPw), 'admin') : db.prepare('INSERT INTO admins(username,hash) VALUES(?,?)').run('admin', hashPw(envPw)); }
else if (!adm) { db.prepare('INSERT INTO admins(username,hash) VALUES(?,?)').run('admin', hashPw(DEFAULT_PW)); console.log('⚠️  كلمة سر الإدارة الافتراضية: ' + DEFAULT_PW + ' — غيّرها بالمتغير ADMIN_PASSWORD'); }
else { const row = db.prepare('SELECT hash FROM admins WHERE username=?').get('admin'); if (checkPw('ahmed2026', row.hash)) db.prepare('UPDATE admins SET hash=? WHERE username=?').run(hashPw(DEFAULT_PW), 'admin'); }

const hits = new Map();
const limited = (ip, key, max, win) => {
  const k = key + ip, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < win);
  a.push(now); hits.set(k, a); return a.length > max;
};
setInterval(() => { const n = Date.now(); for (const [k, a] of hits) if (!a.some(t => n - t < 3600e3)) hits.delete(k); db.prepare('DELETE FROM sessions WHERE exp<?').run(n); }, 600e3).unref();

const ipOf = req => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'x';
const send = (res, code, obj, h = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...h }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, no) => {
  let b = '';
  req.on('data', c => { b += c; if (b.length > 2e5) { req.destroy(); no(); } });
  req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { no(); } });
});
const latin = s => String(s ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const clean = (s, n = 80) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, n);
const phoneOf = s => { const p = latin(s).trim(); return /^[0-9+\s-]{8,16}$/.test(p) ? p : ''; };
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
// ---------- واتساب: إرسال الإشعارات ----------
let queue = Promise.resolve();
const sendWA = text => { queue = queue.then(() => deliver(text)).catch(() => {}); return queue; };
async function deliver(text) {
  try {
    if (WA_TOKEN && WA_PHONE_ID) {
      const r = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, { method: 'POST', headers: { Authorization: 'Bearer ' + WA_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: OWNER, type: 'text', text: { body: text } }) });
      if (!r.ok) console.log('WhatsApp API error', r.status, (await r.text()).slice(0, 300));
    } else if (CMB_KEY) {
      const r = await fetch(`https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent('+' + OWNER)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(CMB_KEY)}`);
      if (!r.ok) console.log('CallMeBot error', r.status);
      await new Promise(ok => setTimeout(ok, 1500)); // CallMeBot بيحدد معدل الإرسال
    } else console.log('[واتساب غير مفعّل — الرسالة اللي كانت هتتبعت:]\n' + text + '\n');
  } catch (e) { console.log('WhatsApp send failed:', e.message); }
}
const notify = text => { sendWA(text); if (WEBHOOK) fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text, text }) }).catch(() => {}); };
const intl = p => { let n = latin(p).replace(/\D/g, ''); return n.startsWith('0') ? '2' + n : n; };
const sidOf = req => (req.headers.cookie || '').match(/(?:^|;\s*)sid=([a-f0-9]{64})/)?.[1];
const isAdmin = req => { const s = sidOf(req); const r = s && db.prepare('SELECT exp FROM sessions WHERE token=?').get(s); return !!(r && r.exp > Date.now()); };

const ORDER_ST = ['جديد', 'قيد التحضير', 'جاهز', 'تم التسليم', 'ملغي'], RES_ST = ['جديد', 'مؤكد', 'حضر', 'ملغي'];

function reserve(r) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const [h, m] = r.time.split(':').map(Number), start = h * 60 + m;
    const busy = new Set(db.prepare("SELECT table_id, time FROM reservations WHERE date=? AND status!='ملغي'").all(r.date)
      .filter(x => { const [a, b] = x.time.split(':').map(Number); return Math.abs(a * 60 + b - start) < DUR; }).map(x => x.table_id));
    const t = db.prepare('SELECT * FROM dtables WHERE seats>=? ORDER BY seats,id').all(r.guests).find(x => !busy.has(x.id));
    if (!t) { db.exec('ROLLBACK'); return null; }
    const id = Number(db.prepare('INSERT INTO reservations(name,phone,date,time,guests,table_id,at) VALUES(?,?,?,?,?,?,?)')
      .run(r.name, r.phone, r.date, r.time, r.guests, t.id, new Date().toISOString()).lastInsertRowid);
    const number = 'R-' + (500 + id);
    db.prepare('UPDATE reservations SET number=? WHERE id=?').run(number, id);
    db.exec('COMMIT');
    return { number, table: t.name, ...r };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}


// ---------- التحكم من واتساب ----------
const norm = t => latin(t).trim().toLowerCase().replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const HELP = `🎛️ *أوامر التحكم*\nطلبات — الطلبات الجديدة\nحجوزات — الحجوزات القادمة\nاليوم — ملخص النهارده\nتحضير 1001 | جاهز 1001 | تسليم 1001\nالغاء طلب 1001\nتأكيد 501 | حضر 501 | الغاء حجز 501\nمنيو — الأصناف وأرقامها\nنفد 5 | متاح 5`;
function setStatus(table, prefix, n, st) {
  const r = n && db.prepare(`SELECT id,name FROM ${table} WHERE number=?`).get(prefix + '-' + n);
  if (!r) return `❌ مفيش ${prefix === 'A' ? 'طلب' : 'حجز'} برقم ${n || '؟'}`;
  db.prepare(`UPDATE ${table} SET status=? WHERE id=?`).run(st, r.id);
  return `✅ ${prefix}-${n} (${r.name}) ← ${st}`;
}
function command(raw) {
  const t = norm(raw), w = t.split(/\s+/), c = w[0], n = (t.match(/\d+/) || [])[0], day = today();
  if (['مساعده', 'help', '?', 'اوامر', 'start'].includes(c)) return HELP;
  if (c === 'طلبات') { const l = db.prepare("SELECT * FROM orders WHERE status IN ('جديد','قيد التحضير') ORDER BY id").all(); return l.length ? '🛎️ *طلبات مفتوحة*\n' + l.map(o => `${o.number} — ${o.name} — ${o.total} ج.م [${o.status}]`).join('\n') : 'مفيش طلبات مفتوحة 👌'; }
  if (c === 'حجوزات') { const l = db.prepare("SELECT r.*, t.name tn FROM reservations r LEFT JOIN dtables t ON t.id=r.table_id WHERE r.date>=? AND r.status IN ('جديد','مؤكد') ORDER BY r.date,r.time LIMIT 20").all(day); return l.length ? '📅 *حجوزات قادمة*\n' + l.map(r => `${r.number} — ${r.name} — ${r.date} ${r.time} — ${r.guests} أفراد — ${r.tn} [${r.status}]`).join('\n') : 'مفيش حجوزات قادمة'; }
  if (c === 'اليوم') {
    const o = db.prepare("SELECT total,status,at FROM orders").all().filter(x => new Date(x.at).toLocaleDateString('sv-SE', { timeZone: TZ }) === day && x.status !== 'ملغي');
    const rc = db.prepare("SELECT COUNT(*) c FROM reservations WHERE date=? AND status!='ملغي'").get(day).c;
    return `📊 *ملخص النهارده*\nالطلبات: ${o.length}\nالإيراد: ${o.reduce((s, x) => s + x.total, 0)} ج.م\nحجوزات اليوم: ${rc}`;
  }
  if (c === 'منيو') return '☕ *المنيو*\n' + db.prepare('SELECT * FROM menu ORDER BY id').all().map(m => `${m.id}. ${m.name} — ${m.price} ج.م ${m.available ? '' : '(نفد)'}`).join('\n');
  if (c === 'تحضير') return setStatus('orders', 'A', n, 'قيد التحضير');
  if (c === 'جاهز') return setStatus('orders', 'A', n, 'جاهز');
  if (c === 'تسليم') return setStatus('orders', 'A', n, 'تم التسليم');
  if (c === 'تاكيد') return setStatus('reservations', 'R', n, 'مؤكد');
  if (c === 'حضر') return setStatus('reservations', 'R', n, 'حضر');
  if (c === 'الغاء') return w[1] === 'طلب' ? setStatus('orders', 'A', n, 'ملغي') : w[1] === 'حجز' ? setStatus('reservations', 'R', n, 'ملغي') : 'اكتب: الغاء طلب 1001  أو  الغاء حجز 501';
  if (c === 'نفد' || c === 'متاح') { const m = n && db.prepare('SELECT name FROM menu WHERE id=?').get(Number(n)); if (!m) return '❌ رقم الصنف غلط. ابعت: منيو'; db.prepare('UPDATE menu SET available=? WHERE id=?').run(c === 'متاح' ? 1 : 0, Number(n)); return `✅ ${m.name} ← ${c === 'متاح' ? 'متاح' : 'نفد'}`; }
  return 'مش فاهم الأمر 🤔\n' + HELP;
}
const rawBody = req => new Promise((ok, no) => { let b = ''; req.on('data', c => { b += c; if (b.length > 5e5) { req.destroy(); no(); } }); req.on('end', () => ok(b)); });
async function whatsappHook(req, res, url) {
  if (req.method === 'GET') { // تحقق Meta من الـ webhook
    if (WA_VERIFY && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === WA_VERIFY) { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(url.searchParams.get('hub.challenge') || ''); }
    res.writeHead(403); return res.end();
  }
  const raw = await rawBody(req);
  if (!WA_SECRET) { res.writeHead(503); return res.end(); }  // مقفول لحد ما تحط WA_APP_SECRET
  const exp = 'sha256=' + crypto.createHmac('sha256', WA_SECRET).update(raw).digest('hex'), sig = String(req.headers['x-hub-signature-256'] || '');
  if (sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) { res.writeHead(401); return res.end(); }
  res.writeHead(200); res.end('ok');
  try { for (const e of JSON.parse(raw).entry || []) for (const c of e.changes || []) for (const m of c.value?.messages || []) if (m.type === 'text' && String(m.from) === OWNER) sendWA(command(m.text.body)); } catch { }
}

// ---------- API ----------
async function api(req, res, p, url) {
  const ip = ipOf(req), post = req.method === 'POST';
  if (post && !(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'نوع الطلب غير مدعوم' });

  if (p === '/api/menu' && req.method === 'GET') {
    const imgOf = id => { for (const e of ['webp', 'jpg', 'png']) if (fs.existsSync(path.join(PUB, 'img', id + '.' + e))) return '/img/' + id + '.' + e; return null; };
    return send(res, 200, db.prepare('SELECT * FROM menu ORDER BY id').all().map(m => ({ id: m.id, cat: m.cat, name: m.name, price: m.price, color: m.color, desc: m.descr, notes: JSON.parse(m.notes), available: !!m.available, img: imgOf(m.id) })));
  }

  if (post && p === '/api/orders') {
    if (limited(ip, 'o', 8, 600e3)) return send(res, 429, { error: 'طلبات كتير في وقت قصير، جرّب بعد شوية' });
    const b = await readBody(req), name = clean(b.name, 40), phone = phoneOf(b.phone), note = clean(b.note, 200);
    if (!name || !phone) return send(res, 400, { error: 'اكتب الاسم ورقم موبايل صحيح' });
    const items = []; 
    for (const i of (Array.isArray(b.items) ? b.items.slice(0, 40) : [])) {
      const m = db.prepare('SELECT * FROM menu WHERE id=?').get(Number(i.id)), qty = Math.min(20, Math.max(1, parseInt(i.qty) || 0));
      if (!m) continue;
      if (!m.available) return send(res, 400, { error: `${m.name} غير متاح حاليًا` });
      items.push({ id: m.id, name: m.name, price: m.price, qty });
    }
    if (!items.length) return send(res, 400, { error: 'الطلب فاضي' });
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    const id = Number(db.prepare('INSERT INTO orders(name,phone,note,items,total,at) VALUES(?,?,?,?,?,?)').run(name, phone, note, JSON.stringify(items), total, new Date().toISOString()).lastInsertRowid);
    const number = 'A-' + (1000 + id);
    db.prepare('UPDATE orders SET number=? WHERE id=?').run(number, id);
    const n = number.slice(2);
    notify(`🛎️ *طلب جديد ${number}*\n👤 ${name} — ${phone}\n${items.map(i => `• ${i.qty} × ${i.name} (${i.price * i.qty})`).join('\n')}\n${note ? '📝 ' + note + '\n' : ''}💰 الإجمالي: ${total} ج.م\n💬 كلّم العميل: wa.me/${intl(phone)}\n━━━━━━\nتحضير ${n} | جاهز ${n} | تسليم ${n} | الغاء طلب ${n}`);
    return send(res, 201, { number, total });
  }

  if (post && p === '/api/reservations') {
    if (limited(ip, 'r', 6, 600e3)) return send(res, 429, { error: 'محاولات كتير، جرّب بعد شوية' });
    const b = await readBody(req);
    const r = { name: clean(b.name, 40), phone: phoneOf(b.phone), date: latin(b.date).trim(), time: latin(b.time).trim(), guests: parseInt(b.guests) || 0 };
    if (!r.name || !r.phone) return send(res, 400, { error: 'اكتب الاسم ورقم موبايل صحيح' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || r.date < today()) return send(res, 400, { error: 'اختار تاريخ صحيح' });
    if (!/^\d{2}:\d{2}$/.test(r.time) || r.time < '08:00' || r.time > '23:00') return send(res, 400, { error: 'مواعيدنا من ٨ صباحًا لحد ١١ مساءً' });
    if (r.guests < 1 || r.guests > 10) return send(res, 400, { error: 'عدد الأفراد من ١ لـ ١٠' });
    const out = reserve(r);
    if (!out) return send(res, 409, { error: 'مفيش طاولة متاحة في الميعاد ده، جرّب ميعاد قريب' });
    const n = out.number.slice(2);
    notify(`📅 *حجز جديد ${out.number}*\n👤 ${r.name} — ${r.phone}\n🗓️ ${r.date} الساعة ${r.time}\n👥 ${r.guests} أفراد — ${out.table}\n💬 كلّم العميل: wa.me/${intl(r.phone)}\n━━━━━━\nتأكيد ${n} | الغاء حجز ${n}`);
    return send(res, 201, out);
  }

  if (post && p === '/api/messages') {
    if (limited(ip, 'm', 5, 600e3)) return send(res, 429, { error: 'رسائل كتير، جرّب بعد شوية' });
    const b = await readBody(req), name = clean(b.name, 40), phone = phoneOf(b.phone), text = clean(b.text, 1000);
    if (!name || !text) return send(res, 400, { error: 'اكتب اسمك ورسالتك' });
    db.prepare('INSERT INTO messages(name,phone,text,at) VALUES(?,?,?,?)').run(name, phone, text, new Date().toISOString());
    notify(`✉️ *رسالة جديدة*\n👤 ${name}${phone ? ' — ' + phone : ''}\n${text}${phone ? '\n💬 رد: wa.me/' + intl(phone) : ''}`);
    return send(res, 201, { ok: true });
  }

  // ----- الإدارة -----
  if (post && p === '/api/admin/login') {
    if (limited(ip, 'l', 6, 600e3)) return send(res, 429, { error: 'محاولات كتير، استنى ١٠ دقايق' });
    const b = await readBody(req), a = db.prepare('SELECT * FROM admins WHERE username=?').get(clean(b.username, 30));
    if (!a || !checkPw(String(b.password || ''), a.hash)) return send(res, 401, { error: 'بيانات الدخول غير صحيحة' });
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(token,exp) VALUES(?,?)').run(token, Date.now() + 12 * 3600e3);
    return send(res, 200, { ok: true }, { 'Set-Cookie': `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${PROD ? '; Secure' : ''}` });
  }
  if (p.startsWith('/api/admin/')) {
    if (post && p === '/api/admin/logout') { const s = sidOf(req); if (s) db.prepare('DELETE FROM sessions WHERE token=?').run(s); return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; Max-Age=0; Path=/' }); }
    if (!isAdmin(req)) return send(res, 401, { error: 'سجّل الدخول' });
    if (p === '/api/admin/data' && req.method === 'GET') {
      return send(res, 200, {
        orders: db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 300').all().map(o => ({ ...o, items: JSON.parse(o.items) })),
        reservations: db.prepare('SELECT r.*, t.name AS table_name FROM reservations r LEFT JOIN dtables t ON t.id=r.table_id ORDER BY r.date DESC, r.time DESC LIMIT 300').all(),
        messages: db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 200').all(),
        menu: db.prepare('SELECT id,name,price,available FROM menu ORDER BY id').all(),
        today: today(),
      });
    }
    if (post) {
      const b = await readBody(req);
      if (p === '/api/admin/status') {
        const o = b.type === 'reservation';
        if (!(o ? RES_ST : ORDER_ST).includes(b.status)) return send(res, 400, { error: 'حالة غير صالحة' });
        db.prepare(`UPDATE ${o ? 'reservations' : 'orders'} SET status=? WHERE id=?`).run(b.status, Number(b.id));
        return send(res, 200, { ok: true });
      }
      if (p === '/api/admin/menu') {
        if (b.price !== undefined) { const pr = parseInt(b.price); if (!(pr > 0 && pr < 10000)) return send(res, 400, { error: 'سعر غير صالح' }); db.prepare('UPDATE menu SET price=? WHERE id=?').run(pr, Number(b.id)); }
        if (b.available !== undefined) db.prepare('UPDATE menu SET available=? WHERE id=?').run(b.available ? 1 : 0, Number(b.id));
        return send(res, 200, { ok: true });
      }
      if (p === '/api/admin/seen') { db.prepare('UPDATE messages SET seen=1 WHERE id=?').run(Number(b.id)); return send(res, 200, { ok: true }); }
    }
  }
  return send(res, 404, { error: 'غير موجود' });
}

// ---------- الملفات الثابتة ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const SEC = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = decodeURIComponent(url.pathname);
  for (const k in SEC) res.setHeader(k, SEC[k]);
  try {
    if (p === '/api/whatsapp/webhook') return await whatsappHook(req, res, url);
    if (p.startsWith('/api/')) return await api(req, res, p, url);
    let rel = p === '/' ? '/index.html' : (path.extname(p) ? p : p + '.html');
    const file = path.normalize(path.join(PUB, rel));
    if (!file.startsWith(PUB + path.sep) || path.basename(file).startsWith('.')) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (e, d) => {
      if (e) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<meta charset="utf-8"><body style="background:#06070b;color:#fff;font-family:sans-serif;text-align:center;padding:20vh 0"><h1>٤٠٤</h1><p>الصفحة مش موجودة</p><a style="color:#ffa733" href="/">الرئيسية</a>'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=300' });
      res.end(d);
    });
  } catch { if (!res.headersSent) send(res, 400, { error: 'طلب غير صالح' }); }
});
server.listen(PORT, () => console.log(`☕ أحمد كوفي PRO شغال على http://localhost:${PORT} — واتساب: ${WA_TOKEN ? 'رسمي (إشعارات + تحكم)' : CMB_KEY ? 'CallMeBot (إشعارات)' : 'غير مفعّل'} → ${OWNER}`));
process.on('SIGTERM', () => { server.close(); db.close(); process.exit(0); });
