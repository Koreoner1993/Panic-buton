// Panic Button — Demo Bot + Wallet Connect (Phantom) + Wallet UX polish
// Safe: no transactions, no real swaps. Connect wallet + simulate bot behavior.

// ---------- helpers ----------
const el = (id) => document.getElementById(id);

const state = {
  demo: true,
  running: false,
  panicLevel: 0,
  cooldownSec: 90,
  timer: null,
  profitPct: 0,     // simulated
  halted: false,    // cooled down after PANIC / auto-stop

  provider: null,   // detected Solana wallet provider
  pubkey: null,     // connected address string
};

function now() {
  return new Date().toLocaleTimeString();
}

function log(msg, cls = "") {
  const box = el("log");
  if (!box) return;
  const line = document.createElement("div");
  line.className = cls;
  line.innerHTML = `[${now()}] ${msg}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function shortAddr(a) {
  if (!a) return "—";
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

// ---------- UI setters ----------
function setWalletUIConnected(connected) {
  const walletPill = el("walletPill");
  const addrText = el("addrText");

  if (walletPill) walletPill.textContent = connected ? "Wallet: Connected" : "Wallet: Not Connected";
  if (addrText) addrText.textContent = connected ? shortAddr(state.pubkey) : "—";

  const modePill = el("modePill");
  if (modePill) modePill.textContent = state.demo ? "Mode: Demo" : "Mode: Live";
}

function setDemoMode(on) {
  state.demo = on;
  const modePill = el("modePill");
  if (modePill) modePill.textContent = on ? "Mode: Demo" : "Mode: Live";
  log(on ? "DEMO enabled (simulated scanning + trades)" : "LIVE selected (connected wallet; trades still simulated)", "hot");
}

function setPanicLevel(n) {
  state.panicLevel = n;
  const pl = el("panicLevel");
  if (pl) pl.textContent = String(n);

  // Pulse panic button when >= 3, unless cooled down (halted)
  const btn = el("panicBtn");
  if (!btn) return;

  if (state.halted) {
    btn.classList.remove("is-hot");
    return;
  }
  if (n >= 3) btn.classList.add("is-hot");
  else btn.classList.remove("is-hot");
}

// ---------- bot controls ----------
function stopBot(reason = "Stopped") {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.running = false;
  log(`STOP — ${reason}`, "bad");
}

function startBot() {
  if (state.running) return;

  // un-cool when starting again
  state.halted = false;
  const btn = el("panicBtn");
  if (btn) {
    btn.classList.remove("is-cooled");
    btn.classList.remove("is-hot");
  }

  state.running = true;
  log(`START — bot running (cooldown ${state.cooldownSec}s)`, "ok");

  tick(); // run once immediately
  state.timer = setInterval(tick, state.cooldownSec * 1000);
}

// ---------- demo “intel feed” (tokens only) ----------
function randomToken() {
  const a = ["PANIC", "RUG", "BUTTON", "CHAOS", "SIREN", "DEGEN", "RED", "FOMO", "MINT", "GOD"];
  const b = ["CAT", "DOG", "AI", "COIN", "FROG", "PUMP", "PRINT", "DRAIN", "MOON", "DUST"];
  return `${a[Math.floor(Math.random() * a.length)]}-${b[Math.floor(Math.random() * b.length)]}`;
}

function scorePanic() {
  const r = Math.random();
  if (r < 0.45) return 0;
  if (r < 0.70) return 1;
  if (r < 0.88) return 2;
  if (r < 0.97) return 3;
  return 4;
}

function quoteOk() {
  return Math.random() > 0.2; // 80% pass
}

function tick() {
  if (!state.running || state.halted) return;

  const token = randomToken();
  const lvl = scorePanic();
  setPanicLevel(lvl);

  log(`NEW — ${token} → Panic ${lvl}`, "hot");

  if (lvl >= 3) {
    if (!quoteOk()) {
      log("QUOTE — $1 USDC route looks trash. skip.", "bad");
      return;
    }

    // simulate 1 trade
    const pnl = (Math.random() * 8 - 3).toFixed(2); // -3% to +5%
    state.profitPct += Number(pnl);
    log(`TRADE — $1 USDC → ${token} | PnL ${pnl}%`, Number(pnl) >= 0 ? "ok" : "bad");

    // auto-stop at +65% profit (simulated)
    if (state.profitPct >= 65) {
      stopBot("AUTO-STOP hit +65% (simulated).");
      state.halted = true;
      const btn = el("panicBtn");
      if (btn) {
        btn.classList.remove("is-hot");
        btn.classList.add("is-cooled");
      }
      log("AUTO — cooled down.", "hot");
    }
  }
}

// ---------- PANIC ----------
function panic() {
  stopBot("PANIC BUTTON PRESSED — rugged yourself.");
  state.halted = true;
  setPanicLevel(0);

  const btn = el("panicBtn");
  if (btn) {
    btn.classList.remove("is-hot");
    btn.classList.add("is-cooled");
  }
  log("PANIC — bot halted. (cooled down)", "bad");
}

// ---------- wallet provider detection (robust) ----------
// handles:
// - window.phantom.solana
// - window.solana
// - window.solana.providers (multi-wallet)
function getSolanaProviderPreferPhantom() {
  const w = window;
  const candidates = [];

  if (w?.phantom?.solana) candidates.push(w.phantom.solana);
  if (w?.solana) candidates.push(w.solana);
  if (Array.isArray(w?.solana?.providers)) candidates.push(...w.solana.providers);

  const filtered = candidates.filter(Boolean);
  const phantom = filtered.find((p) => p?.isPhantom);
  return phantom || filtered[0] || null;
}

function logProviderDebug() {
  const hasPhantom = !!window?.phantom?.solana;
  const hasSolana = !!window?.solana;
  const providersCount = Array.isArray(window?.solana?.providers) ? window.solana.providers.length : 0;

  log(
    `DEBUG — window.phantom.solana: ${hasPhantom ? "YES" : "NO"} | window.solana: ${hasSolana ? "YES" : "NO"} | providers: ${providersCount}`,
    "hot"
  );

  console.log("window.phantom:", window.phantom);
  console.log("window.solana:", window.solana);
}

// ---------- wallet UX ----------
function enableCopyAddress() {
  const addrEl = el("addrText");
  if (!addrEl) return;

  addrEl.addEventListener("click", async () => {
    if (!state.pubkey) return;
    try {
      await navigator.clipboard.writeText(state.pubkey);
      log("WALLET — address copied", "ok");
    } catch (e) {
      log("WALLET — copy failed", "bad");
      console.error(e);
    }
  });
}

// Phantom/Solana network check (genesis hash)
async function checkNetwork() {
  const statusEl = el("networkStatus");
  if (!statusEl || !state.provider?.request) return;

  try {
    const genesisHash = await state.provider.request({ method: "getGenesisHash" });
    const MAINNET_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

    if (genesisHash === MAINNET_HASH) {
      statusEl.textContent = "Network: Mainnet";
      statusEl.className = "row small net-ok";
      log("NETWORK — mainnet detected", "ok");
    } else {
      statusEl.textContent = "Network: Not Mainnet";
      statusEl.className = "row small net-warn";
      log("NETWORK — not mainnet (devnet/testnet?)", "hot");
    }
  } catch (e) {
    statusEl.textContent = "Network: Unknown";
    statusEl.className = "row small muted";
    log("NETWORK — unknown (provider did not respond)", "bad");
    console.error(e);
  }
}

function disconnectWallet() {
  try {
    state.provider?.disconnect?.();
  } catch {}

  state.pubkey = null;
  state.provider = null;

  stopBot("Disconnected");
  setDemoMode(true);
  setWalletUIConnected(false);

  const statusEl = el("networkStatus");
  if (statusEl) {
    statusEl.textContent = "Network: —";
    statusEl.className = "row small muted";
  }

  log("WALLET — disconnected", "hot");
}

// ---------- connect wallet ----------
async function connectWallet() {
  const provider = getSolanaProviderPreferPhantom();

  logProviderDebug();

  if (!provider) {
    log("WALLET — no Solana wallet detected.", "bad");
    alert(
      "No Solana wallet detected.\n\n" +
      "Desktop: Install Phantom extension in Chrome/Brave/Edge.\n" +
      "Mobile: Open this site inside Phantom's in-app browser."
    );
    return;
  }

  state.provider = provider;

  try {
    const resp = await provider.connect();
    const pk =
      resp?.publicKey?.toString?.() ||
      provider?.publicKey?.toString?.() ||
      null;

    state.pubkey = pk;

    setDemoMode(false);
    setWalletUIConnected(!!state.pubkey);
    log(`WALLET — connected: <span class="mono">${state.pubkey}</span>`, "ok");

    // network check after connect
    await checkNetwork();
  } catch (e) {
    log("WALLET — connect cancelled or failed.", "bad");
    console.error(e);
  }
}

// optional eager connect if previously trusted
async function eagerConnectIfTrusted() {
  const provider = getSolanaProviderPreferPhantom();
  if (!provider?.connect) return;

  try {
    const resp = await provider.connect({ onlyIfTrusted: true });
    const pk =
      resp?.publicKey?.toString?.() ||
      provider?.publicKey?.toString?.() ||
      null;

    if (pk) {
      state.provider = provider;
      state.pubkey = pk;

      setDemoMode(false);
      setWalletUIConnected(true);
      log(`WALLET — trusted connect: <span class="mono">${state.pubkey}</span>`, "ok");

      await checkNetwork();
    }
  } catch {
    // ignore
  }
}

// ---------- boot ----------
function boot() {
  // initial UI
  setDemoMode(true);
  setWalletUIConnected(false);
  setPanicLevel(0);

  // cooldown slider
  const slider = el("cooldown");
  if (slider) {
    const v = Number(slider.value || 90);
    state.cooldownSec = v;
    const cv = el("cooldownVal");
    if (cv) cv.textContent = String(v);

    slider.addEventListener("input", (e) => {
      state.cooldownSec = Number(e.target.value);
      const cv2 = el("cooldownVal");
      if (cv2) cv2.textContent = String(state.cooldownSec);

      if (state.running) {
        stopBot("cooldown changed — restarting");
        startBot();
      }
    });
  }

  // buttons
  el("connectBtn")?.addEventListener("click", connectWallet);
  el("connectBtn2")?.addEventListener("click", connectWallet);

  el("demoBtn")?.addEventListener("click", () => setDemoMode(true));

  el("startBtn")?.addEventListener("click", startBot);
  el("stopBtn")?.addEventListener("click", () => stopBot("Stopped by user"));

  el("panicBtn")?.addEventListener("click", panic);

  // wallet UX
  enableCopyAddress();
  el("disconnectBtn")?.addEventListener("click", disconnectWallet);

  log("BOOT — press START for demo scans. Connect Phantom to show wallet.", "hot");

  eagerConnectIfTrusted();
}

boot();

/* =========================
   RADAR — 100Hrs Panic Window (DISPLAY ONLY)
   DexScreener polling + localStorage cache
   Does NOT affect bot logic.
========================= */

(function RadarDisplayOnly(){
  const HOUR = 60 * 60 * 1000;
  const RADAR_WINDOW_MS = 100 * HOUR;
  const RADAR_KEY = "panic_radar_cache_v1";
  const POLL_MS = 120 * 1000; // 2 minutes (safe)

  const $ = (id) => document.getElementById(id);

  function radarExists(){
    return !!$("radarList") && !!$("radarBest");
  }

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function compactUsd(n){
    const v = Number(n || 0);
    if (!Number.isFinite(v)) return "$0";
    if (v >= 1e9) return `$${(v/1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v/1e6).toFixed(2)}M`;
    if (v >= 1e3) return `$${(v/1e3).toFixed(2)}K`;
    return `$${v.toFixed(0)}`;
  }

  function pct(n){
    const v = Number(n);
    if (!Number.isFinite(v)) return "0%";
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(2)}%`;
  }

  function panicLabel(level){
    return ["Asleep","Twitching","Sweaty","Redline","Full Panic"][level] || "Asleep";
  }

  function levelFromScore(score){
    if (score < 20) return 0;
    if (score < 40) return 1;
    if (score < 60) return 2;
    if (score < 80) return 3;
    return 4;
  }

  function normLog(x, min, max){
    const v = Math.max(0, Number(x || 0));
    const l = Math.log10(v + 1);
    const lmin = Math.log10(min + 1);
    const lmax = Math.log10(max + 1);
    if (lmax === lmin) return 0;
    return clamp((l - lmin) / (lmax - lmin), 0, 1);
  }

  function isUSDCQuote(pair){
    const q = pair?.quoteToken?.symbol?.toUpperCase?.() || "";
    return q === "USDC";
  }

  function scorePair(p){
    const liq = Number(p?.liquidity?.usd || 0);
    const vol24 = Number(p?.volume?.h24 || 0);

    const ch1 = Number(p?.priceChange?.h1 || 0);
    const ch6 = Number(p?.priceChange?.h6 || 0);
    const ch24 = Number(p?.priceChange?.h24 || 0);

    const liqN = normLog(liq, 5_000, 2_000_000);
    const volN = normLog(vol24, 20_000, 20_000_000);

    const momRaw = (ch1 * 0.55) + (ch6 * 0.35) + (ch24 * 0.10);
    const momN = clamp((momRaw + 20) / 80, 0, 1);

    let score = (volN * 0.48 + liqN * 0.37 + momN * 0.15) * 100;

    if (liq < 20_000) score *= 0.25;
    else if (liq < 50_000) score *= 0.65;

    return clamp(score, 0, 100);
  }

  function loadCache(){
    try {
      const raw = localStorage.getItem(RADAR_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      return {};
    }
  }

  function saveCache(cache){
    try { localStorage.setItem(RADAR_KEY, JSON.stringify(cache)); } catch {}
  }

  function prune(cache){
    const cutoff = Date.now() - RADAR_WINDOW_MS;
    for (const k of Object.keys(cache)) {
      if (!cache[k]?.ts || cache[k].ts < cutoff) delete cache[k];
    }
    return cache;
  }

  function itemsFromCache(cache){
    const arr = [];
    for (const k of Object.keys(cache)) {
      const it = cache[k]?.item;
      if (it) arr.push(it);
    }
    return arr;
  }

  function sortRadar(items){
    // USDC-first, then highest score
    return items.sort((a,b) => {
      const aU = a.usdcQuote ? 1 : 0;
      const bU = b.usdcQuote ? 1 : 0;
      if (aU !== bU) return bU - aU;
      return (b.score - a.score);
    });
  }

  function escapeHtml(s){
    return String(s || "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  function rowHTML(it){
    const lvl = it.panicLevel;
    const meta = `liq ${compactUsd(it.liquidityUsd)} · vol24 ${compactUsd(it.volume24h)} · 1h ${pct(it.change1h)}`;

    return `
      <div class="radarRow">
        <div class="radarRow__left">
          <div class="radarName">${escapeHtml(it.name)}</div>
          <div class="radarMeta">${escapeHtml(meta)}</div>
        </div>
        <div class="radarRow__right">
          <span class="panicBadge panic${lvl}" title="${escapeHtml(panicLabel(lvl))}">${lvl}</span>
          <a class="radarBtnLink" href="${escapeHtml(it.url)}" target="_blank" rel="noreferrer">View</a>
        </div>
      </div>
    `;
  }

  function render(items){
    if (!radarExists()) return;

    const list = $("radarList");
    const best = $("radarBest");

    if (!items || items.length === 0) {
      list.innerHTML = `<div class="muted small">Radar is asleep. Hit Refresh.</div>`;
      best.textContent = "—";
      return;
    }

    const top = items[0];
    best.textContent = `${top.name} (Panic ${top.panicLevel} — ${panicLabel(top.panicLevel)})`;
    list.innerHTML = items.slice(0,5).map(rowHTML).join("");
  }

  async function fetchJSON(url, timeoutMs = 12000){
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  function uniq(arr){ return Array.from(new Set(arr.filter(Boolean))); }

  function chunk(arr, size){
    const out = [];
    for (let i=0; i<arr.length; i+=size) out.push(arr.slice(i,i+size));
    return out;
  }

  function normalizePair(pair){
    const baseSym = pair?.baseToken?.symbol || "TOKEN";
    const quoteSym = pair?.quoteToken?.symbol || "PAIR";
    const name = `${baseSym}/${quoteSym}`;

    const liq = Number(pair?.liquidity?.usd || 0);
    const vol24 = Number(pair?.volume?.h24 || 0);

    const score = scorePair(pair);
    const panicLevel = levelFromScore(score);

    return {
      pairAddress: pair?.pairAddress || "",
      name,
      url: pair?.url || "",
      liquidityUsd: liq,
      volume24h: vol24,
      change1h: Number(pair?.priceChange?.h1 || 0),
      score,
      panicLevel,
      usdcQuote: isUSDCQuote(pair),
      ts: Date.now(),
    };
  }

  async function refresh(userTriggered=false){
    if (!radarExists()) return;

    // show cached immediately
    let cache = prune(loadCache());
    saveCache(cache);
    render(sortRadar(itemsFromCache(cache)));

    if (userTriggered && typeof log === "function") log("RADAR — manual refresh (100Hrs Panic Window)", "hot");

    try {
      // discovery: boosts top
      const boosts = await fetchJSON("https://api.dexscreener.com/token-boosts/top/v1");
      const addrs = uniq((Array.isArray(boosts) ? boosts : []).map(x => x?.tokenAddress || x?.address || x?.token?.address)).slice(0, 90);

      if (addrs.length === 0) {
        if (typeof log === "function") log("RADAR — no candidates returned (DexScreener)", "bad");
        return;
      }

      // enrich: tokens/v1/solana/<addresses up to 30>
      const chunks = chunk(addrs, 30);
      const pairsAll = [];

      for (const c of chunks) {
        const url = `https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(c.join(","))}`;
        try {
          const pairs = await fetchJSON(url);
          if (Array.isArray(pairs)) pairsAll.push(...pairs);
        } catch (e) {
          if (typeof log === "function") log("RADAR — partial fetch failed. continuing.", "bad");
          console.error(e);
        }
        await new Promise(r => setTimeout(r, 250));
      }

      let added = 0;
      for (const pair of pairsAll) {
        if (!pair?.pairAddress) continue;
        const item = normalizePair(pair);
        cache[item.pairAddress] = { ts: Date.now(), item };
        added++;
      }

      cache = prune(cache);
      saveCache(cache);

      let items = itemsFromCache(cache).filter(it => it.liquidityUsd > 0 && it.volume24h > 0);
      items = sortRadar(items);

      render(items);

      if (typeof log === "function") {
        log(`RADAR — updated ${added} pairs · window 100h`, "ok");
        if (items[0]) {
          const b = items[0];
          log(`LOCK — Best Pick: ${b.name} | Panic ${b.panicLevel} (${panicLabel(b.panicLevel)}) | liq ${compactUsd(b.liquidityUsd)} | vol24 ${compactUsd(b.volume24h)}`, "hot");
        }
      }
    } catch (e) {
      console.error(e);
      if (typeof log === "function") log("RADAR — refresh failed (DexScreener). Try again.", "bad");
    }
  }

  function clear(){
    try { localStorage.removeItem(RADAR_KEY); } catch {}
    if (typeof log === "function") log("RADAR — cache cleared (100h wiped).", "hot");
    if (radarExists()) render([]);
  }

  // Hook buttons safely
  function init(){
    if (!radarExists()) return;

    // paint cache on load
    let cache = prune(loadCache());
    saveCache(cache);
    render(sortRadar(itemsFromCache(cache)));

    $("radarRefreshBtn")?.addEventListener("click", () => refresh(true));
    $("radarClearBtn")?.addEventListener("click", clear);

    // poll quietly
    refresh(false);
    setInterval(() => refresh(false), POLL_MS);
  }

  // init after DOM is ready (but safe even if already ready)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();



