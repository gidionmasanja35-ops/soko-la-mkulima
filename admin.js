// ============================================================
// admin.js — Admin Dashboard Kamili (Mobile Responsive + Floating Sidebar + Admin Notifications)
// Itumie: app.use(require('./admin')(pool))
// ============================================================
const express = require("express");

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const fmt = (n) => Number(n || 0).toLocaleString();
const dateStr = (d) => (d ? new Date(d).toLocaleDateString("sw-TZ") : "-");

module.exports = function (pool) {
  const router = express.Router();

  // Custom query function
  const q = async (sql, p = []) => {
    try {
      return await pool.query(sql, p);
    } catch (e) {
      console.error("Database Query Error:", e.message);
      return { rows: [] };
    }
  };

  function auth(req, res, next) {
    if (req.query.siri !== process.env.ADMIN_SECRET)
      return res.status(403).send("Hairuhusiwi.");
    next();
  }

  // ═══════════════════════════════════════════════════════════
  // SSE ENDPOINT (REAL-TIME UPDATES & NOTIFICATIONS)
  // ═══════════════════════════════════════════════════════════
  router.get("/admin/stream", auth, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let lastCheck = new Date();

    const intervalId = setInterval(async () => {
      try {
        const [mCheck, pCheck, bCheck, wCheck] = await Promise.all([
          q("SELECT MAX(tarehe) as last_date FROM matangazo"),
          q("SELECT MAX(tarehe) as last_date FROM purchase_requests"),
          q("SELECT MAX(tarehe) as last_date FROM buyer_requests"),
          q("SELECT MAX(tarehe) as last_date FROM wakulima"),
        ]);

        const latestDates = [
          mCheck.rows[0]?.last_date,
          pCheck.rows[0]?.last_date,
          bCheck.rows[0]?.last_date,
          wCheck.rows[0]?.last_date,
        ].filter(Boolean);

        const hasUpdate = latestDates.some(
          (d) => new Date(d) > lastCheck
        );

        if (hasUpdate) {
          lastCheck = new Date();
          res.write(`data: ${JSON.stringify({ reload: true, msg: "Kuna mabadiliko au taarifa mpya kwenye mfumo!" })}\n\n`);
        }
      } catch (err) {
        console.error("SSE Error:", err.message);
      }
    }, 5000); // Angalia kila baada ya sekunde 5

    req.on("close", () => {
      clearInterval(intervalId);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // POST ROUTES (Actions)
  // ═══════════════════════════════════════════════════════════

  router.post("/admin/thibitisha", auth, async (req, res) => {
    await q("UPDATE wakulima SET verified=TRUE WHERE id=$1", [req.body.id]);
    res.redirect(`/admin?siri=${encodeURIComponent(req.query.siri)}&sec=wakulima&ok=Mkulima+amethibitishwa`);
  });

  router.post("/admin/ghairi-thibitisha", auth, async (req, res) => {
    await q("UPDATE wakulima SET verified=FALSE WHERE id=$1", [req.body.id]);
    res.redirect(`/admin?siri=${encodeURIComponent(req.query.siri)}&sec=wakulima&ok=Uthibitisho+umeghairiwa`);
  });

  router.post("/admin/thibitisha-mnunuzi", auth, async (req, res) => {
    await q("ALTER TABLE wanunuzi ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE");
    await q("UPDATE wanunuzi SET verified=TRUE WHERE id=$1", [req.body.id]);
    res.redirect(`/admin?siri=${encodeURIComponent(req.query.siri)}&sec=wanunuzi&ok=Mnunuzi+amethibitishwa`);
  });

  router.post("/admin/sasisha-tangazo", auth, async (req, res) => {
    const { id, hali } = req.body;
    const active = hali === "accepted";
    await q("UPDATE matangazo SET status=$1, active=$2 WHERE id=$3", [hali, active, id]);
    res.redirect(`/admin?siri=${encodeURIComponent(req.query.siri)}&sec=matangazo&ok=Tangazo+limesasishwa`);
  });

  router.post("/admin/futa-tangazo", auth, async (req, res) => {
    await q("DELETE FROM matangazo WHERE id=$1", [req.body.id]);
    res.redirect(`/admin?siri=${encodeURIComponent(req.query.siri)}&sec=matangazo&ok=Tangazo+limefutwa`);
  });

  router.post("/admin/sasisha-ombi", auth, async (req, res) => {
    await q("UPDATE purchase_requests SET status=$1 WHERE id=$2", [req.body.hali, req.body.id]);
    res.redirect(`/admin?siri=${encodeURIComponent(req.query.siri)}&sec=maombi-ununuzi&ok=Ombi+limesasishwa`);
  });

  router.post("/admin/sasisha-buyer-ombi", auth, async (req, res) => {
    await q("UPDATE buyer_requests SET status=$1 WHERE id=$2", [req.body.hali, req.body.id]);
    res.redirect(`/admin?siri=${encodeURIComponent(req.query.siri)}&sec=maombi-wanunuzi&ok=Ombi+limesasishwa`);
  });

  router.post("/admin/ongeza", auth, async (req, res) => {
    const { zao, mkoa, bei } = req.body;
    await q("INSERT INTO bei_mazao (zao,mkoa,bei) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [zao.toLowerCase().trim(), mkoa.trim(), bei]);
    res.redirect(`/admin?siri=${encodeURIComponent(req.query.siri)}&sec=bei&ok=Bei+imeongezwa`);
  });

  router.post("/admin/futa", auth, async (req, res) => {
    await q("DELETE FROM bei_mazao WHERE id=$1", [req.body.id]);
    res.redirect(`/admin?siri=${encodeURIComponent(req.query.siri)}&sec=bei&ok=Bei+imefutwa`);
  });

  router.post("/admin/transaction", auth, async (req, res) => {
    const { reference, buyer_phone, farmer_phone, zao, amount, method } = req.body;
    await q("INSERT INTO transactions (reference,buyer_phone,farmer_phone,zao,amount,method) VALUES ($1,$2,$3,$4,$5,$6)", [reference, buyer_phone || null, farmer_phone || null, zao || null, amount, method]);
    res.redirect(`/admin?siri=${encodeURIComponent(req.query.siri)}&sec=miamala&ok=Muamala+umerekodiwa`);
  });

  router.get("/api/admin/buyers", auth, async (req, res) => {
    const r = await q("SELECT * FROM buyer_requests ORDER BY id DESC");
    res.json(r.rows);
  });

  // ═══════════════════════════════════════════════════════════
  // GET /admin — Dashboard kuu
  // ═══════════════════════════════════════════════════════════
  router.get("/admin", auth, async (req, res) => {
    const S = encodeURIComponent(req.query.siri);
    const okMsg = req.query.ok ? decodeURIComponent(req.query.ok) : "";
    const activeSec = req.query.sec || "dashibodi";

    const [
      beiR, wakulimaR, matangazoR, purchaseR, buyerReqR, wanunuziR,
      mahitajiR, mazaoR, wikiR, mkoaR, ratingsR,
      pendingPurchase, pendingBuyer, hawajaThibitiwa, wapyaWakulima, txR
    ] = await Promise.all([
      q("SELECT * FROM bei_mazao ORDER BY zao,mkoa"),
      q("SELECT * FROM wakulima ORDER BY tarehe DESC"),
      q("SELECT * FROM matangazo ORDER BY tarehe DESC LIMIT 100"),
      q("SELECT * FROM purchase_requests ORDER BY tarehe DESC LIMIT 100"),
      q("SELECT * FROM buyer_requests ORDER BY tarehe DESC LIMIT 100"),
      q("SELECT * FROM wanunuzi ORDER BY tarehe DESC LIMIT 100"),
      q("SELECT zao,COUNT(*) as n FROM buyer_requests GROUP BY zao ORDER BY n DESC LIMIT 6"),
      q("SELECT zao,COUNT(*) as n FROM matangazo GROUP BY zao ORDER BY n DESC LIMIT 6"),
      q(`SELECT TO_CHAR(d.siku,'DD/MM') AS lbl, COUNT(m.id) AS n FROM generate_series(CURRENT_DATE-6,CURRENT_DATE,INTERVAL '1 day') d(siku) LEFT JOIN matangazo m ON DATE(m.tarehe)=d.siku GROUP BY d.siku,lbl ORDER BY d.siku`),
      q("SELECT mkoa,COUNT(*) as n FROM wakulima GROUP BY mkoa ORDER BY n DESC LIMIT 8"),
      q("SELECT farmer_phone,ROUND(AVG(nyota),1) w,COUNT(*) n FROM ratings GROUP BY farmer_phone ORDER BY w DESC LIMIT 5"),
      q("SELECT COUNT(*) n FROM purchase_requests WHERE status='pending'"),
      q("SELECT COUNT(*) n FROM buyer_requests WHERE status='pending'"),
      q("SELECT COUNT(*) n FROM wakulima WHERE verified=FALSE"),
      q("SELECT COUNT(*) n FROM wakulima WHERE tarehe>NOW()-INTERVAL '24 hours'"),
      q("SELECT * FROM transactions ORDER BY tarehe DESC LIMIT 30"),
    ]);

    const statWakulima = wakulimaR.rows.length;
    const statMatangazo = matangazoR.rows.length;
    const statWanunuzi = wanunuziR.rows.length;
    const statBuyerReq = buyerReqR.rows.length;
    const pPurchase = parseInt(pendingPurchase.rows[0]?.n || 0);
    const pBuyer = parseInt(pendingBuyer.rows[0]?.n || 0);
    const pHawaja = parseInt(hawajaThibitiwa.rows[0]?.n || 0);
    const pWapya = parseInt(wapyaWakulima.rows[0]?.n || 0);

    const rangi = ["#2E8B57", "#E67E22", "#3B82C4", "#8B5FBF", "#D7263D", "#1B5E3F", "#F59E0B", "#06B6D4"];
    const mkMax = Math.max(1, ...mkoaR.rows.map((r) => parseInt(r.n)));
    const mahMax = Math.max(1, ...mahitajiR.rows.map((r) => parseInt(r.n)));

    const badge = (s) => {
      if (s === "accepted" || s === "active") return `<span class="badge b-ok">✓ ${cap(s)}</span>`;
      if (s === "rejected") return `<span class="badge b-red">✗ ${cap(s)}</span>`;
      return `<span class="badge b-warn">⏳ Pending</span>`;
    };

    const actionBtns = (id, hali, route) => `
      <div class="action-row">
        ${hali !== "accepted" ? `<form method="POST" action="/${route}?siri=${S}"><input type="hidden" name="id" value="${id}"><input type="hidden" name="hali" value="accepted"><button class="btn-sm b-ok" type="submit">✓ Kubali</button></form>` : ""}
        ${hali !== "rejected" ? `<form method="POST" action="/${route}?siri=${S}"><input type="hidden" name="id" value="${id}"><input type="hidden" name="hali" value="rejected"><button class="btn-sm b-red" type="submit">✗ Kataa</button></form>` : ""}
        ${hali !== "pending" ? `<form method="POST" action="/${route}?siri=${S}"><input type="hidden" name="id" value="${id}"><input type="hidden" name="hali" value="pending"><button class="btn-sm b-warn" type="submit">⏳ Pending</button></form>` : ""}
      </div>`;

    const wakulimaRows = wakulimaR.rows.map((w) => `
      <tr>
        <td><strong>${w.jina}</strong></td>
        <td>${w.mkoa}</td><td>${w.wilaya || "-"}</td><td>${w.phone_number}</td>
        <td>${badge(w.verified ? "accepted" : "pending")}</td>
        <td>${dateStr(w.tarehe)}</td>
        <td>
          <div class="action-row">
            ${!w.verified ? `<form method="POST" action="/admin/thibitisha?siri=${S}"><input type="hidden" name="id" value="${w.id}"><button class="btn-sm b-ok" type="submit">✓ Thibitisha</button></form>` : ""}
            ${w.verified ? `<form method="POST" action="/admin/ghairi-thibitisha?siri=${S}"><input type="hidden" name="id" value="${w.id}"><button class="btn-sm b-warn" type="submit">↩ Ghairi</button></form>` : ""}
          </div>
        </td>
      </tr>`).join("");

    const wanunuziRows = wanunuziR.rows.map((w) => `
      <tr>
        <td><strong>${w.jina || "-"}</strong></td>
        <td>${w.mkoa || "-"}</td><td>${w.phone_number || w.simu || "-"}</td>
        <td>${badge(w.verified ? "accepted" : "pending")}</td>
        <td>${dateStr(w.tarehe)}</td>
        <td>
          ${!w.verified ? `<form method="POST" action="/admin/thibitisha-mnunuzi?siri=${S}"><input type="hidden" name="id" value="${w.id}"><button class="btn-sm b-ok" type="submit">✓ Thibitisha</button></form>` : '<span style="color:#2E8B57;font-size:12px">✓ Amethibitishwa</span>'}
        </td>
      </tr>`).join("") || '<tr><td colspan="6" class="empty-row">Hakuna wanunuzi bado.</td></tr>';

    const matangazoRows = matangazoR.rows.map((m) => `
      <tr>
        <td><strong>${cap(m.zao)}</strong></td>
        <td>${m.idadi}</td>
        <td>${m.bei ? "TZS " + fmt(m.bei) : "-"}</td>
        <td>${m.phone_number}</td>
        <td>${m.mkoa || "-"}</td>
        <td>${badge(m.status || "pending")}</td>
        <td>${dateStr(m.tarehe)}</td>
        <td>
          <div class="action-row">
            ${m.status !== "accepted" ? `<form method="POST" action="/admin/sasisha-tangazo?siri=${S}"><input type="hidden" name="id" value="${m.id}"><input type="hidden" name="hali" value="accepted"><button class="btn-sm b-ok" type="submit">✓</button></form>` : ""}
            ${m.status !== "rejected" ? `<form method="POST" action="/admin/sasisha-tangazo?siri=${S}"><input type="hidden" name="id" value="${m.id}"><input type="hidden" name="hali" value="rejected"><button class="btn-sm b-red" type="submit">✗</button></form>` : ""}
            <form method="POST" action="/admin/futa-tangazo?siri=${S}" onsubmit="return confirm('Futa?')"><input type="hidden" name="id" value="${m.id}"><button class="btn-sm b-gray" type="submit">🗑</button></form>
          </div>
        </td>
      </tr>`).join("") || '<tr><td colspan="8" class="empty-row">Hakuna matangazo bado.</td></tr>';

    const purchaseRows = purchaseR.rows.map((b) => `
      <tr>
        <td><strong>${cap(b.zao || "-")}</strong></td>
        <td>${b.idadi || "-"}</td>
        <td>${b.buyer_phone || "-"}</td>
        <td>${b.farmer_phone || "-"}</td>
        <td>${badge(b.status || "pending")}</td>
        <td>${dateStr(b.tarehe)}</td>
        <td>${actionBtns(b.id, b.status || "pending", "admin/sasisha-ombi")}</td>
      </tr>`).join("") || '<tr><td colspan="7" class="empty-row">Hakuna maombi bado.</td></tr>';

    const buyerReqRows = buyerReqR.rows.map((b) => `
      <tr>
        <td><strong>${cap(b.zao || "-")}</strong></td>
        <td>${b.idadi || "-"}</td>
        <td>${b.mkoa || "-"}</td>
        <td>${b.phone_number || b.buyer_phone || "-"}</td>
        <td>${badge(b.status || "pending")}</td>
        <td>${dateStr(b.tarehe)}</td>
        <td>${actionBtns(b.id, b.status || "pending", "admin/sasisha-buyer-ombi")}</td>
      </tr>`).join("") || '<tr><td colspan="7" class="empty-row">Hakuna maombi bado.</td></tr>';

    const beiRows = beiR.rows.map((r) => `
      <tr>
        <td><strong>${cap(r.zao)}</strong></td>
        <td>${r.mkoa}</td>
        <td>TZS ${fmt(r.bei)}</td>
        <td><form method="POST" action="/admin/futa?siri=${S}" onsubmit="return confirm('Futa?')"><input type="hidden" name="id" value="${r.id}"><button class="btn-sm b-red" type="submit">🗑 Futa</button></form></td>
      </tr>`).join("") || '<tr><td colspan="4" class="empty-row">Hakuna bei bado.</td></tr>';

    const txRows = txR.rows.map((t) => `
      <tr>
        <td><code>${t.reference || "-"}</code></td>
        <td>${t.buyer_phone || "-"}</td>
        <td>${t.farmer_phone || "-"}</td>
        <td>${cap(t.zao || "-")}</td>
        <td><strong>TZS ${fmt(t.amount)}</strong></td>
        <td>${t.method || "-"}</td>
        <td>${badge(t.status || "pending")}</td>
        <td>${dateStr(t.tarehe)}</td>
      </tr>`).join("") || '<tr><td colspan="8" class="empty-row">Hakuna miamala bado.</td></tr>';

    const mkoaBars = mkoaR.rows.map((r, i) => {
      const w = Math.round((parseInt(r.n) / mkMax) * 100);
      return `<div class="bar-row"><span class="bar-lbl">${r.mkoa}</span><div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${rangi[i % rangi.length]}"></div></div><span class="bar-val">${r.n}</span></div>`;
    }).join("") || "<p class='muted'>Hakuna data.</p>";

    const mahitajiBars = mahitajiR.rows.map((r, i) => {
      const w = Math.round((parseInt(r.n) / mahMax) * 100);
      return `<div class="bar-row"><span class="bar-lbl">${cap(r.zao)}</span><div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${rangi[i % rangi.length]}"></div></div><span class="bar-val">${r.n}</span></div>`;
    }).join("") || "<p class='muted'>Hakuna maombi.</p>";

    const wikiN = wikiR.rows.map((r) => parseInt(r.n) || 0);
    const wikiMax = Math.max(1, ...wikiN);
    const W = 480, H = 140, pad = 30, step = (W - pad * 2) / (wikiN.length - 1 || 1);
    const pts = wikiN.map((v, i) => `${pad + i * step},${H - pad - (v / wikiMax) * (H - pad * 2)}`).join(" ");
    const dots = wikiN.map((v, i) => `<circle cx="${pad + i * step}" cy="${H - pad - (v / wikiMax) * (H - pad * 2)}" r="4" fill="#2E8B57" stroke="#fff" stroke-width="1.5"/>`).join("");
    const wikiLbls = wikiR.rows.map((r) => `<span>${r.lbl}</span>`).join("");

    res.send(`<!DOCTYPE html>
<html lang="sw">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin — Soko la Mkulima</title>
<style>
:root{
  --bg:#F0F4F2;--kadi:#fff;--kijani:#2E8B57;--kijani-giza:#0D2118;
  --kijani-mwanga:#E8F5EE;--mpaka:#E2EAE5;--txt:#1A2620;--muted:#6B7670;
  --red:#DC2626;--yellow:#D97706;--blue:#2563EB;
  --sidebar:260px;--radius:14px;
}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--txt);display:flex;height:100vh;overflow:hidden;}
a{text-decoration:none;color:inherit;}

/* ── SIDEBAR OVERLAY FOR MOBILE ── */
.sidebar-overlay {
  display: none;
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 99;
  backdrop-filter: blur(2px);
}
.sidebar-overlay.active { display: block; }

/* ── SIDEBAR ── */
.sidebar{
  width:var(--sidebar);background:var(--kijani-giza);color:#fff;
  display:flex;flex-direction:column;height:100vh;overflow-y:auto;
  transition:transform .3s ease, width .3s ease;flex-shrink:0;position:relative;z-index:100;
}
.sidebar::-webkit-scrollbar{width:4px;}
.sidebar::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:2px;}
.brand{padding:20px 18px 16px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between;gap:10px;}
.brand-main{display:flex;align-items:center;gap:10px;}
.brand-icon{font-size:28px;flex-shrink:0;}
.brand-text h1{font-size:15px;font-weight:700;letter-spacing:.3px;}
.brand-text p{font-size:11px;color:#7BBFA0;margin-top:2px;}
.close-sidebar-btn{display:none;background:none;border:none;color:#fff;font-size:22px;cursor:pointer;}

.nav-group{padding:12px 10px 6px;font-size:10px;font-weight:700;color:#4A7A60;letter-spacing:1px;text-transform:uppercase;}
.nav-item{
  display:flex;align-items:center;gap:10px;
  padding:10px 14px;border-radius:10px;margin:2px 8px;
  cursor:pointer;color:#B0CFC0;font-size:13.5px;font-weight:500;
  transition:all .2s ease;position:relative;
}
.nav-item:hover{background:rgba(255,255,255,.07);color:#fff;transform:translateX(3px);}
.nav-item.active{background:var(--kijani);color:#fff;font-weight:700;box-shadow:0 4px 14px rgba(46,139,87,.4);}
.nav-item.active::before{content:'';position:absolute;left:0;top:20%;bottom:20%;width:3px;background:#6FCFA0;border-radius:0 3px 3px 0;left:-8px;}
.nav-icon{font-size:17px;width:22px;text-align:center;flex-shrink:0;}
.nav-badge{margin-left:auto;background:var(--red);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;min-width:20px;text-align:center;}
.nav-badge.warn{background:var(--yellow);}
.sidebar-footer{margin-top:auto;padding:14px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:#4A7A60;}

/* ── MAIN ── */
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;width:100%;}
.topbar{background:var(--kadi);border-bottom:1px solid var(--mpaka);padding:0 20px;height:60px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
.topbar-left{display:flex;align-items:center;gap:12px;}
.menu-btn{display:none;background:none;border:none;font-size:24px;cursor:pointer;color:var(--txt);padding:4px;}
.topbar-left h2{font-size:17px;font-weight:700;}
.topbar-left p{font-size:12px;color:var(--muted);}
.content{flex:1;overflow-y:auto;padding:20px;}
.content::-webkit-scrollbar{width:6px;}
.content::-webkit-scrollbar-thumb{background:var(--mpaka);border-radius:3px;}

/* ── TOAST ── */
.toast{position:fixed;top:20px;right:20px;background:#2E8B57;color:#fff;padding:12px 20px;border-radius:10px;font-size:14px;z-index:999;opacity:0;transform:translateY(-10px);transition:all .3s ease;box-shadow:0 4px 20px rgba(0,0,0,.15);}
.toast.show{opacity:1;transform:translateY(0);}

/* ── SECTIONS ── */
.sehemu{display:none;animation:fadeUp .3s ease;}
.sehemu.active{display:block;}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}

/* ── STATS ── */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:16px;margin-bottom:22px;}
.stat-card{background:var(--kadi);border-radius:var(--radius);padding:18px 20px;border:1px solid var(--mpaka);}
.stat-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;margin-bottom:10px;}
.stat-num{font-size:28px;font-weight:800;line-height:1;}
.stat-lbl{font-size:12px;color:var(--muted);margin-top:4px;}
.stat-delta{font-size:11px;color:var(--kijani);margin-top:5px;font-weight:600;}

/* ── CHARTS ── */
.charts-row{display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:16px;margin-bottom:22px;}
.chart-card{background:var(--kadi);border-radius:var(--radius);padding:18px;border:1px solid var(--mpaka);}
.chart-card h3{font-size:14px;font-weight:700;margin-bottom:14px;color:var(--txt);}
.bar-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;}
.bar-lbl{width:72px;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;}
.bar-track{flex:1;height:9px;background:var(--kijani-mwanga);border-radius:5px;overflow:hidden;}
.bar-fill{height:100%;border-radius:5px;transition:width .6s ease;}
.bar-val{font-size:12px;color:var(--muted);width:24px;text-align:right;}
.wiki-lbl{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);padding:4px 28px 0;}
.muted{font-size:13px;color:var(--muted);}

/* ── ALERTS ── */
.alerts-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:22px;}
.alert-card{display:flex;align-items:center;gap:12px;padding:13px 14px;border-radius:10px;border:1px solid;font-size:13px;}
.alert-info{background:#EBF5FB;border-color:#AED6F1;}
.alert-warn{background:#FEF9E7;border-color:#F9E79F;}
.alert-red{background:#FDF2F2;border-color:#F5C6C6;}
.alert-ok{background:#E8F5EE;border-color:#A5D6A7;}
.alert-icon{font-size:22px;}
.alert-title{font-weight:700;font-size:13px;}
.alert-msg{font-size:12px;color:#555;margin-top:2px;}

/* ── TABLES ── */
.tbl-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;}
.tbl-header h3{font-size:15px;font-weight:700;}
.panel{background:var(--kadi);border-radius:var(--radius);border:1px solid var(--mpaka);overflow:hidden;margin-bottom:20px;}
.panel-hd{padding:16px 18px;border-bottom:1px solid var(--mpaka);font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:space-between;}
table{width:100%;border-collapse:collapse;font-size:13px;white-space:nowrap;}
th{text-align:left;font-size:11.5px;color:var(--muted);font-weight:600;padding:10px 14px;background:var(--bg);border-bottom:1px solid var(--mpaka);}
td{padding:10px 14px;border-bottom:1px solid var(--mpaka);}
tr:hover td{background:#FAFCFB;}
tr:last-child td{border-bottom:none;}
.empty-row{text-align:center;color:var(--muted);padding:28px!important;}
code{font-size:11px;background:var(--bg);padding:2px 6px;border-radius:4px;}

/* ── BADGES & BUTTONS ── */
.badge{padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;}
.b-ok{background:#DCFCE7;color:#166534;}
.b-red{background:#FEE2E2;color:#991B1B;}
.b-warn{background:#FEF3C7;color:#92400E;}
.b-gray{background:var(--bg);color:var(--muted);}
.btn-sm{border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:700;transition:opacity .15s;}
.btn-sm:hover{opacity:.82;}
.btn-sm.b-ok{background:#DCFCE7;color:#166534;}
.btn-sm.b-red{background:#FEE2E2;color:#991B1B;}
.btn-sm.b-warn{background:#FEF3C7;color:#92400E;}
.btn-sm.b-gray{background:var(--bg);color:var(--muted);border:1px solid var(--mpaka);}
.action-row{display:flex;gap:6px;flex-wrap:wrap;}

/* ── FORMS ── */
.form-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;padding:16px 18px;}
.form-grid input,.form-grid select{padding:9px 12px;border:1px solid var(--mpaka);border-radius:8px;font-size:13px;background:#fff;}
.form-grid input:focus,.form-grid select:focus{outline:none;border-color:var(--kijani);}
.btn-main{background:var(--kijani);color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:13.5px;font-weight:700;transition:all .2s;}
.btn-main:hover{background:#256A43;}

/* ── RIPOTI ── */
.ripoti-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;}
.ripoti-card{background:var(--kadi);border:1px solid var(--mpaka);border-radius:var(--radius);padding:20px;display:flex;flex-direction:column;gap:10px;}
.ripoti-card h4{font-size:14px;font-weight:700;}
.ripoti-card p{font-size:12px;color:var(--muted);}
.btn-ripoti{display:inline-block;padding:9px 16px;border-radius:8px;font-size:12.5px;font-weight:700;text-align:center;}
.btn-pdf{background:var(--kijani-giza);color:#fff;}
.btn-csv{background:#166534;color:#fff;}

/* ── RESPONSIVE DESIGN (SIMU / TABLET) ── */
@media(max-width: 850px){
  .menu-btn { display: block; }
  .close-sidebar-btn { display: block; }
  .sidebar {
    position: fixed;
    top: 0; left: 0; bottom: 0;
    z-index: 100;
    transform: translateX(-100%);
    box-shadow: 4px 0 20px rgba(0,0,0,0.2);
  }
  .sidebar.open {
    transform: translateX(0);
  }
  .topbar-badge { display: none; }
}
</style>
</head>
<body>

<div class="sidebar-overlay" id="sidebarOverlay" onclick="toggleSidebar(false)"></div>

<!-- SIDEBAR -->
<aside class="sidebar" id="sidebar">
  <div class="brand">
    <div class="brand-main">
      <div class="brand-icon">🌱</div>
      <div class="brand-text">
        <h1>Soko la Mkulima</h1>
        <p>Admin Dashboard</p>
      </div>
    </div>
    <button class="close-sidebar-btn" onclick="toggleSidebar(false)">✕</button>
  </div>

  <div class="nav-group">Muhtasari</div>
  <div class="nav-item ${activeSec === "dashibodi" ? "active" : ""}" onclick="onyesha('dashibodi')">
    <span class="nav-icon">📊</span> <span>Dashibodi</span>
  </div>

  <div class="nav-group">Watu</div>
  <div class="nav-item ${activeSec === "wakulima" ? "active" : ""}" onclick="onyesha('wakulima')">
    <span class="nav-icon">👨‍🌾</span> <span>Wakulima</span>
    ${pHawaja > 0 ? `<span class="nav-badge warn">${pHawaja}</span>` : ""}
  </div>
  <div class="nav-item ${activeSec === "wanunuzi" ? "active" : ""}" onclick="onyesha('wanunuzi')">
    <span class="nav-icon">🛒</span> <span>Wanunuzi</span>
  </div>

  <div class="nav-group">Soko</div>
  <div class="nav-item ${activeSec === "matangazo" ? "active" : ""}" onclick="onyesha('matangazo')">
    <span class="nav-icon">📢</span> <span>Matangazo</span>
  </div>
  <div class="nav-item ${activeSec === "maombi-ununuzi" ? "active" : ""}" onclick="onyesha('maombi-ununuzi')">
    <span class="nav-icon">🤝</span> <span>Maombi (Ununuzi)</span>
    ${pPurchase > 0 ? `<span class="nav-badge">${pPurchase}</span>` : ""}
  </div>
  <div class="nav-item ${activeSec === "maombi-wanunuzi" ? "active" : ""}" onclick="onyesha('maombi-wanunuzi')">
    <span class="nav-icon">💬</span> <span>Maombi (Wanunuzi)</span>
    ${pBuyer > 0 ? `<span class="nav-badge">${pBuyer}</span>` : ""}
  </div>

  <div class="nav-group">Fedha & Bei</div>
  <div class="nav-item ${activeSec === "bei" ? "active" : ""}" onclick="onyesha('bei')">
    <span class="nav-icon">💰</span> <span>Bei za Mazao</span>
  </div>
  <div class="nav-item ${activeSec === "miamala" ? "active" : ""}" onclick="onyesha('miamala')">
    <span class="nav-icon">💳</span> <span>Miamala</span>
  </div>

  <div class="nav-group">Takwimu</div>
  <div class="nav-item ${activeSec === "analytics" ? "active" : ""}" onclick="onyesha('analytics')">
    <span class="nav-icon">📈</span> <span>Analytics</span>
  </div>
  <div class="nav-item ${activeSec === "ripoti" ? "active" : ""}" onclick="onyesha('ripoti')">
    <span class="nav-icon">📄</span> <span>Ripoti & Export</span>
  </div>

  <div class="sidebar-footer">
    Soko la Mkulima © 2026<br>
    <span style="color:#2E8B57">● Hai sasa hivi</span>
  </div>
</aside>

<!-- MAIN -->
<div class="main">
  <div class="topbar">
    <div class="topbar-left">
      <button class="menu-btn" onclick="toggleSidebar(true)">☰</button>
      <div>
        <h2 id="topbar-title">📊 Dashibodi</h2>
        <p>${new Date().toLocaleDateString("sw-TZ", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}</p>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <button id="notifBtn" onclick="ombaNotificationPermission()" style="border:none;background:var(--kijani-mwanga);color:var(--kijani);padding:6px 12px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer">🔔 Wezesha Notification</button>
      ${pWapya > 0 ? `<span class="topbar-badge" style="background:#DCFCE7;color:#166534;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:700">👨‍🌾 +${pWapya} wapya</span>` : ""}
      ${pPurchase + pBuyer > 0 ? `<span class="topbar-badge" style="background:#FEF3C7;color:#92400E;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:700">⏳ ${pPurchase + pBuyer} maombi</span>` : ""}
    </div>
  </div>

  <div class="content">

    ${okMsg ? `<div class="toast show" id="toast">✅ ${okMsg}</div>` : ""}

    <!-- 1. DASHIBODI -->
    <div class="sehemu ${activeSec === "dashibodi" ? "active" : ""}" id="sec-dashibodi">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background:#DCFCE7">👨‍🌾</div>
          <div class="stat-num">${statWakulima}</div>
          <div class="stat-lbl">Wakulima Wote</div>
          ${pWapya > 0 ? `<div class="stat-delta">+${pWapya} leo</div>` : ""}
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:#DBEAFE">📢</div>
          <div class="stat-num">${statMatangazo}</div>
          <div class="stat-lbl">Matangazo</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:#FEF3C7">🛒</div>
          <div class="stat-num">${statWanunuzi}</div>
          <div class="stat-lbl">Wanunuzi</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:#F3E8FF">💬</div>
          <div class="stat-num">${statBuyerReq}</div>
          <div class="stat-lbl">Maombi ya Wanunuzi</div>
        </div>
      </div>

      <div class="alerts-row">
        ${pHawaja > 0 ? `<div class="alert-card alert-warn"><span class="alert-icon">👨‍🌾</span><div><div class="alert-title">Uthibitisho Unahitajika</div><div class="alert-msg">${pHawaja} wakulima hawajathibitishwa — <a href="#" onclick="onyesha('wakulima')" style="color:#92400E;font-weight:700">Angalia →</a></div></div></div>` : ""}
        ${pPurchase > 0 ? `<div class="alert-card alert-info"><span class="alert-icon">🤝</span><div><div class="alert-title">Maombi Yanayosubiri</div><div class="alert-msg">${pPurchase} purchase requests — <a href="#" onclick="onyesha('maombi-ununuzi')" style="color:#1D4ED8;font-weight:700">Simamia →</a></div></div></div>` : ""}
        ${pBuyer > 0 ? `<div class="alert-card alert-warn"><span class="alert-icon">💬</span><div><div class="alert-title">Maombi ya Wanunuzi</div><div class="alert-msg">${pBuyer} buyer requests — <a href="#" onclick="onyesha('maombi-wanunuzi')" style="color:#92400E;font-weight:700">Simamia →</a></div></div></div>` : ""}
        ${pPurchase + pBuyer + pHawaja === 0 ? `<div class="alert-card alert-ok"><span class="alert-icon">✅</span><div><div class="alert-title">Kila kitu kiko sawa!</div><div class="alert-msg">Hakuna kazi zinazohitaji umakini sasa hivi.</div></div></div>` : ""}
      </div>

      <div class="charts-row">
        <div class="chart-card">
          <h3>📈 Matangazo — Wiki Iliyopita</h3>
          <svg viewBox="0 0 ${W} ${H}" width="100%" height="130">
            <defs><linearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2E8B57" stop-opacity=".2"/><stop offset="100%" stop-color="#2E8B57" stop-opacity="0"/></linearGradient></defs>
            <polyline points="${pts}" fill="none" stroke="#2E8B57" stroke-width="2.5" stroke-linejoin="round"/>
            ${dots}
          </svg>
          <div class="wiki-lbl">${wikiLbls}</div>
        </div>
        <div class="chart-card">
          <h3>🔥 Mahitaji Makubwa</h3>
          ${mahitajiBars}
        </div>
        <div class="chart-card">
          <h3>📍 Wakulima kwa Mkoa</h3>
          ${mkoaBars}
        </div>
      </div>

      <div class="panel">
        <div class="panel-hd">⭐ Wakulima Waliokadiriwa Zaidi</div>
        <div style="overflow-x:auto">
          <table>
            <tr><th>#</th><th>Simu</th><th>Ukadiriaji</th><th>Idadi</th></tr>
            ${ratingsR.rows.map((r, i) => `<tr><td>${["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][i]}</td><td>${r.farmer_phone}</td><td><strong style="color:#F59E0B">⭐ ${r.w}</strong></td><td>${r.n}</td></tr>`).join("") || '<tr><td colspan="4" class="empty-row">Hakuna ukadiriaji bado.</td></tr>'}
          </table>
        </div>
      </div>
    </div>

    <!-- 2. WAKULIMA -->
    <div class="sehemu ${activeSec === "wakulima" ? "active" : ""}" id="sec-wakulima">
      <div class="tbl-header">
        <div>
          <h3>👨‍🌾 Wakulima Wote (${statWakulima})</h3>
          <p style="font-size:12px;color:var(--muted);margin-top:4px">${pHawaja} hawajathibitishwa • ${statWakulima - pHawaja} wamethibitishwa</p>
        </div>
        <div style="display:flex;gap:10px;">
          <span class="badge b-warn">${pHawaja} hawajathibitishwa</span>
          <span class="badge b-ok">${statWakulima - pHawaja} wamethibitishwa</span>
        </div>
      </div>
      <div class="panel">
        <div style="overflow-x:auto">
          <table>
            <tr><th>Jina</th><th>Mkoa</th><th>Wilaya</th><th>Simu</th><th>Hali</th><th>Tarehe</th><th>Vitendo</th></tr>
            ${wakulimaRows}
          </table>
        </div>
      </div>
    </div>

    <!-- 3. WANUNUZI -->
    <div class="sehemu ${activeSec === "wanunuzi" ? "active" : ""}" id="sec-wanunuzi">
      <div class="tbl-header">
        <h3>🛒 Wanunuzi Wote (${statWanunuzi})</h3>
      </div>
      <div class="panel">
        <div style="overflow-x:auto">
          <table>
            <tr><th>Jina</th><th>Mkoa</th><th>Simu</th><th>Hali</th><th>Tarehe</th><th>Vitendo</th></tr>
            ${wanunuziRows}
          </table>
        </div>
      </div>
    </div>

    <!-- 4. MATANGAZO -->
    <div class="sehemu ${activeSec === "matangazo" ? "active" : ""}" id="sec-matangazo">
      <div class="tbl-header">
        <h3>📢 Matangazo Yote (${statMatangazo})</h3>
        <div style="display:flex;gap:8px">
          <span class="badge b-ok">${matangazoR.rows.filter((m) => m.status === "accepted").length} Yamekubaliwa</span>
          <span class="badge b-warn">${matangazoR.rows.filter((m) => !m.status || m.status === "pending").length} Yanayosubiri</span>
          <span class="badge b-red">${matangazoR.rows.filter((m) => m.status === "rejected").length} Yamekataliwa</span>
        </div>
      </div>
      <div class="panel">
        <div style="overflow-x:auto">
          <table>
            <tr><th>Zao</th><th>Magunia</th><th>Bei/Gunia</th><th>Simu</th><th>Mkoa</th><th>Hali</th><th>Tarehe</th><th>Vitendo</th></tr>
            ${matangazoRows}
          </table>
        </div>
      </div>
    </div>

    <!-- 5. MAOMBI YA UNUNUZI -->
    <div class="sehemu ${activeSec === "maombi-ununuzi" ? "active" : ""}" id="sec-maombi-ununuzi">
      <div class="tbl-header">
        <div>
          <h3>🤝 Maombi ya Ununuzi (Purchase Requests)</h3>
          <p style="font-size:12px;color:var(--muted);margin-top:4px">Mnunuzi → Mkulima (ombi la moja kwa moja)</p>
        </div>
        <div style="display:flex;gap:8px">
          <span class="badge b-warn">${pPurchase} Yanayosubiri</span>
        </div>
      </div>
      <div class="panel">
        <div style="overflow-x:auto">
          <table>
            <tr><th>Zao</th><th>Kiasi</th><th>Mnunuzi</th><th>Mkulima</th><th>Hali</th><th>Tarehe</th><th>Vitendo</th></tr>
            ${purchaseRows}
          </table>
        </div>
      </div>
    </div>

    <!-- 6. MAOMBI YA WANUNUZI -->
    <div class="sehemu ${activeSec === "maombi-wanunuzi" ? "active" : ""}" id="sec-maombi-wanunuzi">
      <div class="tbl-header">
        <div>
          <h3>💬 Maombi ya Wanunuzi (Buyer Requests)</h3>
          <p style="font-size:12px;color:var(--muted);margin-top:4px">Wanunuzi wanatafuta mazao kwa mkoa</p>
        </div>
        <span class="badge b-warn">${pBuyer} Yanayosubiri</span>
      </div>
      <div class="panel">
        <div style="overflow-x:auto">
          <table>
            <tr><th>Zao</th><th>Kiasi</th><th>Mkoa</th><th>Simu ya Mnunuzi</th><th>Hali</th><th>Tarehe</th><th>Vitendo</th></tr>
            ${buyerReqRows}
          </table>
        </div>
      </div>
    </div>

    <!-- 7. BEI ZA MAZAO -->
    <div class="sehemu ${activeSec === "bei" ? "active" : ""}" id="sec-bei">
      <div class="tbl-header">
        <h3>💰 Bei za Mazao (${beiR.rows.length})</h3>
      </div>

      <div class="panel" style="margin-bottom:20px;">
        <div class="panel-hd">➕ Ongeza Bei Mpya</div>
        <form method="POST" action="/admin/ongeza?siri=${S}">
          <div class="form-grid">
            <input name="zao" placeholder="Zao (mfano: mahindi)" required>
            <input name="mkoa" placeholder="Mkoa (mfano: Dodoma)" required>
            <input name="bei" placeholder="Bei kwa kilo (TZS)" type="number" required>
            <button class="btn-main" type="submit">+ Ongeza Bei</button>
          </div>
        </form>
      </div>

      <div class="panel">
        <div style="overflow-x:auto">
          <table>
            <tr><th>Zao</th><th>Mkoa</th><th>Bei (TZS/kilo)</th><th>Vitendo</th></tr>
            ${beiRows}
          </table>
        </div>
      </div>
    </div>

    <!-- 8. MIAMALA -->
    <div class="sehemu ${activeSec === "miamala" ? "active" : ""}" id="sec-miamala">
      <div class="tbl-header">
        <h3>💳 Rekodi za Miamala</h3>
      </div>

      <div class="panel" style="margin-bottom:20px;">
        <div class="panel-hd">➕ Rekodi Muamala Mpya</div>
        <form method="POST" action="/admin/transaction?siri=${S}">
          <div class="form-grid">
            <input name="reference" placeholder="Reference (MPESA-12345)" required>
            <input name="buyer_phone" placeholder="Simu ya Mnunuzi">
            <input name="farmer_phone" placeholder="Simu ya Mkulima">
            <input name="zao" placeholder="Zao">
            <input name="amount" placeholder="Kiasi (TZS)" type="number" required>
            <select name="method"><option>M-Pesa</option><option>Airtel Money</option><option>Tigo Pesa</option><option>Bank</option></select>
            <button class="btn-main" type="submit">+ Rekodi</button>
          </div>
        </form>
      </div>

      <div class="panel">
        <div style="overflow-x:auto">
          <table>
            <tr><th>Reference</th><th>Mnunuzi</th><th>Mkulima</th><th>Zao</th><th>Kiasi</th><th>Njia</th><th>Hali</th><th>Tarehe</th></tr>
            ${txRows}
          </table>
        </div>
      </div>
    </div>

    <!-- 9. ANALYTICS -->
    <div class="sehemu ${activeSec === "analytics" ? "active" : ""}" id="sec-analytics">
      <div class="tbl-header"><h3>📈 Analytics ya Kina</h3></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:16px;margin-bottom:20px;">
        <div class="chart-card">
          <h3>Mazao Yanayoombwa Zaidi</h3>
          ${mahitajiBars}
        </div>
        <div class="chart-card">
          <h3>Wakulima kwa Mkoa</h3>
          ${mkoaBars}
        </div>
      </div>
      <div class="panel">
        <div class="panel-hd">⭐ Wakulima Waliokadiriwa Zaidi</div>
        <div style="overflow-x:auto">
          <table>
            <tr><th>#</th><th>Simu ya Mkulima</th><th>Wastani wa Ukadiriaji</th><th>Idadi ya Ukadiriaji</th></tr>
            ${ratingsR.rows.map((r, i) => `
              <tr>
                <td>${["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][i] || "•"}</td>
                <td>${r.farmer_phone}</td>
                <td><strong style="color:#F59E0B">⭐ ${r.w}</strong></td>
                <td>${r.n} ukadiriaji</td>
              </tr>
            `).join("") || '<tr><td colspan="4" class="empty-row">Hakuna ukadiriaji bado.</td></tr>'}
          </table>
        </div>
      </div>
    </div>

    <!-- 10. RIPOTI -->
    <div class="sehemu ${activeSec === "ripoti" ? "active" : ""}" id="sec-ripoti">
      <div class="tbl-header"><h3>📄 Pakua Ripoti</h3></div>
      <div class="ripoti-grid">
        <div class="ripoti-card">
          <h4>👨‍🌾 Ripoti ya Wakulima</h4>
          <p>Orodha kamili ya wakulima wote waliojisajili</p>
          <a href="/ripoti/wakulima?siri=${S}" class="btn-ripoti btn-pdf">📄 Pakua PDF</a>
          <a href="/ripoti-excel/wakulima?siri=${S}" class="btn-ripoti btn-csv">📊 Pakua CSV/Excel</a>
        </div>
        <div class="ripoti-card">
          <h4>📢 Ripoti ya Matangazo</h4>
          <p>Matangazo yote ya mazao kwenye mfumo</p>
          <a href="/ripoti/matangazo?siri=${S}" class="btn-ripoti btn-pdf">📄 Pakua PDF</a>
          <a href="/ripoti-excel/matangazo?siri=${S}" class="btn-ripoti btn-csv">📊 Pakua CSV/Excel</a>
        </div>
        <div class="ripoti-card">
          <h4>💬 Ripoti ya Maombi</h4>
          <p>Maombi yote ya wanunuzi kwa mkoa</p>
          <a href="/ripoti/maombi?siri=${S}" class="btn-ripoti btn-pdf">📄 Pakua PDF</a>
        </div>
        <div class="ripoti-card">
          <h4>💳 Ripoti ya Miamala</h4>
          <p>Rekodi zote za malipo na miamala</p>
          <a href="/ripoti/miamala?siri=${S}" class="btn-ripoti btn-pdf">📄 Pakua PDF</a>
        </div>
      </div>
    </div>

  </div>
</div>

<script>
const titles = {
  'dashibodi':'📊 Dashibodi','wakulima':'👨‍🌾 Wakulima','wanunuzi':'🛒 Wanunuzi',
  'matangazo':'📢 Matangazo','maombi-ununuzi':'🤝 Maombi ya Ununuzi',
  'maombi-wanunuzi':'💬 Maombi ya Wanunuzi','bei':'💰 Bei za Mazao',
  'miamala':'💳 Miamala','analytics':'📈 Analytics','ripoti':'📄 Ripoti',
};

function toggleSidebar(show) {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (show) {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  } else {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  }
}

function onyesha(sec) {
  document.querySelectorAll('.sehemu').forEach(el => el.classList.remove('active'));
  const el = document.getElementById('sec-' + sec);
  if (el) el.classList.add('active');
  
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick') === "onyesha('" + sec + "')") n.classList.add('active');
  });
  
  document.getElementById('topbar-title').textContent = titles[sec] || sec;
  const url = new URL(window.location);
  url.searchParams.set('sec', sec);
  window.history.replaceState({}, '', url);

  // Funga sidebar ukichagua menu ikiwa upo kwenye simu
  if (window.innerWidth <= 850) {
    toggleSidebar(false);
  }
}

const toast = document.getElementById('toast');
if (toast) setTimeout(() => { toast.style.opacity='0'; toast.style.transform='translateY(-10px)'; }, 4000);

const urlSec = new URL(window.location).searchParams.get('sec') || 'dashibodi';
onyesha(urlSec);

// ═══════════════════════════════════════════════════════════
// NOTIFICATION LOGIC FOR ADMIN
// ═══════════════════════════════════════════════════════════
function ombaNotificationPermission() {
  if (!("Notification" in window)) {
    alert("Kivinjari hiki hakisaidii taarifa za Notification.");
    return;
  }
  Notification.requestPermission().then((permission) => {
    if (permission === "granted") {
      updateNotifBtn();
      new Notification("Soko la Mkulima", {
        body: "Notification zimewezeshwa kikamilifu!",
        icon: "🌱"
      });
    }
  });
}

function updateNotifBtn() {
  const btn = document.getElementById('notifBtn');
  if (btn && "Notification" in window && Notification.permission === "granted") {
    btn.style.display = 'none';
  }
}
updateNotifBtn();

function onyeshaPushNotification(msg) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Soko la Mkulima Admin", {
      body: msg || "Kuna mabadiliko au taarifa mpya kwenye mfumo!",
      icon: "🌱"
    });
  }
}

// ═══════════════════════════════════════════════════════════
// REAL-TIME AUTO-REFRESH CLIENT LOGIC (SSE)
// ═══════════════════════════════════════════════════════════
const siriParam = new URLSearchParams(window.location.search).get('siri');
if (!!window.EventSource && siriParam) {
  const evtSource = new EventSource('/admin/stream?siri=' + encodeURIComponent(siriParam));
  evtSource.onmessage = function(e) {
    try {
      const data = JSON.parse(e.data);
      if (data.reload) {
        onyeshaPushNotification(data.msg);
        setTimeout(() => {
          const currentSec = new URLSearchParams(window.location.search).get('sec') || 'dashibodi';
          window.location.href = window.location.pathname + '?siri=' + encodeURIComponent(siriParam) + '&sec=' + currentSec;
        }, 1000);
      }
    } catch(err) {
      console.error(err);
    }
  };
}
</script>
</body>
</html>`);
  });

  // ═══════════════════════════════════════════════════════════
  // RIPOTI ROUTES
  // ═══════════════════════════════════════════════════════════
  router.get("/ripoti/:aina", auth, async (req, res) => {
    const aina = req.params.aina;
    let title = "", headers = [], rows = [];
    try {
      if (aina === "wakulima") {
        title = "Ripoti ya Wakulima";
        const r = await q("SELECT jina,mkoa,wilaya,phone_number,verified,tarehe FROM wakulima ORDER BY tarehe DESC");
        headers = ["Jina", "Mkoa", "Wilaya", "Simu", "Amethibitishwa", "Tarehe"];
        rows = r.rows.map((w) => [w.jina, w.mkoa, w.wilaya, w.phone_number, w.verified ? "Ndiyo" : "Hapana", dateStr(w.tarehe)]);
      } else if (aina === "matangazo") {
        title = "Ripoti ya Matangazo";
        const r = await q("SELECT zao,idadi,bei,phone_number,status,tarehe FROM matangazo ORDER BY tarehe DESC");
        headers = ["Zao", "Magunia", "Bei/Gunia", "Simu", "Hali", "Tarehe"];
        rows = r.rows.map((m) => [cap(m.zao), m.idadi, m.bei ? `TZS ${fmt(m.bei)}` : "-", m.phone_number, m.status || "-", dateStr(m.tarehe)]);
      } else if (aina === "maombi") {
        title = "Ripoti ya Maombi ya Wanunuzi";
        const r = await q("SELECT zao,idadi,mkoa,phone_number,status,tarehe FROM buyer_requests ORDER BY tarehe DESC");
        headers = ["Zao", "Kiasi", "Mkoa", "Simu", "Hali", "Tarehe"];
        rows = r.rows.map((b) => [cap(b.zao), b.idadi, b.mkoa, b.phone_number, b.status || "pending", dateStr(b.tarehe)]);
      } else if (aina === "miamala") {
        title = "Ripoti ya Miamala";
        const r = await q("SELECT reference,buyer_phone,farmer_phone,zao,amount,method,status,tarehe FROM transactions ORDER BY tarehe DESC");
        headers = ["Reference", "Mnunuzi", "Mkulima", "Zao", "Kiasi", "Njia", "Hali", "Tarehe"];
        rows = r.rows.map((t) => [t.reference, t.buyer_phone || "-", t.farmer_phone || "-", t.zao || "-", `TZS ${fmt(t.amount)}`, t.method || "-", t.status || "-", dateStr(t.tarehe)]);
      } else return res.status(404).send("Ripoti hii haipatikani.");

      const tbl = rows.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
      res.setHeader("Content-Type", "text/html;charset=utf-8");
      res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
      <style>body{font-family:Arial,sans-serif;color:#1F2A24;padding:40px}h1{color:#14432F;font-size:20px}.meta{color:#6B7670;font-size:13px;margin-bottom:24px}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#14432F;color:#fff;padding:10px 12px;text-align:left}td{padding:8px 12px;border-bottom:1px solid #E6EAE8}tr:nth-child(even) td{background:#F2F5F4}.footer{margin-top:32px;color:#6B7670;font-size:12px;text-align:center}@media print{.no-print{display:none}}</style>
      </head><body>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px"><span style="font-size:28px">🌱</span><div><h1 style="margin:0">${title}</h1><div class="meta">Soko la Mkulima Tanzania • ${new Date().toLocaleDateString("sw-TZ")} • Rekodi: ${rows.length}</div></div></div>
      <p class="no-print"><button onclick="window.print()" style="background:#14432F;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;margin-bottom:16px">🖨️ Chapisha / Hifadhi PDF</button></p>
      <table><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>${tbl || "<tr><td colspan='8' style='text-align:center;color:#6B7670;padding:20px'>Hakuna data bado.</td></tr>"}</table>
      <div class="footer">Soko la Mkulima — Kuunganisha Wakulima na Wanunuzi Tanzania</div>
      </body></html>`);
    } catch (err) {
      res.status(500).send("Tatizo: " + err.message);
    }
  });

  router.get("/ripoti-excel/:aina", auth, async (req, res) => {
    const aina = req.params.aina;
    let data = [], headers = [], fn = "ripoti";
    try {
      if (aina === "wakulima") {
        const r = await q("SELECT jina,mkoa,wilaya,phone_number,verified,tarehe FROM wakulima ORDER BY tarehe DESC");
        headers = ["Jina", "Mkoa", "Wilaya", "Simu", "Amethibitishwa", "Tarehe"];
        data = r.rows.map((w) => [w.jina, w.mkoa, w.wilaya, w.phone_number, w.verified ? "Ndiyo" : "Hapana", dateStr(w.tarehe)]);
        fn = "wakulima";
      } else if (aina === "matangazo") {
        const r = await q("SELECT zao,idadi,bei,phone_number,active,tarehe FROM matangazo ORDER BY tarehe DESC");
        headers = ["Zao", "Magunia", "Bei/Gunia", "Simu", "Hai", "Tarehe"];
        data = r.rows.map((m) => [m.zao, m.idadi, m.bei || "", m.phone_number, m.active ? "Ndiyo" : "Hapana", dateStr(m.tarehe)]);
        fn = "matangazo";
      } else return res.status(404).send("Ripoti hii haipatikani.");

      const csv = [headers.join(","), ...data.map((row) => row.map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(","))].join("\n");
      res.setHeader("Content-Type", "text/csv;charset=utf-8");
      res.setHeader("Content-Disposition", `attachment;filename="${fn}-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send("\uFEFF" + csv);
    } catch (err) {
      res.status(500).send("Tatizo: " + err.message);
    }
  });

  return router;
};
