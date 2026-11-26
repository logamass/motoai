/* MotoAI clickable prototype. No backend: the bot is a scripted state machine over real price-list data. */
(function () {
  "use strict";

  const DATA = window.MOTO_DATA;
  const SPECS = window.MOTO_SPECS || {};
  const STR = window.STR;
  const PHONE = "+91 98xxx x4210";
  const DEMO_USER = { name: "Ravi Kumar", email: "ravi.kumar@gmail.com", initial: "R" };

  // ---------- storage (best effort) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("motoai." + k); const p = v ? JSON.parse(v) : null; return p ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("motoai." + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  const S = {
    lang: store.get("lang", "tl"),
    convo: store.get("convo", []),
    profile: store.get("profile", {}),
    picks: store.get("picks", []),
    focus: store.get("focus", null),          // {m, v} car currently discussed
    user: store.get("user", null),
    saved: store.get("saved", []),
    compare: store.get("compare", []),        // [{m, v}]
    drives: store.get("drives", []),
    widgetOpen: false,
    typing: false,
    linked: store.get("linked", false),
    insurance: "13",
    filter: "all",
  };
  function persist() {
    ["lang", "convo", "profile", "picks", "focus", "user", "saved", "compare", "drives", "linked"].forEach((k) => store.set(k, S[k]));
  }

  // ---------- helpers ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (s) => esc(s).replace(/\*([^*\n]+)\*/g, "<b>$1</b>");
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const lakh = (n) => "₹" + (n / 1e5).toFixed(2) + "L";
  const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  function t(key, p) {
    const e = STR[key];
    if (!e) return key;
    const o = typeof e === "function" ? e(p || {}) : e;
    return o[S.lang] || o.en;
  }
  const model = (id) => DATA.models.find((m) => m.id === id);
  const variant = (m, vid) => (m ? m.variants.find((v) => v.id === vid) : null);
  const carName = (m, v) => `${m.name} ${v.name}${v.tone ? " " + v.tone : ""}`;
  const fromPrice = (m) => Math.min(...m.variants.map((v) => v.price.onroad13));
  const specOf = (m) => SPECS[m.id] || {};
  const allVariants = () => DATA.models.flatMap((m) => m.variants.map((v) => ({ m, v })));
  function photo(m, cls) {
    if (m.photo) return `<img src="${m.photo}" alt="${esc(m.name)}" loading="lazy" class="${cls || ""}">`;
    return silhouette(specOf(m).body);
  }
  function silhouette(body) {
    const tall = /SUV|MPV|Pickup/i.test(body || "");
    return `<svg viewBox="0 0 220 100" width="70%" aria-hidden="true"><g fill="#9fb0c8">
      <path d="M20 70 Q22 ${tall ? 40 : 52} 60 ${tall ? 36 : 46} L ${tall ? 85 : 80} ${tall ? 22 : 30} Q110 ${tall ? 16 : 24} 150 ${tall ? 22 : 32} L 185 ${tall ? 40 : 48} Q205 52 205 70 Z"/>
      <circle cx="60" cy="72" r="15" fill="#33415c"/><circle cx="165" cy="72" r="15" fill="#33415c"/></g></svg>`;
  }
  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast"; el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }
  function emi(principal, ratePct, months) {
    const r = ratePct / 1200;
    return principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1);
  }

  // ---------- chat engine ----------
  // Message: {from:'bot'|'user'|'sys', ch:'wa'|'web', k?, p?, raw?, buttons?, cards?, breakup?, compare?, time}
  let currentChannel = "wa";
  function push(msg) {
    msg.ch = msg.ch || currentChannel;
    msg.time = now();
    S.convo.push(msg);
    persist();
    renderChats();
  }
  function botSay(list) {
    let delay = 0;
    list.forEach((m, i) => {
      delay += i === 0 ? 450 : 750;
      setTimeout(() => { S.typing = true; renderChats(); }, delay - 350);
      setTimeout(() => {
        S.typing = i < list.length - 1;
        push(Object.assign({ from: "bot" }, m));
      }, delay);
    });
  }
  function userSay(k, p) { push({ from: "user", k, p }); }
  function userRaw(text) { push({ from: "user", raw: text }); }

  const B = (k, act, p, extra) => Object.assign({ k, act, p }, extra || {});

  const BUDGETS = [
    { lo: 0, hi: 12e5, label: "Under ₹12L" },
    { lo: 12e5, hi: 18e5, label: "₹12–18L" },
    { lo: 18e5, hi: 25e5, label: "₹18–25L" },
    { lo: 25e5, hi: 35e5, label: "₹25–35L" },
    { lo: 35e5, hi: 60e5, label: "₹35–60L" },
    { lo: 60e5, hi: 3e7, label: "Above ₹60L" },
  ];
  const FAMILY = [2, 4, 5, 7, 8];
  const FUELS = ["Petrol", "Diesel", "Hybrid", "CNG", "Electric"];

  function startFlow(channel) {
    currentChannel = channel;
    botSay([{
      k: channel === "wa" ? "greet" : "web_greet",
      buttons: [B("b_start", "start"), B("b_browse", "browse")],
    }]);
  }

  function askFamily() {
    botSay([{ k: "q_family", buttons: FAMILY.map((n, i) => B("o_people", "fam:" + n, { v: ["1–2", "3–4", "5", "6–7", "8+"][i] })) }]);
  }
  function askBudget() {
    botSay([{ k: "q_budget", buttons: BUDGETS.map((b, i) => ({ text: b.label, act: "bud:" + i })) }]);
  }
  function askUsage() {
    botSay([{ k: "q_usage", buttons: [B("o_city", "use:city"), B("o_hwy", "use:hwy"), B("o_both", "use:both"), B("o_taxi", "use:taxi")] }]);
  }
  function askFuel() {
    const avail = new Set(candidatePool().map((x) => x.v.fuel));
    const btns = FUELS.filter((f) => avail.has(f)).map((f) => ({ text: f, act: "fuel:" + f }));
    btns.push(B("o_nofuel", "fuel:any"));
    botSay([{ k: "q_fuel", buttons: btns }]);
  }
  function askTrans() {
    botSay([{ k: "q_trans", buttons: [B("o_manual", "tr:MT"), B("o_auto", "tr:AT"), B("o_either", "tr:any")] }]);
  }

  function candidatePool() {
    const p = S.profile;
    const taxi = p.usage === "taxi";
    return allVariants().filter(({ m }) => (taxi ? m.segment !== "private" : m.segment === "private"));
  }

  function recommend() {
    const p = S.profile;
    const b = BUDGETS[p.budget ?? 2];
    let relaxed = false;
    const score = ({ m, v }, opts) => {
      const sp = specOf(m);
      const seats = sp.seatsMax || 5;
      if (seats < p.family) return null;
      if (opts.fuel && p.fuel && p.fuel !== "any" && v.fuel !== p.fuel) return null;
      if (opts.trans && p.trans && p.trans !== "any" && v.trans !== p.trans) return null;
      const price = v.price.onroad13;
      let s;
      if (price <= b.hi && price >= b.lo * 0.9) s = 100 - ((b.hi - price) / b.hi) * 45;
      else if (price > b.hi && price <= b.hi * 1.1) s = 62 - ((price - b.hi) / b.hi) * 250;
      else if (!opts.budget) s = 30 - Math.abs(price - b.hi) / b.hi * 20;
      else return null;
      const city = p.usage === "city" || p.usage === "both";
      if (v.fuel === "Hybrid" && city) s += 12;
      if (v.fuel === "Diesel" && p.usage === "hwy") s += 10;
      if (v.fuel === "CNG" && p.usage === "taxi") s += 8;
      if (v.trans === "AT" && p.usage === "city") s += 5;
      const spare = seats - p.family;
      if (spare >= 0 && spare <= 2) s += 6;
      if (spare >= 4) s -= 6;
      return s;
    };
    const run = (opts) => {
      const best = {};
      candidatePool().forEach((c) => {
        const s = score(c, opts);
        if (s === null) return;
        if (!best[c.m.id] || s > best[c.m.id].s) best[c.m.id] = { ...c, s };
      });
      return Object.values(best).sort((a, b2) => b2.s - a.s).slice(0, 3);
    };
    let res = run({ fuel: true, trans: true, budget: true });
    if (res.length < 2) { relaxed = true; res = run({ fuel: false, trans: true, budget: true }); }
    if (res.length < 2) { res = run({ fuel: false, trans: false, budget: true }); }
    if (res.length < 2) { res = run({ fuel: false, trans: false, budget: false }); }
    return { res, relaxed };
  }

  function reasons(m, v) {
    const p = S.profile, sp = specOf(m), b = BUDGETS[p.budget ?? 2], out = [];
    if (sp.seatsMax) out.push(["r_seats", { s: sp.seatsLabel || sp.seatsMax, f: p.family === 8 ? "8+" : p.family }]);
    if (v.price.onroad13 <= b.hi) out.push(["r_budget_in"]);
    else out.push(["r_budget_over", { x: lakh(v.price.onroad13 - b.hi) }]);
    if (m.segment !== "private") out.push(["r_taxi"]);
    else if (v.fuel === "Hybrid") out.push([p.usage === "city" || p.usage === "both" ? "r_hybrid_city" : "r_hybrid"]);
    else if (v.fuel === "Diesel" && p.usage === "hwy") out.push(["r_diesel_hwy"]);
    else if (v.fuel === "CNG") out.push(["r_cng"]);
    else if (v.fuel === "Electric") out.push(["r_ev"]);
    else if (v.trans === "AT" && p.usage === "city") out.push(["r_auto_city"]);
    else out.push(["r_brand"]);
    return out.slice(0, 3);
  }

  function summaryText() {
    const p = S.profile;
    const fam = { 2: "1–2", 4: "3–4", 5: "5", 7: "6–7", 8: "8+" }[p.family];
    const parts = [`${fam} ${S.lang === "ta" ? "பேர்" : S.lang === "tl" ? "per" : "people"}`, BUDGETS[p.budget].label];
    if (p.fuel && p.fuel !== "any") parts.push(p.fuel);
    if (p.trans && p.trans !== "any") parts.push(p.trans === "AT" ? "Automatic" : "Manual");
    return parts.join(" · ");
  }

  function showRecos() {
    const n = candidatePool().length;
    const { res, relaxed } = recommend();
    S.picks = res.map((r) => ({ m: r.m.id, v: r.v.id }));
    persist();
    botSay([
      { k: "searching", p: { n, d: DATA.effectiveLabel } },
      { k: relaxed ? "reco_relaxed" : "reco_intro", p: { summary: summaryText() }, cards: S.picks },
      { k: "reco_follow", buttons: [B("b_compare", "compare"), B("b_human", "human")] },
    ]);
  }

  function showBreakup(mid, vid) {
    const m = model(mid), v = variant(m, vid);
    if (!m || !v) return;
    S.focus = { m: mid, v: vid }; persist();
    botSay([{
      k: "breakup_head", p: { name: carName(m, v) }, breakup: { m: mid, v: vid },
      buttons: [
        B("b_view", `link:${mid}:${vid}`, null, { cta: true }),
        B("b_emi", `emi:${mid}:${vid}`),
        B("b_td", `td:${mid}:${vid}`),
      ],
    }]);
  }

  function handle(act, label) {
    const [cmd, a, b] = act.split(":");
    // typed text already echoed the user's message, so skip the button echo
    const userSay = label && label.silent ? () => {} : (k, p) => push({ from: "user", k, p });
    const userRaw = label && label.silent ? () => {} : (text) => push({ from: "user", raw: text });
    switch (cmd) {
      case "start": userSay(label.k, label.p); return askFamily();
      case "browse":
        userSay(label.k);
        return botSay([{ k: "browse_msg", buttons: [B("b_open_site", "site", null, { cta: true })] }]);
      case "site": go("#/"); return;
      case "fam": S.profile.family = +a; persist(); userSay(label.k, label.p); return askBudget();
      case "bud": S.profile.budget = +a; persist(); userRaw(BUDGETS[+a].label); return askUsage();
      case "use": S.profile.usage = a; persist(); userSay(label.k); return askFuel();
      case "fuel": S.profile.fuel = a; persist(); label.text ? userRaw(label.text) : userSay(label.k); return askTrans();
      case "tr": S.profile.trans = a; persist(); userSay(label.k); return showRecos();
      case "bk": { const m = model(a), v = variant(m, b); userRaw(`${t("b_breakup")}: ${m.name} ${v.name}`); return showBreakup(a, b); }
      case "link": return openCarFromChat(a, b);
      case "compare": {
        userSay("b_compare");
        S.compare = S.picks.slice(0, 3); persist();
        const scored = S.picks.map((x) => ({ x, m: model(x.m), v: variant(model(x.m), x.v) }));
        const best = scored[0];
        return botSay([
          { k: "compare_head", compare: S.picks },
          { k: "compare_tip", p: { best: best ? carName(best.m, best.v) : "" }, buttons: [B("b_view_compare", "cmpsite", null, { cta: true }), B("b_td", best ? `td:${best.x.m}:${best.x.v}` : "human")] },
        ]);
      }
      case "cmpsite": go("#/compare"); return;
      case "emi": {
        const m = model(a), v = variant(m, b); userSay("b_emi");
        const price = v.price.onroad13, dp = Math.round(price * 0.2 / 10000) * 10000;
        return botSay([{ k: "emi_msg", p: { name: carName(m, v), dp: dp.toLocaleString("en-IN"), emi: Math.round(emi(price - dp, 9, 60)).toLocaleString("en-IN") }, buttons: [B("b_td", `td:${a}:${b}`), B("b_view", `link:${a}:${b}`, null, { cta: true })] }]);
      }
      case "td": {
        const m = model(a), v = variant(m, b); userSay("b_td");
        return botSay([{ k: "td_ask", p: { name: carName(m, v) }, buttons: ["slot1", "slot2", "slot3"].map((s) => B(s, `slot:${a}:${b}:${s}`)) }]);
      }
      case "slot": {
        const s = act.split(":")[3], m = model(a), v = variant(m, b);
        userSay(s);
        S.drives.push({ m: a, v: b, slot: s, at: Date.now() }); persist();
        return botSay([{ k: "td_done", p: { name: carName(m, v), slot: t(s) }, buttons: [B("b_human", "human"), B("b_restart", "restart")] }]);
      }
      case "human": userSay("b_human"); return botSay([{ k: "human_msg" }]);
      case "restart": userSay("b_restart"); S.profile = {}; persist(); return askFamily();
      case "find": userSay("b_find_variant"); return askFamily();
      case "pgbk": userSay("b_breakup"); return showBreakup(a, b);
    }
  }

  function handleText(text) {
    const s = text.trim(); if (!s) return;
    userRaw(s);
    const low = s.toLowerCase();
    const p = S.profile;
    // light parsing so typed answers also work in the demo
    if (p.family === undefined && /\b([1-9])\b/.test(low) && S.convo.some((m) => m.k === "q_family")) {
      const n = +low.match(/\b([1-9])\b/)[1];
      p.family = n <= 2 ? 2 : n <= 4 ? 4 : n === 5 ? 5 : n <= 7 ? 7 : 8; persist(); return askBudget();
    }
    const lk = low.match(/(\d+(?:\.\d+)?)\s*(l|lakh|lakhs|lac|லட்சம்)/);
    if (p.family !== undefined && p.budget === undefined && lk) {
      const amt = parseFloat(lk[1]) * 1e5;
      p.budget = Math.max(0, BUDGETS.findIndex((b) => amt <= b.hi)); persist(); return askUsage();
    }
    if (/^(hi|hello|hey|vanakkam|வணக்கம்)/.test(low)) return startFlow(currentChannel);
    if (/(price|vilai|விலை|rate|on.?road)/.test(low) && S.focus) return showBreakup(S.focus.m, S.focus.v);
    if (/(emi|loan)/.test(low) && S.focus) return handle(`emi:${S.focus.m}:${S.focus.v}`, { silent: true });
    if (/(compare|ஒப்பிடு)/.test(low) && S.picks.length) return handle("compare", { silent: true });
    if (/(test ?drive)/.test(low) && S.focus) return handle(`td:${S.focus.m}:${S.focus.v}`, { silent: true });
    botSay([{ k: "fallback" }]);
  }

  // ---------- WhatsApp → website handoff ----------
  function openCarFromChat(mid, vid) {
    const token = "demo." + btoa(`${mid}|${vid}|${Date.now()}`).replace(/=+$/, "");
    S.focus = { m: mid, v: vid }; persist();
    // A real build signs this token server-side (conversation + customer, 7 day expiry).
    go(`#/car/${mid}?v=${encodeURIComponent(vid)}&t=${token}`);
  }

  // ---------- chat rendering ----------
  function msgHTML(msg, skin) {
    if (msg.from === "sys") return `<div class="msg system">${fmt(t(msg.k, msg.p))}</div>`;
    const text = msg.raw != null ? msg.raw : t(msg.k, msg.p);
    const via = skin === "web" && msg.ch === "wa" ? `<span class="via">WhatsApp</span>` : "";
    let html = `<div class="msg ${msg.from}">${via}${fmt(text)}`;
    if (msg.breakup) html += breakupHTML(msg.breakup);
    if (msg.compare) html += compareChatHTML(msg.compare);
    html += `<span class="time">${msg.time || ""}</span></div>`;
    if (msg.cards) html += cardsHTML(msg.cards);
    return html;
  }
  function breakupHTML(ref) {
    const m = model(ref.m), v = variant(m, ref.v), pr = v.price;
    const rows = priceRows(pr, "13");
    return `<table class="breakup">${rows.map((r) => `<tr class="${r.cls || ""}"><td>${esc(r.label)}</td><td>${inr(r.amount)}</td></tr>`).join("")}</table>
      <div style="margin-top:6px">${fmt(t("ins33_line", { v: inr(pr.onroad33) }))}</div>
      <div style="margin-top:6px;font-size:11.5px;color:var(--muted)">${esc(t("disclaimer", { d: DATA.effectiveLabel }))}</div>`;
  }
  function compareChatHTML(list) {
    return `<div style="margin-top:6px">${list.map((x, i) => {
      const m = model(x.m), v = variant(m, x.v), sp = specOf(m);
      return `<div style="padding:5px 0;border-bottom:1px dashed var(--line)">${i + 1}. <b>${esc(carName(m, v))}</b><br><span style="font-size:12.5px;color:var(--ink-2)">${lakh(v.price.onroad13)} · ${v.fuel} · ${v.trans} · ${esc(sp.seatsLabel || "")} seats${sp.mileage ? " · " + esc(sp.mileage) : ""}</span></div>`;
    }).join("")}</div>`;
  }
  function cardsHTML(list) {
    return `<div class="car-cards">${list.map((x, i) => {
      const m = model(x.m), v = variant(m, x.v);
      const rs = reasons(m, v).map(([k, p]) => `<li>${esc(t(k, p))}</li>`).join("");
      return `<div class="car-card"><div class="ph">${photo(m)}</div><div class="bd">
        <span class="rank">${esc(t("rank", { i }))}</span>
        <h4>${esc(m.name)}</h4><span class="var">${esc(v.name)}${v.tone ? " · " + esc(v.tone) : ""} · ${esc(v.type || v.fuel)}</span>
        <div class="price">${lakh(v.price.onroad13)} <small>on-road</small></div>
        <ul>${rs}</ul>
        <button data-act="bk:${x.m}:${x.v}">${esc(t("b_breakup"))}</button></div></div>`;
    }).join("")}</div>`;
  }
  function buttonsHTML(msg, used) {
    if (!msg.buttons) return "";
    return `<div class="wa-buttons ${used ? "used" : ""}">${msg.buttons.map((b, i) =>
      `<button data-btn="${i}" class="${b.cta ? "cta" : ""}">${esc(b.text || t(b.k, b.p))}</button>`).join("")}</div>`;
  }
  function chatBody(skin) {
    let html = "";
    S.convo.forEach((msg, idx) => {
      html += msgHTML(msg, skin);
      const used = S.convo.slice(idx + 1).some((m) => m.from === "user");
      html += buttonsHTML(msg, used).replace(/data-btn="/g, `data-msg="${idx}" data-btn="`);
    });
    if (S.typing) html += `<div class="typing"><i></i><i></i><i></i></div>`;
    return html;
  }
  function renderChats() {
    document.querySelectorAll(".chat-scroll").forEach((el) => {
      el.innerHTML = (el.dataset.skin === "wa" ? `<div class="wa-day">TODAY</div>` : "") + chatBody(el.dataset.skin);
      el.scrollTop = el.scrollHeight;
    });
  }
  function bindChat(root, channel) {
    root.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-btn]");
      if (btn) {
        currentChannel = channel;
        const msg = S.convo[+btn.dataset.msg];
        const b = msg.buttons[+btn.dataset.btn];
        return handle(b.act, b);
      }
      const card = e.target.closest("button[data-act]");
      if (card) { currentChannel = channel; return handle(card.dataset.act, {}); }
    });
    const form = $("form.composer", root);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      currentChannel = channel;
      const inp = $("input", form);
      handleText(inp.value); inp.value = "";
    });
  }

  // ---------- views ----------
  const app = () => $("#app");

  function viewWhatsApp() {
    app().innerHTML = `
      <div class="wa-stage"><div class="wa-layout">
        <div class="wa-explain">
          <span class="badge">Step ① · Customer's WhatsApp</span>
          <h1>Showroom experience, inside WhatsApp.</h1>
          <p>The customer messages the MotoAI number. Like a good sales advisor, the bot asks about family, budget, usage, fuel and gear, then shortlists cars from <b>real dealer price lists</b>.</p>
          <ol>
            <li>Answer with the buttons (or type, e.g. "5", "20 lakh")</li>
            <li>Tap <b>Price breakup</b> on a car card</li>
            <li>Tap <b>View photos & full details</b>. The website opens and the chat continues there.</li>
          </ol>
          <p style="margin-top:14px;font-size:13px;color:var(--muted)">Prices: ${esc(DATA.dealer.name)}, ${esc(DATA.dealer.city)} · w.e.f. ${esc(DATA.effectiveLabel)} · ${DATA.models.length} models · ${allVariants().length} variants</p>
        </div>
        <div class="phone"><div class="phone-screen" id="wa-root">
          <div class="wa-head"><div class="wa-avatar">M</div><div class="who"><b>MotoAI · Car Advisor</b><span>online</span></div><span class="wa-verified">Business ✓</span></div>
          <div class="chat-scroll" data-skin="wa"></div>
          <form class="composer"><input placeholder="Message" aria-label="Message"><button aria-label="Send">➤</button></form>
        </div></div>
      </div></div>`;
    bindChat($("#wa-root"), "wa");
    if (!S.convo.length) startFlow("wa");
    renderChats();
  }

  function siteShell(inner, active) {
    const u = S.user;
    return `
      <div class="site">
        <header class="site-head"><div class="in">
          <a class="logo" href="#/"><span class="mk">M</span>Moto<span class="ai">AI</span></a>
          <nav class="site-nav">
            <a href="#/" class="${active === "home" ? "active" : ""}">Cars</a>
            <a href="#/compare" class="${active === "compare" ? "active" : ""}">Compare${S.compare.length ? ` (${S.compare.length})` : ""}</a>
            ${u ? `<a href="#/account" class="${active === "account" ? "active" : ""}">My garage</a>` : ""}
          </nav>
          ${u ? `<button class="user-chip" data-go="#/account"><span class="av">${u.initial}</span><span>${esc(u.name.split(" ")[0])}</span></button>`
              : `<button class="btn g-btn" data-login>${gLogo()} Sign in with Google</button>`}
        </div></header>
        ${inner}
        <footer class="site-foot"><div class="wrap">MotoAI prototype · Prices from ${esc(DATA.dealer.name)}, ${esc(DATA.dealer.city)} price lists (w.e.f. ${esc(DATA.effectiveLabel)}) · Specs marked "unverified" are indicative · Not affiliated with any manufacturer.</div></footer>
      </div>
      <div id="widget-root"></div>`;
  }
  function gLogo() {
    return `<svg class="g-logo" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
  }

  function viewHome() {
    const segs = [["all", "All"], ["hatch", "Hatchback"], ["suv", "SUV"], ["mpv", "MPV / 7-seater"], ["luxury", "Premium"], ["taxi", "Taxi / Commercial"]];
    const match = (m) => {
      const sp = specOf(m);
      switch (S.filter) {
        case "hatch": return /Hatch/i.test(sp.body);
        case "suv": return /SUV|Pickup/i.test(sp.body) && m.segment === "private";
        case "mpv": return (sp.seatsMax || 5) >= 7 && m.segment === "private";
        case "luxury": return fromPrice(m) > 40e5;
        case "taxi": return m.segment !== "private";
        default: return true;
      }
    };
    const list = DATA.models.filter(match).sort((a, b) => fromPrice(a) - fromPrice(b));
    app().innerHTML = siteShell(`
      <section class="hero"><div class="wrap">
        <div>
          <h1>${t("hero_h")}</h1>
          <p>${esc(t("hero_p"))}</p>
          <div class="cta-row">
            <button class="btn primary" data-open-chat>${esc(t("hero_cta"))}</button>
            <button class="btn wa" data-go="#/whatsapp">${esc(t("hero_wa"))}</button>
          </div>
          <div class="trust"><span>Real dealer price lists</span><span>Full on-road breakup</span><span>English · தமிழ் · Tanglish</span></div>
        </div>
        <div class="hero-card">
          <div class="q">Sample conversation</div>
          <div class="hero-chat">
            <div class="b">${esc(t("q_family"))}</div><div class="u">5 per</div>
            <div class="b">${esc(t("q_budget"))}</div><div class="u">₹18–25L</div>
            <div class="b">Top pick: <b>Hyryder Hybrid V-AT</b>, ${lakh(findPrice("hyryder", "Hybrid", "V-AT"))} on-road ✓</div>
          </div>
        </div>
      </div></section>
      <section class="section"><div class="wrap">
        <h2>All cars</h2>
        <p class="sub">${DATA.models.length} models · ${allVariants().length} variants · on-road prices for ${esc(DATA.dealer.city)}</p>
        <div class="filters">${segs.map(([k, l]) => `<button class="chip ${S.filter === k ? "active" : ""}" data-filter="${k}">${l}</button>`).join("")}</div>
        <div class="grid">${list.map(modelCard).join("") || `<div class="empty">No cars in this filter.</div>`}</div>
      </div></section>
      <section class="section" style="padding-top:0"><div class="wrap">
        <h2>How MotoAI works</h2><p class="sub">Like your most trusted friend at the showroom.</p>
        <div class="how">
          <div class="st"><div class="n">1</div><h4>Tell us about you</h4><p>Family size, budget, daily drive, fuel and gear. That's all.</p></div>
          <div class="st"><div class="n">2</div><h4>Get honest picks</h4><p>Top 3 cars with reasons, from live dealer price lists.</p></div>
          <div class="st"><div class="n">3</div><h4>See the real price</h4><p>Ex-showroom, tax, insurance, warranty, accessories, all itemised.</p></div>
          <div class="st"><div class="n">4</div><h4>Test drive & buy</h4><p>Book a slot. The showroom calls you. Pay only at the showroom.</p></div>
        </div>
      </div></section>`, "home");
    mountWidget();
  }
  function findPrice(mid, fuel, name) {
    const m = model(mid); if (!m) return 0;
    const v = m.variants.find((x) => x.fuel === fuel && x.name === name) || m.variants[0];
    return v.price.onroad13;
  }
  function modelCard(m) {
    const sp = specOf(m), saved = S.saved.includes(m.id);
    const fuels = [...new Set(m.variants.map((v) => v.fuel))].join(" / ");
    return `<a class="mcard" href="#/car/${m.id}">
      <button class="save-btn ${saved ? "on" : ""}" data-save="${m.id}" aria-label="Save">${saved ? "♥" : "♡"}</button>
      <div class="ph">${photo(m)}</div>
      <div class="bd"><div class="seg">${esc(sp.body || "")}${m.segment !== "private" ? " · Taxi/Commercial" : ""}</div>
      <h3>${esc(m.name)}</h3>
      <div class="meta">${esc(fuels)} · ${esc(sp.seatsLabel || "?")} seats · ${m.variants.length} variants</div>
      <div class="from">On-road from <b>${lakh(fromPrice(m))}</b></div></div></a>`;
  }

  function viewCar(mid, params) {
    const m = model(mid);
    if (!m) return go("#/");
    let v = variant(m, params.get("v")) || m.variants[0];
    const fromLink = params.get("t");
    if (fromLink) {
      // strip the token from the URL (as the real build would after setting a session cookie)
      history.replaceState(null, "", `#/car/${mid}?v=${encodeURIComponent(v.id)}`);
      if (!S.linked) { S.linked = true; }
      currentChannel = "web";
      push({ from: "sys", k: "handoff_sys", p: { phone: PHONE } });
      botSay([{ k: "welcome_back", p: { name: carName(m, v), price: inr(v.price.onroad13) }, buttons: [B("b_emi", `emi:${mid}:${v.id}`), B("b_compare", "compare"), B("b_td", `td:${mid}:${v.id}`)] }]);
      S.widgetOpen = true;
    }
    S.focus = { m: mid, v: v.id }; persist();
    const sp = specOf(m), pr = v.price;
    const types = [...new Set(m.variants.map((x) => x.type))];
    const ins = S.insurance;
    const rows = priceRows(pr, ins);
    const total = ins === "13" ? pr.onroad13 : pr.onroad33;
    const inCmp = S.compare.some((x) => x.m === mid && x.v === v.id);
    app().innerHTML = siteShell(`
      <div class="wrap">
        <div class="crumbs"><a href="#/">Cars</a> › ${esc(m.brand)} › ${esc(m.name)}</div>
        <div class="car-top">
          <div class="gallery">${photo(m)}<span class="note">${m.photo ? "Photo from dealer price list" : "Photo: auto-fetched in real build (approve queue)"}</span></div>
          <div class="car-info">
            <h1>${esc(m.brand)} ${esc(m.name)}</h1>
            <div class="tl">${esc(sp.tagline || "")}</div>
            <div class="badges">${sp.body ? `<span class="badge">${esc(sp.body)}</span>` : ""}<span class="badge">${esc(sp.seatsLabel || "?")} seats</span>${m.segment !== "private" ? `<span class="badge warn">Taxi / Commercial</span>` : ""}</div>
            ${types.length > 1 ? `<div class="field"><label>Powertrain</label><div class="seg-ctl">${types.map((ty) => `<button class="${ty === v.type ? "active" : ""}" data-type="${esc(ty)}">${esc(ty)}</button>`).join("")}</div></div>` : ""}
            <div class="field"><label>Variant</label><select class="inp" id="var-sel">${m.variants.filter((x) => x.type === v.type).map((x) => `<option value="${esc(x.id)}" ${x.id === v.id ? "selected" : ""}>${esc(x.name)}${x.tone ? " · " + esc(x.tone) : ""} · ${x.trans} · ${lakh(x.price.onroad13)}</option>`).join("")}</select></div>
            <div class="price-hero"><div><div class="l">On-road price · ${esc(DATA.dealer.city)}</div><div class="v">${inr(total)}</div></div><div class="x">Ex-showroom ${inr(pr.exShowroom)}<br>Suffix ${esc(v.suffix)}</div></div>
            <div class="actions">
              <button class="btn primary" data-td>Book test drive</button>
              <button class="btn" data-cmp>${inCmp ? "✓ In compare" : "+ Compare"}</button>
              <button class="btn" data-save="${m.id}">${S.saved.includes(m.id) ? "♥ Saved" : "♡ Save"}</button>
              <button class="btn ghost" data-ask>💬 Ask MotoAI</button>
            </div>
          </div>
        </div>
        <div class="two-col">
          <div class="panel">
            <h3>On-road price breakup <span class="seg-ctl"><button class="${ins === "13" ? "active" : ""}" data-ins="13">Insurance 1+3 yr</button><button class="${ins === "33" ? "active" : ""}" data-ins="33">3+3 yr</button></span></h3>
            <table class="ptable">${rows.map((r) => `<tr class="${r.cls || ""}"><td>${esc(r.label)}${r.hint ? `<span class="hint">${esc(r.hint)}</span>` : ""}</td><td>${inr(r.amount)}</td></tr>`).join("")}</table>
            ${m.pkg && m.pkg.length ? `<div style="margin-top:14px"><div class="field"><label>Accessories package includes</label></div><div class="pkg">${m.pkg.map((x) => `<span>${esc(x)}</span>`).join("")}</div></div>` : ""}
            <p class="fine">${esc(t("disclaimer", { d: DATA.effectiveLabel }))} Registration within dealership RTO jurisdiction; outstation charges extra.</p>
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            <div class="panel"><h3>Key specs <span class="badge warn">unverified · web-sourced</span></h3>
              <div class="specs">${specRows(sp, v).map(([k, val]) => `<div class="spec"><div class="k">${esc(k)}</div><div class="v">${esc(val)}</div></div>`).join("")}</div>
            </div>
            <div class="panel emi"><h3>EMI calculator</h3>
              <label class="row"><span>Down payment</span><b id="dp-v"></b></label>
              <input type="range" id="dp" min="0" max="${Math.round(total * 0.6)}" step="10000" value="${Math.round(total * 0.2 / 10000) * 10000}">
              <label class="row"><span>Tenure</span><b id="tn-v"></b></label>
              <input type="range" id="tn" min="12" max="84" step="12" value="60">
              <label class="row"><span>Interest rate</span><b id="rt-v"></b></label>
              <input type="range" id="rt" min="7" max="13" step="0.25" value="9">
              <div class="out"><span>Monthly EMI (indicative)</span><b id="emi-out"></b></div>
            </div>
          </div>
        </div>
      </div>`, "car");

    const upd = () => {
      const dp = +$("#dp").value, tn = +$("#tn").value, rt = +$("#rt").value;
      $("#dp-v").textContent = inr(dp); $("#tn-v").textContent = tn / 12 + " yrs"; $("#rt-v").textContent = rt + "%";
      $("#emi-out").textContent = inr(emi(total - dp, rt, tn));
    };
    ["dp", "tn", "rt"].forEach((id) => $("#" + id).addEventListener("input", upd)); upd();
    $("#var-sel").addEventListener("change", (e) => go(`#/car/${mid}?v=${encodeURIComponent(e.target.value)}`));
    app().querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => {
      const nv = m.variants.find((x) => x.type === b.dataset.type); go(`#/car/${mid}?v=${encodeURIComponent(nv.id)}`);
    }));
    app().querySelectorAll("[data-ins]").forEach((b) => b.addEventListener("click", () => { S.insurance = b.dataset.ins; viewCar(mid, new URLSearchParams(`v=${v.id}`)); }));
    $("[data-cmp]").addEventListener("click", () => {
      if (inCmp) S.compare = S.compare.filter((x) => !(x.m === mid && x.v === v.id));
      else { S.compare.push({ m: mid, v: v.id }); if (S.compare.length > 3) S.compare.shift(); toast("Added to compare"); }
      persist(); viewCar(mid, new URLSearchParams(`v=${v.id}`));
    });
    $("[data-td]").addEventListener("click", () => testDriveModal(m, v));
    $("[data-ask]").addEventListener("click", () => {
      S.widgetOpen = true; currentChannel = "web";
      botSay([{ k: "page_context", p: { name: carName(m, v) }, buttons: [B("b_breakup", `pgbk:${mid}:${v.id}`), B("b_find_variant", "find"), B("b_td", `td:${mid}:${v.id}`)] }]);
      mountWidget();
    });
    mountWidget();
  }

  function priceRows(pr, ins) {
    const rows = [
      { label: "Ex-showroom price", amount: pr.exShowroom },
      { label: "TCS @1% on ex-showroom", amount: pr.tcs },
      { label: "Life tax, registration & FASTag", amount: pr.taxReg },
      { label: ins === "13" ? "Insurance (1 yr own damage + 3 yr third party)" : "Insurance (3 yr own damage + 3 yr third party)", amount: ins === "13" ? pr.ins13 : pr.ins33 },
    ];
    if (pr.ew) rows.push({ label: "Extended warranty", amount: pr.ew, hint: pr.ewLabel || "" });
    if (pr.servicePack) rows.push({ label: "Value service pack", amount: pr.servicePack });
    if (pr.accessories) rows.push({ label: "Accessories package", amount: pr.accessories });
    (pr.extras || []).forEach((x) => rows.push({ label: x.label, amount: x.amount }));
    if (pr.ceramic) rows.push({ label: "Ceramic coating", amount: pr.ceramic });
    if (pr.underbody) rows.push({ label: "Underbody & silencer coating", amount: pr.underbody });
    rows.push({ label: "On-road price", amount: ins === "13" ? pr.onroad13 : pr.onroad33, cls: "total" });
    return rows;
  }
  function specRows(sp, v) {
    const r = [["Fuel", v.fuel], ["Transmission", v.trans === "AT" ? "Automatic" : "Manual"], ["Seats", sp.seatsLabel || "–"]];
    if (sp.engine) r.push(["Engine", sp.engine]);
    if (sp.mileage) r.push(["Mileage", sp.mileage]);
    if (sp.safety) r.push(["Safety", sp.safety]);
    if (sp.boot) r.push(["Boot", sp.boot]);
    if (sp.drive) r.push(["Drive", sp.drive]);
    return r;
  }

  function viewCompare() {
    const items = S.compare.map((x) => ({ m: model(x.m), v: variant(model(x.m), x.v) })).filter((x) => x.m && x.v);
    if (!items.length) {
      app().innerHTML = siteShell(`<div class="wrap section"><h2>Compare</h2><div class="empty">No cars selected yet. Open any car and tap <b>+ Compare</b>, or ask MotoAI to compare its picks.</div></div>`, "compare");
      return mountWidget();
    }
    const minP = Math.min(...items.map((x) => x.v.price.onroad13));
    const row = (label, fn, bestFn) => `<tr><th>${label}</th>${items.map((x) => { const val = fn(x); const best = bestFn && bestFn(x); return `<td class="${best ? "best" : ""}">${val}</td>`; }).join("")}</tr>`;
    app().innerHTML = siteShell(`<div class="wrap section"><h2>Compare</h2><p class="sub">On-road prices with 1+3 insurance · ${esc(DATA.dealer.city)}</p>
      <div class="cmp-wrap"><table class="cmp">
        <tr><th></th>${items.map((x) => `<td class="hd">${x.m.photo ? `<img src="${x.m.photo}" alt="">` : ""}<b>${esc(x.m.name)}</b><br><span style="color:var(--muted);font-size:13px">${esc(x.v.name)}${x.v.tone ? " · " + esc(x.v.tone) : ""}</span><br><button class="btn sm" data-rm="${x.m.id}|${esc(x.v.id)}" style="margin-top:6px">Remove</button></td>`).join("")}</tr>
        ${row("On-road price", (x) => inr(x.v.price.onroad13), (x) => x.v.price.onroad13 === minP)}
        ${row("With 3+3 insurance", (x) => inr(x.v.price.onroad33))}
        ${row("Ex-showroom", (x) => inr(x.v.price.exShowroom))}
        ${row("Powertrain", (x) => esc(x.v.type || x.v.fuel))}
        ${row("Fuel · Gear", (x) => `${x.v.fuel} · ${x.v.trans === "AT" ? "Automatic" : "Manual"}`)}
        ${row("Seats", (x) => esc(specOf(x.m).seatsLabel || "–"))}
        ${row("Body", (x) => esc(specOf(x.m).body || "–"))}
        ${row("Mileage*", (x) => esc(specOf(x.m).mileage || "–"))}
        ${row("Engine*", (x) => esc(specOf(x.m).engine || "–"))}
        ${row("Accessories pkg", (x) => x.v.price.accessories ? inr(x.v.price.accessories) : "–")}
        <tr><th></th>${items.map((x) => `<td><a class="btn sm primary" href="#/car/${x.m.id}?v=${encodeURIComponent(x.v.id)}">View</a></td>`).join("")}</tr>
      </table></div><p class="fine">* unverified, web-sourced specs</p></div>`, "compare");
    app().querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
      const [mm, vv] = b.dataset.rm.split("|"); S.compare = S.compare.filter((x) => !(x.m === mm && x.v === vv)); persist(); viewCompare();
    }));
    mountWidget();
  }

  function viewAccount() {
    if (!S.user) { loginModal(() => go("#/account")); return go("#/"); }
    const waCount = S.convo.filter((m) => m.ch === "wa").length, webCount = S.convo.filter((m) => m.ch === "web").length;
    app().innerHTML = siteShell(`<div class="wrap section"><h2>Hi ${esc(S.user.name.split(" ")[0])} 👋</h2><p class="sub">${esc(S.user.email)} · WhatsApp ${S.linked ? "linked " + PHONE : "not linked yet"}</p>
      <div class="acct-grid">
        <div class="panel"><h3>Saved cars</h3>${S.saved.length ? `<div class="grid" style="grid-template-columns:1fr">${S.saved.map((id) => model(id)).filter(Boolean).map(modelCard).join("")}</div>` : `<div class="empty">Tap ♡ on any car to save it.</div>`}</div>
        <div class="panel"><h3>My conversation</h3>
          <p class="fine" style="margin-top:0">One conversation across WhatsApp and the website.</p>
          <div class="thread"><span class="ch">WhatsApp</span><span style="flex:1">${waCount} messages</span></div>
          <div class="thread"><span class="ch web">Website</span><span style="flex:1">${webCount} messages</span></div>
          <button class="btn primary" data-open-chat style="margin-top:6px">Open chat</button>
          <h3 style="margin-top:18px">Test drive requests</h3>
          ${S.drives.length ? S.drives.map((d) => { const m = model(d.m), v = variant(m, d.v); return `<div class="thread"><span class="ch web">Requested</span><span style="flex:1"><b>${esc(carName(m, v))}</b><br><small>${esc(t(d.slot))}</small></span></div>`; }).join("") : `<div class="empty" style="padding:16px">None yet.</div>`}
          <button class="btn sm" data-logout style="margin-top:10px">Sign out</button>
        </div>
      </div></div>`, "account");
    $("[data-logout]").addEventListener("click", () => { S.user = null; persist(); go("#/"); });
    mountWidget();
  }

  // ---------- widget ----------
  function mountWidget() {
    const root = $("#widget-root");
    if (!root) return;
    const unread = !S.widgetOpen && S.convo.length > 0;
    root.innerHTML = S.widgetOpen ? `
      <div class="widget" id="w-root">
        <div class="w-head"><div class="wa-avatar">M</div><div class="who"><b>MotoAI</b><span>Car advisor · replies instantly</span></div><button data-close aria-label="Close">✕</button></div>
        ${S.linked ? `<div class="w-link">🔗 Same conversation as your WhatsApp chat (${PHONE})</div>` : ""}
        <div class="chat-scroll" data-skin="web"></div>
        <form class="composer"><input placeholder="Ask anything about cars…" aria-label="Message"><button aria-label="Send">➤</button></form>
      </div>` : `${unread ? `<div class="fab-hint">Continue where you left off 👋</div>` : ""}`;
    root.insertAdjacentHTML("beforeend", `<button class="fab" data-fab aria-label="Chat with MotoAI">${S.widgetOpen ? "✕" : "💬"}${unread ? `<span class="dot"></span>` : ""}</button>`);
    $("[data-fab]", root).addEventListener("click", toggleWidget);
    if (S.widgetOpen) {
      bindChat($("#w-root"), "web");
      $("[data-close]", root).addEventListener("click", toggleWidget);
      if (!S.convo.length) startFlow("web");
      renderChats();
    }
  }
  function toggleWidget() { S.widgetOpen = !S.widgetOpen; mountWidget(); }

  // ---------- modals ----------
  function modal(html, onMount) {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal">${html}</div>`;
    bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
    onMount && onMount(bg, () => bg.remove());
  }
  function loginModal(after) {
    modal(`<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">${gLogo()}<b>Sign in with Google</b></div>
      <h3>Choose an account</h3><p>to continue to MotoAI</p>
      <button class="g-acct" data-acc><span class="av">${DEMO_USER.initial}</span><span><b>${DEMO_USER.name}</b><small>${DEMO_USER.email}</small></span></button>
      <button class="g-acct" data-acc><span class="av" style="background:var(--line)">+</span><span>Use another account</span></button>
      <p class="fine">Prototype: no real Google sign-in happens. The real build uses Auth.js (Google provider).</p>`, (bg, close) => {
      bg.querySelectorAll("[data-acc]").forEach((b) => b.addEventListener("click", () => {
        S.user = DEMO_USER; persist(); close(); toast(`Signed in as ${DEMO_USER.name}`);
        after ? after() : route();
      }));
    });
  }
  function testDriveModal(m, v) {
    let slot = null;
    modal(`<h3>Book a test drive</h3><p>${esc(carName(m, v))} · ${esc(DATA.dealer.name)}, ${esc(DATA.dealer.city)}</p>
      <div class="field"><label>Pick a slot</label></div>
      <div class="slots">${["slot1", "slot2", "slot3"].map((s) => `<button data-slot="${s}">${esc(t(s))}</button>`).join("")}</div>
      <div class="field"><label>Mobile</label><input class="inp" value="${S.linked ? PHONE : ""}" placeholder="+91"></div>
      <button class="btn primary" data-ok style="width:100%;justify-content:center">Request test drive</button>
      <p class="fine">The showroom calls you to confirm. No payment needed.</p>`, (bg, close) => {
      bg.querySelectorAll("[data-slot]").forEach((b) => b.addEventListener("click", () => {
        slot = b.dataset.slot; bg.querySelectorAll("[data-slot]").forEach((x) => x.classList.toggle("active", x === b));
      }));
      $("[data-ok]", bg).addEventListener("click", () => {
        if (!slot) return toast("Pick a slot first");
        S.drives.push({ m: m.id, v: v.id, slot, at: Date.now() }); persist(); close();
        toast("Test drive requested ✓");
        if (!S.user) setTimeout(() => loginModal(), 600);
      });
    });
  }

  // ---------- routing ----------
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function route() {
    const h = location.hash || "#/whatsapp";
    const [path, qs] = h.slice(1).split("?");
    const params = new URLSearchParams(qs || "");
    const parts = path.split("/").filter(Boolean);
    document.querySelectorAll(".demo-steps button").forEach((b) => b.classList.toggle("active", b.dataset.step === (parts[0] || "home")));
    window.scrollTo(0, 0);
    if (parts[0] === "whatsapp") return viewWhatsApp();
    if (parts[0] === "car") return viewCar(parts[1], params);
    if (parts[0] === "compare") return viewCompare();
    if (parts[0] === "account") return viewAccount();
    return viewHome();
  }

  // global clicks (site)
  document.addEventListener("click", (e) => {
    const goEl = e.target.closest("[data-go]");
    if (goEl) { e.preventDefault(); return go(goEl.dataset.go); }
    if (e.target.closest("[data-login]")) return loginModal();
    const sv = e.target.closest("[data-save]");
    if (sv) {
      e.preventDefault(); e.stopPropagation();
      if (!S.user) return loginModal();
      const id = sv.dataset.save;
      S.saved = S.saved.includes(id) ? S.saved.filter((x) => x !== id) : [...S.saved, id];
      persist(); toast(S.saved.includes(id) ? "Saved to My garage" : "Removed"); return route();
    }
    const f = e.target.closest("[data-filter]");
    if (f) { S.filter = f.dataset.filter; return viewHome(); }
    if (e.target.closest("[data-open-chat]")) { S.widgetOpen = true; currentChannel = "web"; return mountWidget(); }
  });

  // demo bar
  function initDemoBar() {
    document.querySelectorAll(".lang-switch button").forEach((b) => {
      b.classList.toggle("active", b.dataset.lang === S.lang);
      b.addEventListener("click", () => {
        S.lang = b.dataset.lang; persist();
        document.querySelectorAll(".lang-switch button").forEach((x) => x.classList.toggle("active", x === b));
        route();
      });
    });
    $("[data-reset]").addEventListener("click", () => {
      ["convo", "profile", "picks", "focus", "compare", "drives", "linked", "saved", "user"].forEach((k) => store.set(k, null));
      S.convo = []; S.profile = {}; S.picks = []; S.focus = null; S.compare = []; S.drives = []; S.linked = false; S.saved = []; S.user = null; S.widgetOpen = false;
      go("#/whatsapp");
    });
  }

  window.addEventListener("hashchange", route);
  initDemoBar();
  route();
})();
