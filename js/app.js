// Panic Button — SAFE BUILD (won’t crash if HTML IDs are missing)
// Wallet connect + Vault UI + Radar (DexScreener) + Bot simulation

const HOUR = 60 * 60 * 1000;

const state = {
  demo: true,
  running: false,
  panicLevel: 0,
  cooldownSec: 90,
  timer: null,
  profitPct: 0,
  halted: false,

  provider: null,
  pubkey: null,

  vaultUSDC: 0,
  maxVaultUSDC: 10,
  tradeSizeUSDC: 1,
  activeTrade: false,

  radar: {
    cacheKey: "panic_radar_cache_v1",
    windowMs: 100 * HOUR,
    pollMs: 90 * 1000,
    timer: null,
    best: null,
    lastRefresh: 0,
  },
};

// ---------- DOM helpers (safe) ----------
const el = (id) => document.getElementById(id);
const exists = (id) => !!el(id);

function setText(id, text) {
  const n = el(id);
  if (n) n.textContent = text;
}

function setHTML(id, html) {
  const n = el(id);
  if (n) n.innerHTML = html;
}

function now() { return new Date().toLocaleTimeString(); }

function log(msg, cls = "") {
  // Always console log too (so you can see errors even if UI log is missing)
  console.log(`[PANIC] ${msg}`);

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

function compactUsd(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "$0";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toFixed(0)}`;
}

function pct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0%";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

// ---------- UI setters (safe) ----------
function setDemoMode(on) {
  state.demo = on;
  setText("modePill", on ? "Mode: Demo" : "Mode: Live");
}

function setWalletUIConnected(connected) {
  setText("walletPill", connected ? "Wallet: Connected" : "Wallet: Not Connected");
  setText("addrText", connected ? shortAddr(state.pubkey) : "—");
  setText("modePill", state.demo ? "Mode: Demo" : "Mode: Live");
}

function setPanicLevel(n) {
  state.panicLevel = n;
  setText("panicLevel", String(n));

  const btn = el("panicBtn");
  if (!btn) return;

  if (state.halted) {
    btn.classList.remove("is-hot");
    return;
  }
  if (n >= 3) btn.classList.add("is-hot");
  else btn.classList.remove("is-hot");
}

function setVaultUI() {
  if (exists("vaultBalance")) setText("vaultBalance", money(state.vaultUSDC));

  const canUseVault = !!state.pubkey;

  const dep = el("depositBtn");
  const wd = el("withdrawBtn");
  if (dep) { dep.disabled = !canUseVault; dep.style.opacity = canUseVault ? "1" : ".55"; }
  if (wd)  { wd.disabled  = !canUseVault; wd.style.opacity  = canUseVault ? "1" : ".55"; }
}

// ---------- Copy address ----------
function enableCopyAddress() {
  const addrEl = el("addrText");
  if (!addrEl) return;

  addrEl.addEventListener("click", async () => {
    if (!state.pubkey) return;
    const text = state.pubkey;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        log("WALLET — address copied ✅", "ok");
        return;
      }
    } catch {}

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
      log(ok ? "WALLET — address copied ✅" : "WALLET — copy failed ❗", ok ? "ok" : "bad");
    } catch (e) {
      log("WALLET — copy failed ❗", "bad");
      console.error(e);
    }
  });
}

// ---------- Network check (RPC) ----------
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
    statusEl.className = "row small net-warn";
    log("NETWORK — check failed (RPC)", "bad");
    console.error(e);
  }
}

// ---------- Provider detection ----------
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

// ---------- Wallet connect/disconnect ----------
async function connectWallet() {
  const provider = getSolanaProviderPreferPhantom();

  if (!provider) {
    log("WALLET — no Solana wallet detected.", "bad");
    alert("No Solana wallet detected. Install Phantom (desktop) or open in Phantom browser (mobile).");
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

function disconnectWallet() {
  try { state.provider?.disconnect?.(); } catch {}

  state.pubkey = null;
  state.provider = null;

  setDemoMode(true);
  setWalletUIConnected(false);

  stopBot("Disconnected");
  state.halted = false;
  state.activeTrade = false;
  setPanicLevel(0);

  const statusEl = el("networkStatus");
  if (statusEl) {
    statusEl.textContent = "Network: —";
    statusEl.className = "row small muted";
  }

  const btn = el("panicBtn");
  if (btn) {
    btn.classList.remove("is-hot");
    btn.classList.remove("is-cooled");
  }

  setVaultUI();
  log("WALLET — disconnected ✅", "hot");
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

// ---------- Vault logic ----------
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function maxDepositRemaining() {
  return clamp(state.maxVaultUSDC - state.vaultUSDC, 0, state.maxVaultUSDC);
}

function getDepositInput() {
  const v = Number(el("depositAmt")?.value || 0);
  if (!Number.isFinite(v)) return 0;
  return v;
}

function setDepositInput(val) {
  const input = el("depositAmt");
  if (!input) return;
  input.value = Number(val).toFixed(2);
}

function depositUSDC() {
  if (!state.pubkey) { log("VAULT — connect wallet first.", "bad"); return; }

  const amt = getDepositInput();
  if (!(amt > 0)) { log("VAULT — enter a deposit amount.", "bad"); return; }

  const remaining = maxDepositRemaining();
  if (remaining <= 0) { log("VAULT — max deposit reached ($10).", "bad"); return; }

  const add = Math.min(amt, remaining);
  state.vaultUSDC = +(state.vaultUSDC + add).toFixed(2);
  setVaultUI();

  log(`VAULT — deposited ${money(add)} (vault now ${money(state.vaultUSDC)})`, "ok");
  if (amt > remaining) log(`VAULT — capped at $10 (ignored extra ${money(amt - remaining)})`, "hot");
}

function withdrawUSDC() {
  if (!state.pubkey) { log("VAULT — connect wallet first.", "bad"); return; }
  if (state.vaultUSDC <= 0) { log("VAULT — nothing to withdraw.", "bad"); return; }

  const out = state.vaultUSDC;
  state.vaultUSDC = 0;
  setVaultUI();
  log(`VAULT — withdrew ${money(out)} (vault now ${money(state.vaultUSDC)})`, "ok");
}

// ---------- RADAR (DexScreener) ----------
function loadRadarCache() {
  try {
    const raw = localStorage.getItem(state.radar.cacheKey);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function saveRadarCache(cache) {
  try { localStorage.setItem(state.radar.cacheKey, JSON.stringify(cache)); } catch {}
}

function pruneRadarCache(cache) {
  const cutoff = Date.now() - state.radar.windowMs;
  for (const k of Object.keys(cache)) {
    if (!cache[k]?.ts || cache[k].ts < cutoff) delete cache[k];
  }
  return cache;
}

function panicLabel(level) {
  return ["Asleep", "Twitching", "Sweaty", "Redline", "Full Panic"][level] || "Asleep";
}

function levelFromScore(score) {
  if (score < 20) return 0;
  if (score < 40) return 1;
  if (score < 60) return 2;
  if (score < 80) return 3;
  return 4;
}

function normLog(x, min, max) {
  const v = Math.max(0, Number(x || 0));
  const l = Math.log10(v + 1);
  const lmin = Math.log10(min + 1);
  const lmax = Math.log10(max + 1);
  if (lmax === lmin) return 0;
  return clamp((l - lmin) / (lmax - lmin), 0, 1);
}

function isUSDCQuote(pair) {
  const q = pair?.quoteToken?.symbol?.toUpperCase?.() || "";
  return q === "USDC";
}

function scorePair(p) {
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

function normalizePairToRadarItem(pair) {
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

function readRadarItemsFromCache(cache) {
  const arr = [];
  for (const k of Object.keys(cache)) {
    const it = cache[k]?.item;
    if (it) arr.push(it);
  }
  return arr;
}

function sortRadar(items) {
  return items.sort((a, b) => {
    const aUSDC = a.usdcQuote ? 1 : 0;
    const bUSDC = b.usdcQuote ? 1 : 0;
    if (aUSDC !== bUSDC) return bUSDC - aUSDC;
    return (b.score - a.score);
  });
}

function radarRowHTML(item) {
  const lvl = item.panicLevel;
  const safeName = (item.name || "UNKNOWN").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const meta = `liq ${compactUsd(item.liquidityUsd)} · vol24 ${compactUsd(item.volume24h)} · 1h ${pct(item.change1h)}`;

  return `
    <div class="radarRow">
      <div class="radarRow__left">
        <div class="radarName">${safeName}</div>
        <div class="radarMeta">${meta}</div>
      </div>
      <div class="radarRow__right">
        <span class="panicBadge panic${lvl}" title="${panicLabel(lvl)}">${lvl}</span>
        <a class="radarBtnLink" href="${item.url}" target="_blank" rel="noreferrer">View</a>
      </div>
    </div>
  `;
}

function renderRadar(items) {
  if (!exists("radarList") || !exists("radarBest")) return;

  if (!items || items.length === 0) {
    setHTML("radarList", `<div class="muted small">Radar is asleep. Hit Refresh.</div>`);
    setText("radarBest", "—");
    state.radar.best = null;
    return;
  }

  state.radar.best = items[0];
  setText("radarBest", `${items[0].name} (Panic ${items[0].panicLevel} — ${panicLabel(items[0].panicLevel)})`);
  setHTML("radarList", items.slice(0, 5).map(radarRowHTML).join(""));
}

async function fetchJSON(url, timeoutMs = 12_000) {
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

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function refreshRadar({ userTriggered = false } = {}) {
  if (!exists("radarList")) return; // radar card not present => skip cleanly

  const t0 = Date.now();
  if (userTriggered) log("RADAR — manual refresh (100Hrs Panic Window)", "hot");

  let cache = pruneRadarCache(loadRadarCache());

  try {
    // discovery
    const boosts = await fetchJSON("https://api.dexscreener.com/token-boosts/top/v1");
    const addrs = uniq(
      (Array.isArray(boosts) ? boosts : []).map((x) => x?.tokenAddress || x?.address || x?.token?.address)
    ).slice(0, 90);

    if (addrs.length === 0) {
      log("RADAR — no candidates returned (DexScreener)", "bad");
      renderRadar(sortRadar(readRadarItemsFromCache(cache)));
      return;
    }

    log(`RADAR — discovered ${addrs.length} candidates`, "hot");

    // enrich
    const chunks = chunk(addrs, 30);
    const pairsAll = [];

    for (const c of chunks) {
      try {
        const url = `https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(c.join(","))}`;
        const pairs = await fetchJSON(url);
        if (Array.isArray(pairs)) pairsAll.push(...pairs);
      } catch (e) {
        log("RADAR — partial fetch failed. continuing.", "bad");
        console.error(e);
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    let added = 0;
    for (const pair of pairsAll) {
      if (!pair?.pairAddress) continue;
      const item = normalizePairToRadarItem(pair);
      cache[item.pairAddress] = { ts: Date.now(), item };
      added++;
    }

    cache = pruneRadarCache(cache);
    saveRadarCache(cache);

    let items = readRadarItemsFromCache(cache).filter((it) => it.liquidityUsd > 0 && it.volume24h > 0);
    items = sortRadar(items);

    renderRadar(items);

    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    log(`RADAR — updated ${added} pairs · window 100h · ${dt}s`, "ok");

    if (items[0]) {
      const b = items[0];
      log(`LOCK — Best Pick: ${b.name} | Panic ${b.panicLevel} (${panicLabel(b.panicLevel)}) | liq ${compactUsd(b.liquidityUsd)} | vol24 ${compactUsd(b.volume24h)}`, "hot");
    }
  } catch (e) {
    console.error(e);
    log("RADAR — failed to refresh (DexScreener). Try again.", "bad");
    renderRadar(sortRadar(readRadarItemsFromCache(cache)));
  } finally {
    state.radar.lastRefresh = Date.now();
  }
}

function clearRadarCache() {
  try { localStorage.removeItem(state.radar.cacheKey); } catch {}
  state.radar.best = null;
  renderRadar([]);
  log("RADAR — cache cleared (100h wiped).", "hot");
}

function startRadarLoop() {
  if (!exists("radarList")) return; // if you didn’t add radar card, don’t loop
  stopRadarLoop();
  refreshRadar({ userTriggered: false });
  state.radar.timer = setInterval(() => refreshRadar({ userTriggered: false }), state.radar.pollMs);
  log(`RADAR — loop armed (${Math.round(state.radar.pollMs / 1000)}s)`, "hot");
}

function stopRadarLoop() {
  if (state.radar.timer) clearInterval(state.radar.timer);
  state.radar.timer = null;
}

// ---------- Bot ----------
function stopBot(reason = "Stopped") {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.running = false;
  state.activeTrade = false;
  log(`STOP — ${reason}`, "bad");
}

function chooseRadarTarget() {
  const cache = pruneRadarCache(loadRadarCache());
  const items = sortRadar(readRadarItemsFromCache(cache));
  const hot = items.filter((x) => x.panicLevel >= 2);
  const pick = hot[0] || items[0] || null;
  state.radar.best = pick;
  return pick;
}

function quoteOk() {
  const b = state.radar.best;
  if (!b) return Math.random() > 0.3;
  if (b.liquidityUsd < 30_000) return Math.random() > 0.55;
  return Math.random() > 0.22;
}

function startBot() {
  if (state.running) return;

  if (state.vaultUSDC < state.tradeSizeUSDC) {
    log(`BOT — need at least ${money(state.tradeSizeUSDC)} in vault to trade.`, "bad");
    return;
  }

  const target = chooseRadarTarget();
  if (!target) {
    log("BOT — Radar is asleep. Hit Refresh Radar first.", "bad");
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

function tick() {
  if (!state.running || state.halted) return;

  const target = chooseRadarTarget();
  if (!target) {
    log("BOT — no radar target. stopping.", "bad");
    stopBot("Radar empty");
    return;
  }

  setPanicLevel(target.panicLevel);
  log(`RADAR — target ${target.name} → Panic ${target.panicLevel} (${panicLabel(target.panicLevel)})`, "hot");

  if (target.panicLevel >= 3) {
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
      log("QUOTE — route looks trash. skip (slippage/rug vibes).", "bad");
      return;
    }

    state.activeTrade = true;

    state.vaultUSDC = +(state.vaultUSDC - state.tradeSizeUSDC).toFixed(2);
    setVaultUI();
    log(`TRADE — spent ${money(state.tradeSizeUSDC)} USDC on ${target.name}`, "ok");

    setTimeout(() => {
      const pnlPct = (Math.random() * 8 - 3);
      const returned = +(state.tradeSizeUSDC * (1 + pnlPct / 100)).toFixed(2);

      state.vaultUSDC = +(state.vaultUSDC + returned).toFixed(2);
      state.profitPct += pnlPct;

      setVaultUI();
      log(`SETTLE — ${target.name} returned ${money(returned)} (PnL ${pnlPct.toFixed(2)}%)`, pnlPct >= 0 ? "ok" : "bad");

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
   