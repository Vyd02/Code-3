// Code 3 alert server (Cloudflare Worker)
// The app calls POST /notify when something happens on the line.
// This checks who sent it, finds who should hear about it, and sends a
// push alert through Firebase Cloud Messaging so phones get it even
// when Code 3 is closed. A daily timer also sends "overdue" alerts.

const MEMBER = ['employee', 'inspector', 'supervisor', 'admin', 'coowner'];
const AUD = {
  all: r => MEMBER.includes(r) || r === 'owner',
  insp: r => ['inspector', 'admin', 'coowner', 'owner'].includes(r),
  mgrish: r => ['supervisor', 'admin', 'coowner', 'owner'].includes(r),
  mgr: r => ['coowner', 'owner'].includes(r)
};
const TYPES = new Set(['line', 'pull', 'wait', 'down', 'hold', 'unhold', 'done', 's18', 'sig', 'req', 'signup', 'test']);

export default {
  async fetch(req, env, ctx) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/') return new Response('Code 3 alerts are running', { headers: cors });
    if (req.method !== 'POST' || url.pathname !== '/notify') return new Response('Not found', { status: 404, headers: cors });
    try {
      const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const user = await verifyIdToken(auth, env.PROJECT_ID);
      const ev = await req.json();
      if (!ev || !TYPES.has(ev.type)) return json({ error: 'bad type' }, 400, cors);
      const title = clip(ev.title, 80), body = clip(ev.body, 160);
      if (!title) return json({ error: 'no title' }, 400, cors);
      const sa = JSON.parse(env.FIREBASE_SA);
      const tok = await accessToken(sa);
      const people = await loadPeople(env.PROJECT_ID, tok);
      const me = people[user.uid];
      // Only people with a role can alert others. New sign-ups can only ping the owner and co-owners.
      if (ev.type === 'signup') { if (!me) return json({ error: 'no user' }, 403, cors); ev.aud = 'mgr'; }
      else if (!me || !(MEMBER.includes(me.role) || me.role === 'owner')) return json({ error: 'not allowed' }, 403, cors);
      if (ev.type === 'test') ev.aud = 'uid:' + user.uid;
      const targets = pickTargets(people, String(ev.aud || 'all'), ev.type === 'test' ? null : user.uid);
      const sent = await sendAll(env.PROJECT_ID, tok, targets, { title, body, tag: clip(ev.tag || ev.type, 60), url: './' });
      return json({ ok: true, sent }, 200, cors);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, e && e.status || 500, cors);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(overdueSweep(env));
  }
};

const clip = (v, n) => String(v || '').slice(0, n);
const json = (o, s, h) => new Response(JSON.stringify(o), { status: s, headers: { ...h, 'Content-Type': 'application/json' } });
const err = (m, s) => Object.assign(new Error(m), { status: s });

function pickTargets(people, aud, exclude) {
  let test;
  if (aud.startsWith('uid:')) { const id = aud.slice(4); test = (r, uid) => uid === id && (MEMBER.includes(r) || r === 'owner'); }
  else { const f = AUD[aud] || AUD.all; test = r => f(r); }
  const out = [];
  for (const [uid, p] of Object.entries(people)) {
    if (uid === exclude || !p.tokens.length || !test(p.role, uid)) continue;
    for (const t of p.tokens) out.push({ uid, token: t });
  }
  return out.slice(0, 44); // free plan allows about 50 outgoing calls per alert
}

// ---------- Firebase login check ----------
let jwks = null, jwksAt = 0;
async function verifyIdToken(token, projectId) {
  if (!token) throw err('sign in first', 401);
  const [h, p, s] = token.split('.');
  if (!s) throw err('bad token', 401);
  const head = JSON.parse(b64urlText(h)), pay = JSON.parse(b64urlText(p));
  const now = Math.floor(Date.now() / 1000);
  if (pay.aud !== projectId || pay.iss !== 'https://securetoken.google.com/' + projectId || !pay.sub || pay.exp < now - 60) throw err('expired', 401);
  if (!jwks || Date.now() - jwksAt > 3600e3) {
    const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
    jwks = (await r.json()).keys; jwksAt = Date.now();
  }
  const jwk = jwks.find(k => k.kid === head.kid);
  if (!jwk) throw err('unknown key', 401);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(h + '.' + p));
  if (!ok) throw err('bad signature', 401);
  return { uid: pay.sub };
}

// ---------- Google access token from the server key ----------
let cached = null;
async function accessToken(sa) {
  if (cached && cached.exp > Date.now() + 60e3) return cached.tok;
  const now = Math.floor(Date.now() / 1000);
  const enc = o => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = enc({ alg: 'RS256', typ: 'JWT' }) + '.' + enc({
    iss: sa.client_email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore'
  });
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + unsigned + '.' + b64url(new Uint8Array(sig))
  });
  const d = await r.json();
  if (!d.access_token) throw err('server key problem', 500);
  cached = { tok: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return cached.tok;
}

// ---------- Firestore reads ----------
const base = p => `https://firestore.googleapis.com/v1/projects/${p}/databases/(default)/documents`;
async function list(projectId, tok, coll) {
  const out = []; let page = '';
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`${base(projectId)}/${coll}?pageSize=300${page ? '&pageToken=' + page : ''}`, { headers: { Authorization: 'Bearer ' + tok } });
    const d = await r.json();
    (d.documents || []).forEach(x => out.push(x));
    if (!d.nextPageToken) break; page = d.nextPageToken;
  }
  return out;
}
const idOf = d => d.name.split('/').pop();
const str = (f, k) => f && f[k] && (f[k].stringValue ?? '');

async function loadPeople(projectId, tok) {
  const [users, tokens, owner] = await Promise.all([
    list(projectId, tok, 'users'),
    list(projectId, tok, 'tokens'),
    fetch(`${base(projectId)}/meta/owner`, { headers: { Authorization: 'Bearer ' + tok } }).then(r => r.json())
  ]);
  const ownerUid = str(owner.fields, 'uid');
  const people = {};
  users.forEach(d => { const id = idOf(d); people[id] = { role: id === ownerUid ? 'owner' : str(d.fields, 'role') || 'pending', tokens: [] }; });
  tokens.forEach(d => {
    const id = idOf(d), p = people[id]; if (!p) return;
    const arr = d.fields && d.fields.list && d.fields.list.arrayValue && d.fields.list.arrayValue.values || [];
    p.tokens = arr.map(v => v.stringValue).filter(Boolean).slice(-5);
  });
  return people;
}

// ---------- Sending ----------
async function sendAll(projectId, tok, targets, msg) {
  let sent = 0; const dead = {};
  await Promise.all(targets.map(async ({ uid, token }) => {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token, data: msg, webpush: { headers: { Urgency: 'high', TTL: '86400' } } } })
    });
    if (r.ok) sent++;
    else if (r.status === 404 || r.status === 400) (dead[uid] = dead[uid] || []).push(token);
  }));
  // Forget phones that no longer accept alerts
  for (const [uid, bad] of Object.entries(dead).slice(0, 3)) {
    try {
      const r = await fetch(`${base(projectId)}/tokens/${uid}`, { headers: { Authorization: 'Bearer ' + tok } });
      const d = await r.json();
      const keep = (d.fields && d.fields.list && d.fields.list.arrayValue.values || []).map(v => v.stringValue).filter(t => t && !bad.includes(t));
      await fetch(`${base(projectId)}/tokens/${uid}?updateMask.fieldPaths=list`, {
        method: 'PATCH', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { list: { arrayValue: { values: keep.map(t => ({ stringValue: t })) } } } })
      });
    } catch (e) {}
  }
  return sent;
}

// ---------- Daily overdue check ----------
async function overdueSweep(env) {
  const sa = JSON.parse(env.FIREBASE_SA);
  const tok = await accessToken(sa);
  const trucks = await list(env.PROJECT_ID, tok, 'trucks');
  const fmt = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const yesterday = fmt(new Date(Date.now() - 864e5));
  const late = trucks.filter(d => str(d.fields, 'due') === yesterday && str(d.fields, 'k') !== 'done');
  if (!late.length) return;
  const units = late.map(d => str(d.fields, 'unit') || '?');
  const people = await loadPeople(env.PROJECT_ID, tok);
  const targets = pickTargets(people, 'all', null);
  const title = late.length === 1 ? `${units[0]} is overdue` : `${late.length} trucks are overdue`;
  await sendAll(env.PROJECT_ID, tok, targets, { title, body: late.length === 1 ? 'It passed its due date yesterday.' : units.join(', ') + ' passed their due date yesterday.', tag: 'overdue-' + yesterday, url: './' });
}

// ---------- helpers ----------
function b64url(bytes) { let s = ''; bytes.forEach(b => s += String.fromCharCode(b)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlBytes(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
function b64urlText(s) { return new TextDecoder().decode(b64urlBytes(s)); }
