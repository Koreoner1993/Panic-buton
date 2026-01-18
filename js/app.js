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



