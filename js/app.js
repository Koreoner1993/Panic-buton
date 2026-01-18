// Panic Button — Demo Bot + Solana Wallet Connect + Wallet UX
// Safe: no transactions, no real swaps. Connect wallet + simulate bot behavior.

const el = (id) => document.getElementById(id);

const state = {
  demo: true,
  running: false,
  panicLevel: 0,
  cooldownSec: 90,
  timer: null,
  profitPct: 0,     // simulated profit %
  halted: false,    // cooled down after PANIC / auto-stop
  provider: null,   // detected wallet provider
  pubkey: null,     // connected public key (string)
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

// ---------------- UI setters ----------------
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
  log(on ? "DEMO enabled (simulated scanning + trades)" : "LIVE selected (wallet connected; trades still simulated)", "hot");
}

function setPanicLevel(n) {
  state.panicLevel = n;
  const pl = el("panicLevel");
  if (pl) pl.textContent = String(n);

  // Pulse panic button when >=3, unless cooled down (halted)
  const btn = el("panicBtn");
  if (!btn) return;

  if (state.halted) {
    btn.classList.remove("is-hot");
    return;
  }
  if (n >= 3) btn.classList.add("is-hot");
  else btn.classList.remove("is-hot");
}

// ---------------- Bot controls ----------------
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

// ---------------- Demo token feed (tokens only) ----------------
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

// ---------------- PANIC ----------------
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

// ---------------- Wallet provider detection (robust) ----------------
// Supports:
// - window.phantom.solana
// - window.solana
// - window.solana.providers (multi-wallet env)
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
    `DEBUG — phantom.solana: ${hasPhantom ? "YES" : "NO"} | solana: ${hasSolana ? "YES" : "NO"} | providers: ${providersCount}`,
    "hot"
  );

  // Devtools
  console.log("window.phantom:", window.phantom);
  console.log("window.solana:", window.solana);
}

// ---------------- Copy address (clipboard + fallback) ----------------
function enableCopyAddress() {
  const addrEl = el("addrText");
  if (!addrEl) return;

  addrEl.addEventListener("click", async () => {
    if (!state.pubkey) return;
    const text = state.pubkey;

    // Modern Clipboard API first
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        log("WALLET — address copied ✅", "ok");
        return;
      }
    } catch {
      // fallthrough
    }

    // Fallback copy (execCommand)
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

      if (ok) log("WALLET — address copied ✅", "ok");
      else log("WALLET — copy failed ❗", "bad");
    } catch (e) {
      log("WALLET — copy failed ❗", "bad");
      console.error(e);
    }
  });
}

// ---------------- Network check (reliable via RPC) ----------------
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

// ---------------- Disconnect (works even if provider disconnect is missing) ----------------
function disconnectWallet() {
  // Try provider disconnect if supported
  try {
    state.provider?.disconnect?.();
  } catch {}

  // Always reset local state
  state.pubkey = null;
  state.provider = null;

  // stop bot + reset
  stopBot("Disconnected");
  state.halted = false;
  setPanicLevel(0);

  // reset UI mode
  setDemoMode(true);
  setWalletUIConnected(false);

  // reset network line
  const statusEl = el("networkStatus");
  if (statusEl) {
    statusEl.textContent = "Network: —";
    statusEl.className = "row small muted";
  }

  // reset panic visuals
  const btn = el("panicBtn");
  if (btn) {
    btn.classList.remove("is-hot");
    btn.classList.remove("is-cooled");
  }

  log("WALLET — disconnected ✅", "hot");
}

// ---------------- Connect wallet ----------------
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
  } catch (e) {
    log("WALLET — connect cancelled or failed.", "bad");
    console.error(e);
  }
}

// ---------------- Eager connect (if user already approved) ----------------
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

// ---------------- Boot ----------------
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