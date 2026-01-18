// Panic Button — Wallet + Vault UI + 100Hrs Panic Window (DexScreener Radar) + Demo Bot
// Safe beta: no real swaps, no transactions. Wallet connect + vault simulation + market radar + simulated trades.

const el = (id) => document.getElementById(id);

const HOUR = 60 * 60 * 1000;

const state = {
  // modes / bot
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

  // vault (simulated)
  vaultUSDC: 0,
  maxVaultUSDC: 10,
  tradeSizeUSDC: 1,
  activeTrade: false,

  // radar
  radar: {
    enabled: true,
    cacheKey: "panic_radar_cache_v1",
    windowMs: 100 * HOUR,          // 100 hours
    pollMs: 90 * 1000,             // radar refresh interval
    timer: null,
    best: null,
    lastRefresh: 0,
  },
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

// ---------------- UI setters ----------------
function setWalletUIConnected(connected) {
  el("walletPill").textContent = connected ? "Wallet: Connected" : "Wallet: Not Connected";
  el("addrText").textContent = connected ? shortAddr(state.pubkey) : "—";
  el("modePill").textContent = state.demo ? "Mode: Demo" : "Mode: Live";
}

function setDemoMode(on) {
  state.demo = on;
  el("modePill").textContent = on ? "Mode: Demo" : "Mode: Live";
  log(on ? "DEMO enabled (simulated execution)" : "LIVE selected (wallet connected; execution still simulated)", "hot");
}

function setPanicLevel(n) {
  state.panicLevel = n;
  el("panicLevel").textContent = String(n);

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
  el("vaultBalance").textContent = money(state.vaultUSDC);

  const canUseVault = !!state.pubkey;
  el("depositBtn").disabled = !canUseVault;
  el("withdrawBtn").disabled = !canUseVault;

  el("depositBtn").style.opacity = canUseVault ? "1" : ".55";
  el("withdrawBtn").style.opacity = canUseVault ? "1" : ".55";
}

// ---------------- Copy address ----------------
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

    // fallback
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

// ---------------- Network check (RPC) ----------------
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

// ---------------- Provider detection ----------------
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
  log(`DEBUG — phantom.solana: ${hasPhantom ? "YES" : "NO"} | solana: ${hasSolana ? "YES" : "NO"} | providers: ${providersCount}`, "hot");
}

// ---------------- Wallet connect/disconnect ----------------
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

    await checkNetwork();
    setVaultUI();
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
      log(`WALLET — trusted connect: <span class="mono">${state.pubkey}</span>`, "ok");

      await checkNetwork();
      setVaultUI();
    }
  } catch {
    // ignore
  }
}

// ---------------- Vault logic (beta UI) ----------------
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

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

function maxDepositRemaining() {
  return clamp(state.maxVaultUSDC - state.vaultUSDC, 0, state.maxVaultUSDC);
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

// ---------------- RADAR (DexScreener) ----------------

// Cache shape: { [pairAddress]: { ts:number, item: RadarItem } }
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
  try {
    localStorage.setItem(state.radar.cacheKey, JSON.stringify(cache));
  } catch {
    // ignore quota issues
  }
}

function pruneRadarCache(cache) {
  const cutoff = Date.now() - state.radar.windowMs;
  for (const k of Object.keys(cache)) {
    if (!cache[k]?.ts || cache[k].ts < cutoff) delete cache[k];
  }
  return cache;
}

function panicLabel(level) {
  switch (level) {
    case 0: return "Asleep";
    case 1: return "Twitching";
    case 2: return "Sweaty";
    case 3: return "Redline";
    case 4: return "Full Panic";
    default: return "Asleep";
  }
}

function levelFromScore(score) {
  if (score < 20) return 0;
  if (score < 40) return 1;
  if (score < 60) return 2;
  if (score < 80) return 3;
  return 4;
}

// log-scale normalization for volume/liquidity
function normLog(x, min, max) {
  const v = Math.max(0, Number(x || 0));
  const l = Math.log10(v + 1);
  const lmin = Math.log10(min + 1);
  const lmax = Math.log10(max + 1);
  if (lmax === lmin) return 0;
  return clamp((l - lmin) / (lmax - lmin), 0, 1);
}

function scorePair(p) {
  // DexScreener pair fields
  const liq = Number(p?.liquidity?.usd || 0);
  const vol24 = Number(p?.volume?.h24 || 0);

  const ch1 = Number(p?.priceChange?.h1 || 0);
  const ch6 = Number(p?.priceChange?.h6 || 0);
  const ch24 = Number(p?.priceChange?.h24 || 0);

  // gates / ranges tuned for meme reality
  const liqN = normLog(liq, 5_000, 2_000_000);         // 5k..2m
  const volN = normLog(vol24, 20_000, 20_000_000);     // 20k..20m

  // momentum: favor positive, penalize heavy negative
  const momRaw = (ch1 * 0.55) + (ch6 * 0.35) + (ch24 * 0.10);
  const momN = clamp((momRaw + 20) / 80, 0, 1);        // map -20..+60 → 0..1

  let score = (volN * 0.48 + liqN * 0.37 + momN * 0.15) * 100;

  // liquidity rug-vibes penalty
  if (liq < 20_000) score *= 0.25;
  if (liq < 50_000) score *= 0.65;

  return clamp(score, 0, 100);
}

function isUSDCQuote(pair) {
  const q = pair?.quoteToken?.symbol?.toUpperCase?.() || "";
  return q === "USDC";
}

function radarRowHTML(item) {
  const lvl = item.panicLevel;
  const badgeCls = `panicBadge panic${lvl} panic${lvl}`;
  const safeName = (item.name || "UNKNOWN").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const url = item.url || "#";

  const meta = [
    `liq ${compactUsd(item.liquidityUsd)}`,
    `vol24 ${compactUsd(item.volume24h)}`,
    `1h ${pct(item.change1h)}`,
  ].join(" · ");

  return `
    <div class="radarRow">
      <div class="radarRow__left">
        <div class="radarName">${safeName}</div>
        <div class="radarMeta">${meta}</div>
      </div>
      <div class="radarRow__right">
        <span class="${badgeCls}" title="${panicLabel(lvl)}">${lvl}</span>
        <a class="radarBtnLink" href="${url}" target="_blank" rel="noreferrer">View</a>
      </div>
    </div>
  `;
}

function renderRadar(items) {
  const list = el("radarList");
  const best = el("radarBest");
  if (!list || !best) return;

  if (!items || items.length === 0) {
    list.innerHTML = `<div class="muted small">Radar is asleep. Hit Refresh.</div>`;
    best.textContent = "—";
    state.radar.best = null;
    return;
  }

  // best pick shown
  state.radar.best = items[0];
  best.textContent = `${items[0].name} (Panic ${items[0].panicLevel} — ${panicLabel(items[0].panicLevel)})`;

  list.innerHTML = items.slice(0, 5).map(radarRowHTML).join("");
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
  // USDC-first priority then score
  return items.sort((a, b) => {
    const aUSDC = a.usdcQuote ? 1 : 0;
    const bUSDC = b.usdcQuote ? 1 : 0;
    if (aUSDC !== bUSDC) return bUSDC - aUSDC;
    return (b.score - a.score);
  });
}

// DexScreener fetch helpers
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

// 1) Discover candidates (boosts top)
async function dsFetchBoostTop() {
  // Public endpoint used for discovery
  const url = "https://api.dexscreener.com/token-boosts/top/v1";
  return await fetchJSON(url);
}

// 2) Enrich by token addresses (solana) up to 30 per request
async function dsFetchSolanaTokens(addresses) {
  const chunk = addresses.join(",");
  const url = `https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(chunk)}`;
  return await fetchJSON(url);
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizePairToRadarItem(pair) {
  const baseSym = pair?.baseToken?.symbol || "TOKEN";
  const quoteSym = pair?.quoteToken?.symbol || "PAIR";
  const name = `${baseSym}/${quoteSym}`;

  const liq = Number(pair?.liquidity?.usd || 0);
  const vol24 = Number(pair?.volume?.h24 || 0);
  const change1h = Number(pair?.priceChange?.h1 || 0);
  const change6h = Number(pair?.priceChange?.h6 || 0);
  const change24h = Number(pair?.priceChange?.h24 || 0);

  const score = scorePair(pair);
  const panicLevel = levelFromScore(score);

  return {
    key: pair?.pairAddress || `${pair?.chainId}:${pair?.pairAddress || ""}`,
    name,
    baseMint: pair?.baseToken?.address || "",
    quoteMint: pair?.quoteToken?.address || "",
    pairAddress: pair?.pairAddress || "",
    url: pair?.url || "",
    dexId: pair?.dexId || "",
    liquidityUsd: liq,
    volume24h: vol24,
    change1h,
    change6h,
    change24h,
    score,
    panicLevel,
    usdcQuote: isUSDCQuote(pair),
    ts: Date.now(),
  };
}

async function refreshRadar({ userTriggered = false } = {}) {
  const t0 = Date.now();
  if (userTriggered) log("RADAR — manual refresh (100Hrs Panic Window)", "hot");

  // Load & prune cache
  let cache = pruneRadarCache(loadRadarCache());

  try {
    // Discover candidate token addresses
    const boosts = await dsFetchBoostTop();

    // boosts can be objects; try to extract addresses robustly
    const addrs = uniq(
      (Array.isArray(boosts) ? boosts : [])
        .map((x) => x?.tokenAddress || x?.address || x?.token?.address)
    ).slice(0, 90); // cap to reduce rate / keep it lean

    if (addrs.length === 0) {
      log("RADAR — no candidates returned (DexScreener)", "bad");
      renderRadar(sortRadar(readRadarItemsFromCache(cache)));
      return;
    }

    log(`RADAR — discovered ${addrs.length} candidates (boost top)`, "hot");

    // Enrich in chunks of 30
    const chunks = chunk(addrs, 30);
    const pairsAll = [];

    for (const c of chunks) {
      try {
        const pairs = await dsFetchSolanaTokens(c);
        if (Array.isArray(pairs)) pairsAll.push(...pairs);
      } catch (e) {
        log("RADAR — partial fetch failed (rate / network). continuing.", "bad");
        console.error(e);
      }
      // tiny delay to be polite
      await new Promise((r) => setTimeout(r, 250));
    }

    // Convert pairs → items, store in cache
    let added = 0;
    for (const pair of pairsAll) {
      if (!pair?.pairAddress) continue;
      const item = normalizePairToRadarItem(pair);
      cache[item.pairAddress] = { ts: Date.now(), item };
      added++;
    }

    cache = pruneRadarCache(cache);
    saveRadarCache(cache);

    // Build radar list
    let items = readRadarItemsFromCache(cache);

    // Filter: must be Solana (should be) and must have decent stats
    items = items.filter((it) => (it.liquidityUsd > 0 && it.volume24h > 0));

    // USDC-first fallback any pairs
    items = sortRadar(items);

    // Render top 5
    renderRadar(items);

    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    log(`RADAR — updated ${added} pairs · window 100h · ${dt}s`, "ok");

    // extra: announce best pick
    if (items[0]) {
      const b = items[0];
      log(`LOCK — Best Pick: ${b.name} | Panic ${b.panicLevel} (${panicLabel(b.panicLevel)}) | liq ${compactUsd(b.liquidityUsd)} | vol24 ${compactUsd(b.volume24h)}`, "hot");
    }
  } catch (e) {
    console.error(e);
    log("RADAR — failed to refresh (DexScreener). Try again.", "bad");
    // still render what we have
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
  stopRadarLoop();
  refreshRadar({ userTriggered: false });
  state.radar.timer = setInterval(() => refreshRadar({ userTriggered: false }), state.radar.pollMs);
  log(`RADAR — loop armed (${Math.round(state.radar.pollMs / 1000)}s)`, "hot");
}

function stopRadarLoop() {
  if (state.radar.timer) clearInterval(state.radar.timer);
  state.radar.timer = null;
}

// ---------------- Bot logic (uses Radar pick) ----------------
function stopBot(reason = "Stopped") {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.running = false;
  state.activeTrade = false;
  log(`STOP — ${reason}`, "bad");
}

function startBot() {
  if (state.running) return;

  if (state.vaultUSDC < state.tradeSizeUSDC) {
    log(`BOT — need at least ${money(state.tradeSizeUSDC)} in vault to trade.`, "bad");
    return;
  }

  // need radar best pick
  if (!state.radar.best) {
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
  log(`START — bo