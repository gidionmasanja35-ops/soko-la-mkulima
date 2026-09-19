// ============================================================
// admin.js — Routes zote za Admin Dashboard
// Zinaitwa kutoka index.js: app.use(require('./admin')(pool))
// ============================================================

const express = require('express');

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = function (pool) {
  const router = express.Router();

  // ── AUTH MIDDLEWARE (inakagua siri kwa kila /admin/* na /ripoti/*) ──────────
  function adminAuth(req, res, next) {
    if (req.query.siri !== process.env.ADMIN_SECRET) {
      return res.status(403).send('Hairuhusiwi. Ongeza ?siri=SIRI_YAKO mwishoni mwa URL.');
    }
    next();
  }

  // ============================================================
  // GET /admin — Dashboard kuu
  // ============================================================
  router.get('/admin', adminAuth, async (req, res) => {
    try {
      const safeSiri = encodeURIComponent(req.query.siri);

      // ── Queries zote kwa wakati mmoja (parallel = haraka) ──────────────────
      const [
        beiResult, wakulimaResult, matangazoResult,
        requestsResult, buyerRequestsResult, wanunuziResult,
        mahitajiResult, mazaoAsilimiaResult, wikiResult,
        wakulimaMkoaResult, demandVsSupply, ratingsResult,
        keshoResult, hawajaThitibishwaResult, maombiMapyaResult,
        wakulimaMpyaResult, transactionsResult,
      ] = await Promise.all([
        pool.query('SELECT * FROM bei_mazao ORDER BY zao, mkoa'),
        pool.query('SELECT * FROM wakulima ORDER BY tarehe DESC'),
        pool.query('SELECT * FROM matangazo ORDER BY tarehe DESC'),
        pool.query('SELECT id, zao, idadi, buyer_phone, farmer_phone, status, tarehe FROM purchase_requests ORDER BY tarehe DESC LIMIT 50'),
        pool.query('SELECT id, zao, idadi, mkoa, phone_number as buyer_phone, COALESCE(status,\'pending\') as status, tarehe FROM buyer_requests ORDER BY tarehe DESC LIMIT 50'),
        pool.query('SELECT COUNT(*) FROM wanunuzi'),
        pool.query('SELECT zao, COUNT(*) as idadi FROM buyer_requests GROUP BY zao ORDER BY idadi DESC LIMIT 6'),
        pool.query('SELECT zao, COUNT(*) as idadi FROM matangazo GROUP BY zao ORDER BY idadi DESC LIMIT 6'),
        pool.query(`SELECT TO_CHAR(d.siku,'DY') AS siku, COUNT(m.id) AS idadi
          FROM generate_series(CURRENT_DATE-INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') d(siku)
          LEFT JOIN matangazo m ON DATE(m.tarehe)=d.siku
          GROUP BY d.siku ORDER BY d.siku`),
        pool.query('SELECT mkoa, COUNT(*) as idadi FROM wakulima GROUP BY mkoa ORDER BY idadi DESC LIMIT 8'),
        pool.query(`SELECT COALESCE(s.zao,d.zao) AS zao, COALESCE(s.supply,0) AS supply, COALESCE(d.demand,0) AS demand
          FROM (SELECT zao,SUM(CAST(REGEXP_REPLACE(idadi,'[^0-9]','','g') AS INTEGER)) AS supply FROM matangazo WHERE active=TRUE GROUP BY zao) s
          FULL OUTER JOIN (SELECT zao,SUM(CAST(REGEXP_REPLACE(idadi,'[^0-9]','','g') AS INTEGER)) AS demand FROM buyer_requests GROUP BY zao) d
          ON s.zao=d.zao ORDER BY supply DESC LIMIT 6`),
        pool.query('SELECT farmer_phone, ROUND(AVG(nyota),1) as wastani, COUNT(*) as idadi FROM ratings GROUP BY farmer_phone ORDER BY wastani DESC LIMIT 5'),
        pool.query(`SELECT COUNT(*) FROM matangazo WHERE expires_at BETWEEN NOW() AND NOW()+INTERVAL '1 day' AND active=TRUE`),
        pool.query('SELECT COUNT(*) FROM wakulima WHERE verified=FALSE'),
        pool.query("SELECT COUNT(*) FROM purchase_requests WHERE status='pending'"),
        pool.query("SELECT COUNT(*) FROM wakulima WHERE tarehe > NOW()-INTERVAL '24 hours'"),
        pool.query('SELECT * FROM transactions ORDER BY tarehe DESC LIMIT 20').catch(() => ({ rows: [] })),
      ]);

      const jumlaMatangazo = matangazoResult.rows.length;
      const rangi = ['#2E8B57','#E67E22','#3B82C4','#8B5FBF','#D7263D','#1B5E3F'];

      // ── Donut chart ──────────────────────────────────────────────────────────
      let kasoro = 0;
      const donutSegs = mazaoAsilimiaResult.rows.map((r, i) => {
        const pct = jumlaMatangazo ? (r.idadi / jumlaMatangazo) * 100 : 0;
        const start = kasoro; kasoro += pct;
        return { zao: r.zao, pct, start, end: kasoro, rangi: rangi[i % rangi.length] };
      });
      const donutGrad = donutSegs.length
        ? donutSegs.map(s => `${s.rangi} ${s.start}% ${s.end}%`).join(', ')
        : '#e5e7eb 0% 100%';
      const donutLegend = donutSegs.map(s =>
        `<div class="legend-item"><span class="dot" style="background:${s.rangi}"></span>${capitalize(s.zao)} <b>${Math.round(s.pct)}%</b></div>`
      ).join('') || "<div class='legend-item'>Hakuna data bado</div>";

      // ── Bar chart (mahitaji) ─────────────────────────────────────────────────
      const mahitajiMax = Math.max(1, ...mahitajiResult.rows.map(r => parseInt(r.idadi)));
      const mahitajiBars = mahitajiResult.rows.map((r, i) => {
        const w = Math.round((r.idadi / mahitajiMax) * 100);
        return `<div class="bar-row"><span class="bar-label">${capitalize(r.zao)}</span><div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${rangi[i%rangi.length]}"></div></div><span class="bar-value">${r.idadi}</span></div>`;
      }).join('') || "<p class='hakuna'>Hakuna maombi bado.</p>";

      // ── Line chart (wiki) ────────────────────────────────────────────────────
      const wikiN = wikiResult.rows.map(r => parseInt(r.idadi));
      const wikiMax = Math.max(1, ...wikiN);
      const W = 520, H = 160, pad = 30;
      const stepX = (W - pad*2) / ((wikiN.length - 1) || 1);
      const points = wikiN.map((v, i) => {
        const x = pad + i * stepX;
        const y = H - pad - (v / wikiMax) * (H - pad*2);
        return `${x},${y}`;
      }).join(' ');
      const dots = wikiN.map((v, i) => {
        const x = pad + i * stepX;
        const y = H - pad - (v / wikiMax) * (H - pad*2);
        return `<circle cx="${x}" cy="${y}" r="4" fill="#2E8B57"/>`;
      }).join('');
      const wikiLabels = wikiResult.rows.map(r => `<span>${r.siku.trim()}</span>`).join('');

      // ── Majedwali ─────────────────────────────────────────────────────────────
      const beiRows = beiResult.rows.map(r => `
        <tr>
          <td>${capitalize(r.zao)}</td>
          <td>${r.mkoa}</td>
          <td>TZS ${Number(r.bei).toLocaleString()}</td>
          <td>
            <form method="POST" action="/admin/futa?siri=${safeSiri}" style="display:inline">
              <input type="hidden" name="id" value="${r.id}">
              <button class="btn-futa" type="submit">Futa</button>
            </form>
          </td>
        </tr>`).join('') || "<tr><td colspan='4'>Hakuna bei bado.</td></tr>";

      const wakulimaRows = wakulimaResult.rows.map(w => `
        <tr>
          <td>${w.jina}</td><td>${w.mkoa}</td><td>${w.wilaya}</td>
          <td>${w.phone_number}</td>
          <td>${w.verified ? "<span class='badge badge-ok'>✓ Verified</span>" : "<span class='badge badge-pending'>Hajathibitishwa</span>"}</td>
          <td>${w.verified ? '' : `<form method="POST" action="/admin/thibitisha?siri=${safeSiri}" style="display:inline"><input type="hidden" name="id" value="${w.id}"><button class="btn-thibitisha" type="submit">Thibitisha</button></form>`}</td>
        </tr>`).join('') || "<tr><td colspan='6'>Hakuna mkulima bado.</td></tr>";

      const matangazoRows = matangazoResult.rows.slice(0, 10).map(m => `
        <tr>
          <td><span class="crop-dot"></span>${capitalize(m.zao)}</td>
          <td>${m.idadi}</td>
          <td>${m.bei ? 'TZS '+Number(m.bei).toLocaleString() : '-'}</td>
          <td>${m.phone_number}</td>
          <td><span class="badge ${m.status==='accepted'?'badge-ok':m.status==='rejected'?'badge-danger':'badge-pending'}">${m.status||'pending'}</span></td>
          <td>${new Date(m.tarehe).toLocaleDateString('sw-TZ')}</td>
        </tr>`).join('') || "<tr><td colspan='6'>Hakuna tangazo bado.</td></tr>";

      const requestsRows = requestsResult.rows.slice(0, 10).map(b => `
        <tr>
          <td>${capitalize(b.zao||'-')}</td><td>${b.idadi||'-'}</td>
          <td>${b.buyer_phone||'-'}</td><td>${b.farmer_phone||'-'}</td>
          <td>${new Date(b.tarehe).toLocaleDateString('sw-TZ')}</td>
          <td><span class="badge ${b.status==='accepted'?'badge-ok':b.status==='rejected'?'badge-danger':'badge-pending'}">${b.status||'pending'}</span></td>
        </tr>`).join('') || "<tr><td colspan='6'>Hakuna ombi bado.</td></tr>";

      const buyerReqRows = buyerRequestsResult.rows.slice(0, 10).map(b => `
        <tr>
          <td>${capitalize(b.zao||'-')}</td><td>${b.idadi||'-'}</td>
          <td>${b.mkoa||'-'}</td><td>${b.buyer_phone||'-'}</td>
          <td>${new Date(b.tarehe).toLocaleDateString('sw-TZ')}</td>
          <td><span class="badge ${b.status==='accepted'?'badge-ok':b.status==='rejected'?'badge-danger':'badge-pending'}">${b.status||'pending'}</span></td>
        </tr>`).join('') || "<tr><td colspan='6'>Hakuna maombi bado.</td></tr>";

      const txRows = transactionsResult.rows.map(t => `
        <tr>
          <td>${t.reference||'-'}</td><td>${t.buyer_phone||'-'}</td>
          <td>${t.farmer_phone||'-'}</td><td>${t.zao||'-'}</td>
          <td>TZS ${Number(t.amount).toLocaleString()}</td>
          <td>${t.method||'-'}</td>
          <td><span class="badge ${t.status==='completed'?'badge-ok':t.status==='failed'?'badge-danger':'badge-pending'}">${t.status||'pending'}</span></td>
          <td>${new Date(t.tarehe).toLocaleDateString('sw-TZ')}</td>
        </tr>`).join('') || "<tr><td colspan='8'>Hakuna muamala bado.</td></tr>";

      // ── Analytics: Wakulima kwa Mkoa ─────────────────────────────────────────
      const mkMax = Math.max(1, ...wakulimaMkoaResult.rows.map(r => parseInt(r.idadi)));
      const mkoaBars = wakulimaMkoaResult.rows.map((r, i) => {
        const w = Math.round((parseInt(r.idadi)/mkMax)*100);
        return `<div class="bar-row"><span class="bar-label" style="width:80px">${r.mkoa}</span><div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${rangi[i%rangi.length]}"></div></div><span class="bar-value">${r.idadi}</span></div>`;
      }).join('') || "<p class='hakuna'>Hakuna data.</p>";

      // ── Analytics: Demand vs Supply ───────────────────────────────────────────
      const dvsTbl = demandVsSupply.rows.map(r => {
        const s = parseInt(r.supply)||0, d = parseInt(r.demand)||0;
        const hali = s>d ? `<span style="color:#2E8B57">Ziada</span>` : s<d ? `<span style="color:#D7263D">Upungufu</span>` : `<span style="color:#6B7670">Sawa</span>`;
        return `<tr><td style="padding:8px;border-bottom:1px solid #E6EAE8">${capitalize(r.zao||'')}</td><td style="padding:8px;border-bottom:1px solid #E6EAE8;text-align:right;color:#2E8B57">${s}</td><td style="padding:8px;border-bottom:1px solid #E6EAE8;text-align:right;color:#E67E22">${d}</td><td style="padding:8px;border-bottom:1px solid #E6EAE8;text-align:right">${hali}</td></tr>`;
      }).join('') || "<tr><td colspan='4' style='padding:12px;color:#6B7670'>Hakuna data bado.</td></tr>";

      // ── Notifications ─────────────────────────────────────────────────────────
      const mpyaCount = parseInt(wakulimaMpyaResult.rows[0].count);
      const maombiCount = parseInt(maombiMapyaResult.rows[0].count);
      const keshoCount = parseInt(keshoResult.rows[0].count);
      const hawajaCount = parseInt(hawajaThitibishwaResult.rows[0].count);

      res.send(`<!DOCTYPE html>
<html lang="sw">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Soko la Mkulima — Dashibodi ya Admin</title>
<style>
  :root{--kijani-giza:#14432F;--kijani:#2E8B57;--kijani-mwanga:#E8F5EE;--bg:#F2F5F4;--kadi:#fff;--maandishi:#1F2A24;--maandishi-pili:#6B7670;--mpaka:#E6EAE8;--bluu:#3B82C4;--chungwa:#E67E22;--zambarau:#8B5FBF;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--maandishi);display:flex;min-height:100vh;}
  a{text-decoration:none;color:inherit;}
  /* SIDEBAR */
  .sidebar{width:240px;background:var(--kijani-giza);color:#fff;padding:24px 16px;flex-shrink:0;position:sticky;top:0;height:100vh;overflow-y:auto;}
  .brand{display:flex;align-items:center;gap:10px;padding:0 8px 24px;border-bottom:1px solid rgba(255,255,255,.12);margin-bottom:20px;}
  .brand h1{font-size:16px;line-height:1.2;}
  .brand p{font-size:11px;color:#A9C9B8;}
  .nav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;color:#CFE3D8;font-size:14px;margin-bottom:4px;cursor:pointer;}
  .nav-item.active,.nav-item:hover{background:var(--kijani);color:#fff;font-weight:600;}
  .sidebar-note{margin-top:30px;background:rgba(255,255,255,.07);border-radius:10px;padding:16px;font-size:12px;line-height:1.5;color:#CFE3D8;}
  /* MAIN */
  .main{flex:1;padding:28px 32px;max-width:1300px;overflow-x:hidden;}
  .topbar{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;}
  .topbar h2{font-size:24px;}
  .topbar p{margin-top:4px;color:var(--maandishi-pili);font-size:14px;}
  /* STATS */
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:24px;}
  .stat-card{background:var(--kadi);border-radius:14px;padding:18px 20px;box-shadow:0 1px 3px rgba(0,0,0,.05);border:1px solid var(--mpaka);}
  .stat-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;color:#fff;margin-bottom:10px;}
  .stat-card .num{font-size:26px;font-weight:700;}
  .stat-card .label{font-size:13px;color:var(--maandishi-pili);}
  /* PANELS */
  .panels{display:grid;grid-template-columns:1.1fr 1.1fr 1fr;gap:18px;margin-bottom:24px;}
  .panel{background:var(--kadi);border-radius:14px;padding:20px;border:1px solid var(--mpaka);}
  .panel h3{margin:0 0 14px;font-size:15px;}
  /* DONUT */
  .donut-wrap{display:flex;align-items:center;gap:18px;}
  .donut{width:130px;height:130px;border-radius:50%;flex-shrink:0;position:relative;}
  .donut::after{content:"";display:block;width:56px;height:56px;background:var(--kadi);border-radius:50%;position:absolute;top:37px;left:37px;}
  .legend-item{font-size:13px;display:flex;align-items:center;gap:8px;margin-bottom:8px;color:var(--maandishi-pili);}
  .legend-item b{color:var(--maandishi);margin-left:auto;}
  .dot{width:9px;height:9px;border-radius:50%;display:inline-block;}
  /* LINE CHART */
  .wiki-labels{display:flex;justify-content:space-between;font-size:11px;color:var(--maandishi-pili);margin-top:4px;padding:0 28px;}
  /* BAR CHART */
  .bar-row{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
  .bar-label{width:70px;font-size:13px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .bar-track{flex:1;background:var(--kijani-mwanga);border-radius:6px;height:10px;overflow:hidden;}
  .bar-fill{height:100%;border-radius:6px;}
  .bar-value{font-size:13px;color:var(--maandishi-pili);width:28px;text-align:right;}
  .hakuna{color:var(--maandishi-pili);font-size:13px;}
  /* TABLES */
  .table-section{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:24px;}
  table{width:100%;border-collapse:collapse;}
  th{text-align:left;font-size:12px;color:var(--maandishi-pili);font-weight:600;padding:8px 10px;border-bottom:1px solid var(--mpaka);}
  td{padding:10px;font-size:13px;border-bottom:1px solid var(--mpaka);}
  tr:hover td{background:#FAFCFB;}
  .crop-dot{width:8px;height:8px;border-radius:50%;background:var(--kijani);display:inline-block;margin-right:8px;}
  .badge{padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;}
  .badge-ok{background:#E1F5EC;color:#1B5E3F;}
  .badge-pending{background:#FDF2E1;color:#B5760C;}
  .badge-danger{background:#FDEDEC;color:#C0392B;}
  .btn-thibitisha{background:var(--kijani);color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;}
  .btn-futa{background:#FBE7E9;color:#C0392B;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;}
  /* FORMS */
  .form-panel{background:var(--kadi);border-radius:14px;padding:20px;border:1px solid var(--mpaka);margin-bottom:24px;}
  .form-panel h3{margin:0 0 14px;font-size:15px;}
  .form-panel form{display:flex;gap:10px;flex-wrap:wrap;}
  .form-panel input,.form-panel select{padding:9px 12px;border:1px solid var(--mpaka);border-radius:8px;font-size:13px;flex:1;min-width:130px;}
  .form-panel button{background:var(--kijani);color:#fff;border:none;padding:9px 18px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;}
  h2.section-title{font-size:18px;margin:30px 0 14px;}
  /* NOTIFICATIONS */
  .notif-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-bottom:24px;}
  .notif{display:flex;align-items:flex-start;gap:14px;padding:14px 16px;border-radius:10px;border:1px solid;}
  .notif-info{background:#EBF5FB;border-color:#AED6F1;}
  .notif-warning{background:#FEF9E7;border-color:#F9E79F;}
  .notif-danger{background:#FDEDEC;border-color:#F5B7B1;}
  .notif-success{background:#E8F5E9;border-color:#A5D6A7;}
  .notif-icon{font-size:22px;flex-shrink:0;}
  .notif-title{font-weight:700;font-size:14px;margin-bottom:3px;}
  .notif-msg{font-size:13px;color:#555;}
  /* ANALYTICS */
  .analytics-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-bottom:24px;}
  /* RIPOTI BUTTONS */
  .ripoti-btns{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px;}
  .btn-ripoti{display:inline-block;background:#14432F;color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;}
  .btn-excel{background:#217346;}
  .btn-ripoti:hover{opacity:.9;}
  @media(max-width:1000px){.stats{grid-template-columns:1fr 1fr;}.panels,.table-section,.analytics-grid{grid-template-columns:1fr;}.sidebar{display:none;}}
</style>
</head>
<body>

<aside class="sidebar">
  <div class="brand">
    <span style="font-size:26px">🌱</span>
    <div><h1>SOKO LA MKULIMA</h1><p>Admin Dashboard</p></div>
  </div>
  <div class="nav-item active">📊 Dashibodi</div>
  <div class="nav-item">👨‍🌾 Wakulima (${wakulimaResult.rows.length})</div>
  <div class="nav-item">🛒 Wanunuzi (${wanunuziResult.rows[0].count})</div>
  <div class="nav-item">📢 Matangazo (${jumlaMatangazo})</div>
  <div class="nav-item">💬 Maombi (${requestsResult.rows.length})</div>
  <div class="nav-item">💰 Bei za Mazao (${beiResult.rows.length})</div>
  <hr style="border:none;border-top:1px solid rgba(255,255,255,.12);margin:16px 0;">
  <a href="/ripoti/wakulima?siri=${safeSiri}" class="nav-item">📄 Ripoti: Wakulima</a>
  <a href="/ripoti/matangazo?siri=${safeSiri}" class="nav-item">📄 Ripoti: Matangazo</a>
  <a href="/ripoti/maombi?siri=${safeSiri}" class="nav-item">📄 Ripoti: Maombi</a>
  <div class="sidebar-note">Soko la Mkulima<br>Kuunganisha wakulima na wanunuzi kwa maendeleo ya kilimo Tanzania.</div>
</aside>

<main class="main">
  <div class="topbar">
    <div>
      <h2>📊 Dashibodi</h2>
      <p>Karibu, Admin — Soko la Mkulima Tanzania</p>
    </div>
    <div style="font-size:13px;color:var(--maandishi-pili)">${new Date().toLocaleDateString('sw-TZ',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
  </div>

  <!-- STAT CARDS -->
  <div class="stats">
    <div class="stat-card">
      <div class="stat-icon" style="background:var(--kijani)">👨‍🌾</div>
      <div class="num">${wakulimaResult.rows.length}</div>
      <div class="label">Wakulima Wote</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:var(--bluu)">📢</div>
      <div class="num">${jumlaMatangazo}</div>
      <div class="label">Matangazo</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:var(--chungwa)">🛒</div>
      <div class="num">${wanunuziResult.rows[0].count}</div>
      <div class="label">Wanunuzi</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:var(--zambarau)">💬</div>
      <div class="num">${requestsResult.rows.length}</div>
      <div class="label">Maombi ya Ununuzi</div>
    </div>
  </div>

  <!-- CHARTS -->
  <div class="panels">
    <div class="panel">
      <h3>🌾 Mazao Yanayouzwa Zaidi</h3>
      <div class="donut-wrap">
        <div class="donut" style="background:conic-gradient(${donutGrad})"></div>
        <div>${donutLegend}</div>
      </div>
    </div>
    <div class="panel">
      <h3>📈 Matangazo — Siku 7 Zilizopita</h3>
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="140">
        <polyline points="${points}" fill="none" stroke="#2E8B57" stroke-width="2.5"/>
        ${dots}
      </svg>
      <div class="wiki-labels">${wikiLabels}</div>
    </div>
    <div class="panel">
      <h3>🔥 Mahitaji Makubwa (Wanunuzi)</h3>
      ${mahitajiBars}
    </div>
  </div>

  <!-- ONGEZA BEI -->
  <div class="form-panel">
    <h3>➕ Ongeza Bei Mpya</h3>
    <form method="POST" action="/admin/ongeza?siri=${safeSiri}">
      <input name="zao" placeholder="Zao (mfano: mahindi)" required>
      <input name="mkoa" placeholder="Mkoa (mfano: Dodoma)" required>
      <input name="bei" placeholder="Bei kwa kilo (TZS)" type="number" required>
      <button type="submit">+ Ongeza Bei</button>
    </form>
  </div>

  <!-- NOTIFICATIONS -->
  <h2 class="section-title">🔔 Kituo cha Taarifa</h2>
  <div class="notif-grid">
    ${mpyaCount > 0 ? `<div class="notif notif-info"><span class="notif-icon">👨‍🌾</span><div><div class="notif-title">Wakulima Wapya (Saa 24)</div><div class="notif-msg">${mpyaCount} wakulima wapya wamejisajili</div></div></div>` : ''}
    ${maombiCount > 0 ? `<div class="notif notif-warning"><span class="notif-icon">💬</span><div><div class="notif-title">Maombi Yanayosubiri</div><div class="notif-msg">${maombiCount} maombi ya ununuzi bado hayajajibiwa</div></div></div>` : ''}
    ${keshoCount > 0 ? `<div class="notif notif-danger"><span class="notif-icon">⏰</span><div><div class="notif-title">Matangazo Yanayokwisha</div><div class="notif-msg">${keshoCount} matangazo yataisha ndani ya saa 24</div></div></div>` : ''}
    ${hawajaCount > 0 ? `<div class="notif notif-warning"><span class="notif-icon">✅</span><div><div class="notif-title">Uthibitisho Unahitajika</div><div class="notif-msg">${hawajaCount} wakulima hawajathibitishwa bado</div></div></div>` : ''}
    ${mpyaCount===0 && maombiCount===0 && keshoCount===0 && hawajaCount===0 ? `<div class="notif notif-success"><span class="notif-icon">✅</span><div><div class="notif-title">Kila kitu kiko sawa!</div><div class="notif-msg">Hakuna taarifa zinazohitaji umakini kwa sasa.</div></div></div>` : ''}
  </div>

  <!-- ANALYTICS -->
  <h2 class="section-title">📊 Uchambuzi wa Kina</h2>
  <div class="analytics-grid">
    <div class="panel">
      <h3>Wakulima kwa Mkoa</h3>
      ${mkoaBars}
    </div>
    <div class="panel">
      <h3>Demand vs Supply (Magunia)</h3>
      <table>
        <tr><th>Zao</th><th style="text-align:right;color:#2E8B57">Supply</th><th style="text-align:right;color:#E67E22">Demand</th><th style="text-align:right">Hali</th></tr>
        ${dvsTbl}
      </table>
    </div>
    <div class="panel">
      <h3>Wakulima Waliokadiriwa Zaidi</h3>
      ${ratingsResult.rows.length === 0 ? "<p class='hakuna'>Hakuna ukadiriaji bado.</p>" :
        ratingsResult.rows.map((r, i) => `
          <div class="bar-row" style="margin-bottom:14px">
            <span style="font-size:18px;margin-right:8px">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]||'•'}</span>
            <div style="flex:1"><div style="font-size:13px;font-weight:600">${r.farmer_phone}</div><div style="font-size:12px;color:#6B7670">${r.idadi} ukadiriaji</div></div>
            <span style="color:#F59E0B;font-weight:700">⭐ ${r.wastani}</span>
          </div>`).join('')}
    </div>
  </div>

  <!-- TABLES -->
  <div class="table-section">
    <div class="panel">
      <h3>📢 Matangazo ya Hivi Karibuni</h3>
      <table><tr><th>Zao</th><th>Magunia</th><th>Bei/Gunia</th><th>Simu</th><th>Hali</th><th>Tarehe</th></tr>${matangazoRows}</table>
    </div>
    <div class="panel">
      <h3>🤝 Maombi ya Ununuzi (Purchase Requests)</h3>
      <table><tr><th>Zao</th><th>Kiasi</th><th>Mnunuzi</th><th>Mkulima</th><th>Tarehe</th><th>Hali</th></tr>${requestsRows}</table>
    </div>
  </div>

  <h2 class="section-title">💬 Maombi ya Wanunuzi kwa Mkoa (Buyer Requests)</h2>
  <div class="panel">
    <table><tr><th>Zao</th><th>Kiasi</th><th>Mkoa</th><th>Simu ya Mnunuzi</th><th>Tarehe</th><th>Hali</th></tr>${buyerReqRows}</table>
  </div>

  <!-- TRANSACTIONS -->
  <h2 class="section-title">💰 Rekodi za Malipo</h2>
  <div class="form-panel">
    <h3>Ongeza Muamala Mpya</h3>
    <form method="POST" action="/admin/transaction?siri=${safeSiri}">
      <input name="reference" placeholder="Reference (MPESA-12345)" required>
      <input name="buyer_phone" placeholder="Simu ya Mnunuzi">
      <input name="farmer_phone" placeholder="Simu ya Mkulima">
      <input name="zao" placeholder="Zao">
      <input name="amount" placeholder="Kiasi (TZS)" type="number" required>
      <select name="method"><option>M-Pesa</option><option>Airtel Money</option><option>Tigo Pesa</option><option>Bank</option></select>
      <button type="submit">+ Rekodi</button>
    </form>
  </div>
  <div class="panel" style="margin-bottom:24px">
    <h3>Miamala ya Hivi Karibuni</h3>
    <div style="overflow-x:auto">
      <table><tr><th>Reference</th><th>Mnunuzi</th><th>Mkulima</th><th>Zao</th><th>Kiasi</th><th>Njia</th><th>Hali</th><th>Tarehe</th></tr>${txRows}</table>
    </div>
  </div>

  <!-- BEI TABLE -->
  <h2 class="section-title">📊 Bei za Mazao Zilizopo</h2>
  <div class="panel" style="margin-bottom:24px">
    <table><tr><th>Zao</th><th>Mkoa</th><th>Bei (TZS)</th><th></th></tr>${beiRows}</table>
  </div>

  <!-- WAKULIMA TABLE -->
  <h2 class="section-title">👨‍🌾 Wakulima Waliosajiliwa</h2>
  <div class="panel" style="margin-bottom:24px">
    <table><tr><th>Jina</th><th>Mkoa</th><th>Wilaya</th><th>Simu</th><th>Hali</th><th></th></tr>${wakulimaRows}</table>
  </div>

  <!-- RIPOTI -->
  <h2 class="section-title">📥 Pakua Ripoti</h2>
  <div class="ripoti-btns">
    <a href="/ripoti/wakulima?siri=${safeSiri}" class="btn-ripoti">📄 Ripoti ya Wakulima (PDF)</a>
    <a href="/ripoti/matangazo?siri=${safeSiri}" class="btn-ripoti">📄 Ripoti ya Matangazo (PDF)</a>
    <a href="/ripoti/maombi?siri=${safeSiri}" class="btn-ripoti">📄 Ripoti ya Maombi (PDF)</a>
    <a href="/ripoti/wakulima-excel?siri=${safeSiri}" class="btn-ripoti btn-excel">📊 Wakulima (Excel/CSV)</a>
    <a href="/ripoti/matangazo-excel?siri=${safeSiri}" class="btn-ripoti btn-excel">📊 Matangazo (Excel/CSV)</a>
  </div>

</main>
</body>
</html>`);

    } catch (err) {
      res.status(500).send('Tatizo la server: ' + err.message);
    }
  });

  // ============================================================
  // POST /admin/thibitisha — Thibitisha mkulima
  // ============================================================
  router.post('/admin/thibitisha', adminAuth, async (req, res) => {
    await pool.query('UPDATE wakulima SET verified=TRUE WHERE id=$1', [req.body.id]);
    res.redirect('/admin?siri=' + encodeURIComponent(req.query.siri));
  });

  // ============================================================
  // POST /admin/ongeza — Ongeza bei mpya
  // ============================================================
  router.post('/admin/ongeza', adminAuth, async (req, res) => {
    const { zao, mkoa, bei } = req.body;
    await pool.query(
      'INSERT INTO bei_mazao (zao, mkoa, bei) VALUES ($1, $2, $3)',
      [zao.toLowerCase().trim(), mkoa.trim(), bei]
    );
    res.redirect('/admin?siri=' + encodeURIComponent(req.query.siri));
  });

  // ============================================================
  // POST /admin/futa — Futa bei
  // ============================================================
  router.post('/admin/futa', adminAuth, async (req, res) => {
    await pool.query('DELETE FROM bei_mazao WHERE id=$1', [req.body.id]);
    res.redirect('/admin?siri=' + encodeURIComponent(req.query.siri));
  });

  // ============================================================
  // POST /admin/transaction — Ongeza muamala
  // ============================================================
  router.post('/admin/transaction', adminAuth, async (req, res) => {
    const { reference, buyer_phone, farmer_phone, zao, amount, method } = req.body;
    try {
      await pool.query(
        'INSERT INTO transactions (reference,buyer_phone,farmer_phone,zao,amount,method) VALUES ($1,$2,$3,$4,$5,$6)',
        [reference, buyer_phone||null, farmer_phone||null, zao||null, amount, method]
      );
      res.redirect('/admin?siri=' + encodeURIComponent(req.query.siri));
    } catch (err) {
      res.status(500).send('Tatizo: ' + err.message);
    }
  });

  // ============================================================
  // GET /api/admin/buyers — Vuta maombi yote ya wanunuzi (JSON)
  // (Ilikuwa ndani ya /ripoti route kwa bahati mbaya — sasa ipo sawa)
  // ============================================================
  router.get('/api/admin/buyers', adminAuth, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM buyer_requests ORDER BY id DESC');
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // PUT /api/admin/verify-buyer/:id — Sasisha hali ya mnunuzi
  // (Ilikuwa ndani ya /ripoti route kwa bahati mbaya — sasa ipo sawa)
  // ============================================================
  router.put('/api/admin/verify-buyer/:id', adminAuth, async (req, res) => {
    const { id } = req.params;
    const { verified } = req.body;
    try {
      await pool.query('UPDATE buyer_requests SET verified=$1 WHERE id=$2', [verified, id]);
      res.json({ message: `Hali ya mnunuzi imesasishwa kuwa ${verified}` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // GET /ripoti/:aina — Ripoti za HTML/PDF
  // ============================================================
  router.get('/ripoti/:aina', adminAuth, async (req, res) => {
    const aina = req.params.aina;
    // Kama ni excel, redirect kwa handler sahihi
    if (aina.endsWith('-excel')) {
      return res.redirect(`/ripoti-excel/${aina.replace('-excel','')}?siri=${req.query.siri}`);
    }

    let title = '', rows = [], headers = [];
    try {
      if (aina === 'wakulima') {
        title = 'Ripoti ya Wakulima';
        const r = await pool.query('SELECT jina,mkoa,wilaya,phone_number,verified,tarehe FROM wakulima ORDER BY tarehe DESC');
        headers = ['Jina','Mkoa','Wilaya','Simu','Hali','Tarehe'];
        rows = r.rows.map(w => [w.jina, w.mkoa, w.wilaya, w.phone_number, w.verified?'✓ Verified':'Hajathibitishwa', new Date(w.tarehe).toLocaleDateString('sw-TZ')]);
      } else if (aina === 'matangazo') {
        title = 'Ripoti ya Matangazo';
        const r = await pool.query('SELECT zao,idadi,bei,phone_number,status,tarehe FROM matangazo ORDER BY tarehe DESC');
        headers = ['Zao','Magunia','Bei/Gunia','Simu','Hali','Tarehe'];
        rows = r.rows.map(m => [capitalize(m.zao), m.idadi, m.bei?`TZS ${Number(m.bei).toLocaleString()}`:'-', m.phone_number, m.status||'-', new Date(m.tarehe).toLocaleDateString('sw-TZ')]);
      } else if (aina === 'maombi') {
        title = 'Ripoti ya Maombi ya Wanunuzi';
        const r = await pool.query('SELECT zao,idadi,mkoa,phone_number,status,tarehe FROM buyer_requests ORDER BY tarehe DESC');
        headers = ['Zao','Kiasi','Mkoa','Simu','Hali','Tarehe'];
        rows = r.rows.map(b => [capitalize(b.zao), b.idadi, b.mkoa, b.phone_number, b.status||'pending', new Date(b.tarehe).toLocaleDateString('sw-TZ')]);
      } else {
        return res.status(404).send('Ripoti hii haipatikani.');
      }

      const tarehe = new Date().toLocaleDateString('sw-TZ');
      const tableRows = rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');

      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
        <style>body{font-family:Arial,sans-serif;color:#1F2A24;padding:40px;}h1{color:#14432F;font-size:22px;}.meta{color:#6B7670;font-size:13px;margin-bottom:24px;}table{width:100%;border-collapse:collapse;font-size:13px;}th{background:#14432F;color:#fff;padding:10px 12px;text-align:left;}td{padding:8px 12px;border-bottom:1px solid #E6EAE8;}tr:nth-child(even) td{background:#F2F5F4;}.footer{margin-top:32px;color:#6B7670;font-size:12px;text-align:center;}@media print{.no-print{display:none}}</style>
        </head><body>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px"><span style="font-size:28px">🌱</span><div><h1 style="margin:0">${title}</h1><div class="meta">Soko la Mkulima Tanzania • Tarehe: ${tarehe} • Rekodi: ${rows.length}</div></div></div>
        <p class="no-print"><button onclick="window.print()" style="background:#14432F;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px">🖨️ Chapisha / Hifadhi PDF</button></p>
        <table><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr>${tableRows||"<tr><td colspan='6' style='text-align:center;color:#6B7670'>Hakuna data bado.</td></tr>"}</table>
        <div class="footer">Soko la Mkulima — Kuunganisha Wakulima na Wanunuzi Tanzania</div>
        </body></html>`);
    } catch (err) {
      res.status(500).send('Tatizo: ' + err.message);
    }
  });

  // ============================================================
  // GET /ripoti-excel/:aina — Ripoti za Excel/CSV
  // ============================================================
  router.get('/ripoti-excel/:aina', adminAuth, async (req, res) => {
    const aina = req.params.aina;
    let data = [], headers = [], filename = 'ripoti';
    try {
      if (aina === 'wakulima') {
        const r = await pool.query('SELECT jina,mkoa,wilaya,phone_number,verified,tarehe FROM wakulima ORDER BY tarehe DESC');
        headers = ['Jina','Mkoa','Wilaya','Simu','Amethibitishwa','Tarehe'];
        data = r.rows.map(w => [w.jina, w.mkoa, w.wilaya, w.phone_number, w.verified?'Ndiyo':'Hapana', new Date(w.tarehe).toLocaleDateString('sw-TZ')]);
        filename = 'wakulima';
      } else if (aina === 'matangazo') {
        const r = await pool.query('SELECT zao,idadi,bei,phone_number,active,tarehe FROM matangazo ORDER BY tarehe DESC');
        headers = ['Zao','Magunia','Bei/Gunia','Simu','Hai','Tarehe'];
        data = r.rows.map(m => [m.zao, m.idadi, m.bei||'', m.phone_number, m.active?'Ndiyo':'Hapana', new Date(m.tarehe).toLocaleDateString('sw-TZ')]);
        filename = 'matangazo';
      } else {
        return res.status(404).send('Ripoti hii haipatikani.');
      }
      const csv = [headers.join(','), ...data.map(row => row.map(v=>`"${v}"`).join(','))].join('\n');
      res.setHeader('Content-Type','text/csv; charset=utf-8');
      res.setHeader('Content-Disposition',`attachment; filename="${filename}-${new Date().toISOString().slice(0,10)}.csv"`);
      res.send('\uFEFF' + csv);
    } catch (err) {
      res.status(500).send('Tatizo: ' + err.message);
    }
  });

  // Backward compatibility: /ripoti/:aina-excel inaendelea kufanya kazi
  router.get('/ripoti/:aina-excel', adminAuth, async (req, res) => {
    res.redirect(`/ripoti-excel/${req.params['aina-excel']}?siri=${req.query.siri}`);
  });

  return router;
};
