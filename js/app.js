// Panic Button — Wallet + Vault (USDC demo) + Demo Bot + Radar (100Hrs display)
// Safe: no transactions, no real swaps. UI + simulated behavior only.

// ---------- helpers ----------
const el = (id) => document.getElementById(id);

const state = {
  // bot
  demo: true,
  running: false,
  panicLevel: 0,
  cooldownSec: 90,
  timer: null,
  profitPct: 0,
  halted: false,

  // wallet
  provider: null,
  pubkey: null,

  // vault (SIMULATED)
  vaultUSDC: 0,
  maxVaultUSDC: 10,
  tradeSizeUSDC: 1,
  activeTrade: false,
};

function now() { return new Date().toLocaleTimeString(); }

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

function money(n) {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// ---------- UI setters ----------
function setWalletUIConnected(connected) {
  const walletPill = el("walletPill");
  const addrText = el("addrText");
  const modePill = el("modePill");

  if (walletPill) walletPill.textContent = connected ? "Wallet: Connected" : "Wallet: Not Connected";
  if (addrText) addrText.textContent = connected ? shortAddr(state.pubkey) : "—";
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

  const btn = el("panicBtn");
  if (!btn) return;

  if (state.halted) {
    btn.classList.remove("is-hot");
    return;
  }
  if (n >= 3) btn.classList.add("is-hot");
  else btn.classList.remove("is-hot");
}

// ---------- Vault UI + logic (SIM) ----------
function setVaultUI() {
  const bal = el("vaultBalance");
  if (bal) bal.textContent = money(state.vaultUSDC);

  const canUseVault = !!state.pubkey;

  const depositBtn = el("depositBtn");
  const withdrawBtn = el("withdrawBtn");
  const maxBtn = el("maxDepositBtn");
  const depositAmt = el("depositAmt");

  // enable/disable
  if (depositBtn) depositBtn.disabled = !canUseVault;
  if (withdrawBtn) withdrawBtn.disabled = !canUseVault;
  if (maxBtn) maxBtn.disabled = !canUseVault;
  if (depositAmt) depositAmt.disabled = !canUseVault;

  // opacity (nice UX)
  const op = canUseVault ? "1" : ".55";
  if (depositBtn) depositBtn.style.opacity = op;
  if (withdrawBtn) withdrawBtn.style.opacity = op;
  if (maxBtn) maxBtn.style.opacity = op;
  if (depositAmt) depositAmt.style.opacity = op;
}

function getDepositInput() {
  const raw = Number(el("depositAmt")?.value || 0);
  if (!Number.isFinite(raw)) return 0;
  return raw;
}

function setDepositInput(val) {
  const input = el("depositAmt");
  if (!input) return;
  input.value = Number(val).toFixed(2);
}

function maxDepositRemaining() {
  return clamp(state.maxVaultUSDC - state.vaultUSDC, 0, state.maxVaultUSDC);
}

function depositUSDC() {
  if (!state.pubkey) {
    log("VAULT — connect wallet first.", "bad");
    return;
  }

  const amt = getDepositInput();
  if (!(amt > 0)) {
    log("VAULT — enter deposit amount.", "bad");
    return;
  }

  const remaining = maxDepositRemaining();
  if (remaining <= 0) {
    log("VAULT — max deposit reached ($10).", "bad");
    return;
  }

  const add = Math.min(amt, remaining);
  state.vaultUSDC = +(state.vaultUSDC + add).toFixed(2);

  setVaultUI();
  log(`VAULT — deposited ${money(add)} (vault now ${money(state.vaultUSDC)})`, "ok");

  if (amt > remaining) {
    log(`VAULT — capped at $10 (ignored extra ${money(amt - remaining)})`, "hot");
  }
}

function withdrawUSDC() {
  if (!state.pubkey) {
    log("VAULT — connect wallet first.", "bad");
    return;
  }

  if (state.vaultUSDC <= 0) {
    log("VAULT — nothing to withdraw.", "bad");
    return;
  }

  const out = state.vaultUSDC;
  state.vaultUSDC = 0;
  setVaultUI();
  log(`VAULT — withdrew ${money(out)} (vault now ${money(state.vaultUSDC)})`, "ok");
}

// ---------- bot controls ----------
function stopBot(reason = "Stopped") {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.running = false;
  state.activeTrade = false;
  log(`STOP — ${reason}`, "bad");
}

function startBot() {
  if (state.running) return;

  // require vault >= $1
  if (state.vaultUSDC < state.tradeSizeUSDC) {
    log(`BOT — need at least ${money(state.tradeSizeUSDC)} in vault to trade.`, "bad");
    return;
  }

  state.halted = false;
  const btn = el("panicBtn");
  if (btn) {
    btn.classList.remove("is-cooled");
    btn.classList.remove("is-hot");
  }

  state.running = true;
  log(`START — bot running (cooldown ${state.cooldownSec}s)`, "ok");

  tick();
  state.timer = setInterval(tick, state.cooldownSec * 1000);
}

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
  return Math.random() > 0.2;
}

function tick() {
  if (!state.running || state.halted) return;

  const token = randomToken();
  const lvl = scorePanic();
  setPanicLevel(lvl);

  log(`NEW — ${token} → Panic ${lvl}`, "hot");

  if (lvl >= 3) {
    if (state.activeTrade) {
      log("BOT — one trade at a time. waiting.", "hot");
      return;
    }

    if (state.vaultUSDC < state.tradeSizeUSDC) {
      log(`BOT — vault too low (${money(state.vaultUSDC)}). deposit more.`, "bad");
      stopBot("Vault empty");
      return;
    }

    if (!quoteOk()) {
      log("QUOTE — $1 USDC route looks trash. skip.", "bad");
      return;
    }

    // simulate trade: subtract $1 then add back with pnl
    state.activeTrade = true;

    state.vaultUSDC = +(state.vaultUSDC - state.tradeSizeUSDC).toFixed(2);
    setVaultUI();
    log(`TRADE — spent ${money(state.tradeSizeUSDC)} USDC on ${token}`, "ok");

    setTimeout(() => {
      const pnlPct = (Math.random() * 8 - 3); // -3% to +5%
      const returned = +(state.tradeSizeUSDC * (1 + pnlPct / 100)).toFixed(2);

      state.vaultUSDC = +(state.vaultUSDC + returned).toFixed(2);
      state.profitPct += pnlPct;

      setVaultUI();
      log(`SETTLE — ${token} returned ${money(returned)} (PnL ${pnlPct.toFixed(2)}%)`, pnlPct >= 0 ? "ok" : "bad");

      state.activeTrade = false;

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
    }, 1200);
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

// ---------- wallet provider detection ----------
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

// ---------- copy address (reliable) ----------
function copyToClipboardFallback(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function enableCopyAddress() {
  const addrEl = el("addrText");
  if (!addrEl) return;

  addrEl.addEventListener("click", async () => {
    if (!state.pubkey) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(state.pubkey);
        log("WALLET — address copied ✅", "ok");
        return;
      }
    } catch {}

    const ok = copyToClipboardFallback(state.pubkey);
    log(ok ? "WALLET — address copied ✅" : "WALLET — copy failed ❗", ok ? "ok" : "bad");
  });
}

// ---------- Network check (RPC fetch) ----------
async function checkNetwork() {
  const statusEl = el("networkStatus");
  if (!statusEl) return;

  const MAINNET_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
  const RPC = "https://api.mainnet-beta.solana.com";

  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getGenesisHash" }),
    });
    const json = await res.json();
    const hash = json?.result;

    if (hash === MAINNET_HASH) {
      statusEl.textContent = "Network: Mainnet";
      statusEl.className = "row small net-ok";
      log("NETWORK — mainnet detected ✅", "ok");
    } else {
      statusEl.textContent = "Network: Unknown";
      statusEl.className = "row small net-warn";
      log("NETWORK — unexpected genesis hash", "hot");
    }
  } catch (e) {
    statusEl.textContent = "Network: Unknown";
    statusEl.className = "row small muted";
    log("NETWORK — unknown (RPC failed)", "bad");
    console.error(e);
  }
}

// ---------- wallet connect/disconnect ----------
function disconnectWallet() {
  try { state.provider?.disconnect?.(); } catch {}

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

  setVaultUI();
  log("WALLET — disconnected", "hot");
}

async function connectWallet() {
  const provider = getSolanaProviderPreferPhantom();

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
    setVaultUI();

    log(`WALLET — connected: <span class="mono">${state.pubkey}</span>`, "ok");
    await checkNetwork();
  } catch (e) {
    log("WALLET — connect cancelled or failed.", "bad");
    console.error(e);
  }
}

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
      setVaultUI();

      log(`WALLET — trusted connect: <span class="mono">${state.pubkey}</span>`, "ok");
      await checkNetwork();
    }
  } catch {
    // ignore
  }
}

// ---------- boot ----------
function boot() {
  setDemoMode(true);
  setWalletUIConnected(false);
  setPanicLevel(0);
  setVaultUI();

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

  // wallet + bot + panic
  el("connectBtn")?.addEventListener("click", connectWallet);
  el("connectBtn2")?.addEventListener("click", connectWallet);
  el("disconnectBtn")?.addEventListener("click", disconnectWallet);

  el("demoBtn")?.addEventListener("click", () => setDemoMode(true));

  el("startBtn")?.addEventListener("click", startBot);
  el("stopBtn")?.addEventListener("click", () => stopBot("Stopped by user"));

  el("panicBtn")?.addEventListener("click", panic);

  // vault
  el("depositBtn")?.addEventListener("click", depositUSDC);
  el("withdrawBtn")?.addEventListener("click", withdrawUSDC);
  el("maxDepositBtn")?.addEventListener("click", () => {
    const rem = maxDepositRemaining();
    setDepositInput(rem);
    log(`VAULT — max remaining set to ${money(rem)}`, "hot");
  });

  // copy
  enableCopyAddress();

  log("BOOT — connect wallet → deposit up to $10 → START. PANIC halts everything.", "hot");

  eagerConnectIfTrusted();
}

// guaranteed boot
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

/* =========================
   RADAR — 100Hrs Panic Window (DISPLAY ONLY)
   DexScreener polling + localStorage cache
   Does NOT affect bot logic.
========================= */

(function RadarDisplayOnly(){
  const HOUR = 60 * 60 * 1000;
  const RADAR_WINDOW_MS = 100 * HOUR;
  const RADAR_KEY = "panic_radar_cache_v1";
  const POLL_MS = 120 * 1000;

  const $ = (id) => document.getElementById(id);

  let radarIntervalId = null;

  function radarExists(){
    return !!$("radarList") && !!$("radarBest");
  }

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

  function clamp2(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function normLog(x, min, max){
    const v = Math.max(0, Number(x || 0));
    const l = Math.log10(v + 1);
    const lmin = Math.log10(min + 1);
    const lmax = Math.log10(max + 1);
    if (lmax === lmin) return 0;
    return clamp2((l - lmin) / (lmax - lmin), 0, 1);
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
    const momN = clamp2((momRaw + 20) / 80, 0, 1);

    let score = (volN * 0.48 + liqN * 0.37 + momN * 0.15) * 100;

    if (liq < 20_000) score *= 0.25;
    else if (liq < 50_000) score *= 0.65;

    return clamp2(score, 0, 100);
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
      usdcQuote: isUSDCQuot