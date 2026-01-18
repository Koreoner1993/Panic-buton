// Panic Button — wallet connect + demo bot engine (safe / no real trades)

const el = (id) => document.getElementById(id);

const state = {
  demo: true,
  running: false,
  panicLevel: 0,
  cooldownSec: 90,
  timer: null,
  profitPct: 0,     // simulated
  halted: false,    // cooled down after PANIC / auto-stop
  provider: null,   // Phantom provider
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

/**
 * Phantom provider detection (Solana)
 * Phantom docs show connecting with provider.connect(). :contentReference[oaicite:2]{index=2}
 */
function getPhantomProvider() {
  const w = window;

  // Newer recommended injection: window.phantom.solana
  const p1 = w?.phantom?.solana;

  // Legacy/common injection: window.solana
  const p2 = w?.solana;

  const provider =
    (p1 && p1.isPhantom ? p1 : null) ||
    (p2 && p2.isPhantom ? p2 : null) ||
    null;

  return provider;
}

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
  log(on ? "DEMO enabled (simulated scanning + trades)" : "LIVE selected (still simulated trades until vault is wired)", "hot");
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

// ----------- Demo “intel feed” (tokens only) -----------
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

// ----------- PANIC -----------
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

// ----------- Phantom connect (real) -----------
async function connectPhantom() {
  const provider = getPhantomProvider();
  if (!provider) {
    log("WALLET — Phantom not found. Install Phantom browser extension.", "bad");
    alert("Phantom not found. Please install Phantom and refresh.");
    return;
  }

  state.provider = provider;

  try {
    // Recommended by Phantom: provider.connect() :contentReference[oaicite:3]{index=3}
    const resp = await provider.connect();
    const pk = resp?.publicKey?.toString?.() || provider?.publicKey?.toString?.();

    state.pubkey = pk || null;

    // Once connected, treat as “live” mode (still demo trades until on-chain vault wired)
    setDemoMode(false);
    setWalletUIConnected(true);

    log(`WALLET — connected: <span class="mono">${state.pubkey}</span>`, "ok");
  } catch (e) {
    // user rejected, etc.
    log("WALLET — connect cancelled or failed.", "bad");
    console.error(e);
  }
}

function disconnectPhantom() {
  // Phantom has provider.disconnect(), but “disconnecting” is optional UX;
  // user can also remove site connection in Phantom settings.
  const provider = state.provider;
  try {
    provider?.disconnect?.();
  } catch {}
  state.pubkey = null;
  setDemoMode(true);
  setWalletUIConnected(false);
  log("WALLET — disconnected (local state).", "hot");
}

// ----------- Boot -----------
function boot() {
  // initial UI
  setDemoMode(true);
  setWalletUIConnected(false);
  setPanicLevel(0);

  // wire slider
  const slider = el("cooldown");
  if (slider) {
    el("cooldownVal").textContent = String(slider.value);
    state.cooldownSec = Number(slider.value);

    slider.addEventListener("input", (e) => {
      state.cooldownSec = Number(e.target.value);
      el("cooldownVal").textContent = String(state.cooldownSec);

      if (state.running) {
        stopBot("cooldown changed — restarting");
        startBot();
      }
    });
  }

  // wire buttons
  el("connectBtn")?.addEventListener("click", connectPhantom);
  el("connectBtn2")?.addEventListener("click", connectPhantom);

  el("demoBtn")?.addEventListener("click", () => setDemoMode(true));

  el("startBtn")?.addEventListener("click", startBot);
  el("stopBtn")?.addEventListener("click", () => stopBot("Stopped by user"));

  el("panicBtn")?.addEventListener("click", panic);

  // Optional: if already trusted/connected, try “eager connect”
  // NOTE: this only works if user previously approved the site.
  const provider = getPhantomProvider();
  if (provider) {
    // some providers support onlyIfTrusted
    provider.connect?.({ onlyIfTrusted: true })
      .then((resp) => {
        const pk = resp?.publicKey?.toString?.() || provider?.publicKey?.toString?.();
        if (pk) {
          state.provider = provider;
          state.pubkey = pk;
          setDemoMode(false);
          setWalletUIConnected(true);
          log(`WALLET — trusted connect: <span class="mono">${state.pubkey}</span>`, "ok");
        }
      })
      .catch(() => {});
  }

  log("BOOT — press START for demo scans. Connect Phantom for wallet display.", "hot");

  // You can expose disconnect in console for now:
  window.panicDisconnect = disconnectPhantom;
}

boot();
