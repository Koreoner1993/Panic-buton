```javascript name=js/app.js url=https://github.com/Koreoner1993/Panic-buton/blob/a3ea9a436096835208bd35cdca6ceae07d231de3/js/app.js
// Panic Button — Demo Bot + Wallet + Vault UI (beta-safe)
// Safe: no transactions, no real swaps. Wallet connect + vault UI simulation + bot simulation.

const el = (id) => document.getElementById(id);

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

  // Vault (simulated for beta UI)
  vaultUSDC: 0,          // numeric dollars
  maxVaultUSDC: 10,      // max deposit total
  tradeSizeUSDC: 1,      // $1 max per trade
  activeTrade: false,    // one trade at a time
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

// ---------------- UI setters ----------------
function setWalletUIConnected(connected) {
  el("walletPill").textContent = connected ? "Wallet: Connected" : "Wallet: Not Connected";
  el("addrText").textContent = connected ? shortAddr(state.pubkey) : "—";
  el("modePill").textContent = state.demo ? "Mode: Demo" : "Mode: Live";
}

function setDemoMode(on) {
  state.demo = on;
  el("modePill").textContent = on ? "Mode: Demo" : "Mode: Live";
  log(on ? "DEMO enabled (simulated scanning + trades)" : "LIVE selected (wallet connected; still simulated trades)", "hot");
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

  // button enabling
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

  // reset vault UI (we keep vault value in demo; if you want wipe, set vaultUSDC=0)
  setDemoMode(true);
  setWalletUIConnected(false);

  // stop bot + reset visuals
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
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function getDepositInput() {
  const v = Number(el("depositAmt")?.value || 0);
  if (!Number.isFinite(v)) return 0;
  return v;
}

function setDepositInput(val) {
  const input = el("depositAmt");
  if (!input) return;
  input.value = val.toFixed(2);
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
    log("VAULT — enter a deposit amount.", "bad");
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

// ---------------- Bot logic updated to respect vault rules ----------------
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
function quoteOk() { return Math.random() > 0.2; }

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

    // “Execute” one simulated trade: subtract $1, then add back with pnl (simulated)
    state.activeTrade = true;

    state.vaultUSDC = +(state.vaultUSDC - state.tradeSizeUSDC).toFixed(2);
    setVaultUI();
    log(`TRADE — spent ${money(state.tradeSizeUSDC)} USDC on ${token}`, "ok");

    // simulate settlement after 1.2s
    setTimeout(() => {
      if (!state.running && !state.activeTrade) return;

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

// ---------------- Panic ----------------
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

// ---------------- Boot ----------------
function boot() {
  // initial UI
  setDemoMode(true);
  setWalletUIConnected(false);
  setPanicLevel(0);

  // vault UI init
  setVaultUI();

  // cooldown slider
  const slider = el("cooldown");
  if (slider) {
    const v = Number(slider.value || 90);
    state.cooldownSec = v;
    el("cooldownVal").textContent = String(v);

    slider.addEventListener("input", (e) => {
      state.cooldownSec = Number(e.target.value);
      el("cooldownVal").textContent = String(state.cooldownSec);

      if (state.running) {
        stopBot("cooldown changed — restarting");
        startBot();
      }
    });
  }

  // buttons
  el("connectBtn")?.addEventListener("click", connectWallet);
  el("connectBtn2")?.addEventListener("click", connectWallet);
  el("disconnectBtn")?.addEventListener("click", disconnectWallet);

  el("demoBtn")?.addEventListener("click", () => setDemoMode(true));

  el("startBtn")?.addEventListener("click", startBot);
  el("stopBtn")?.addEventListener("click", () => stopBot("Stopped by user"));

  el("panicBtn")?.addEventListener("click", panic);

  // copy
  enableCopyAddress();

  // vault buttons
  el("depositBtn")?.addEventListener("click", depositUSDC);
  el("withdrawBtn")?.addEventListener("click", withdrawUSDC);
  el("maxDepositBtn")?.addEventListener("click", () => {
    setDepositInput(maxDepositRemaining());
    log(`VAULT — max remaining set to ${money(maxDepositRemaining())}`, "hot");
  });

  log("BOOT — deposit up to $10, then START. PANIC halts everything.", "hot");

  // optional radar initialization (no-op if not defined)
  initRadar?.();

  eagerConnectIfTrusted();
}

boot();
```
