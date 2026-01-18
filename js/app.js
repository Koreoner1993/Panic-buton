const el = (id) => document.getElementById(id);

const state = {
  demo: true,
  running: false,
  cooldownSec: 90,
  timer: null,
  panicLevel: 0,
  addr: null
};

const logBox = el("log");
function logLine(html) {
  const line = document.createElement("div");
  line.innerHTML = html;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

function setPanicLevel(n) {
  state.panicLevel = n;
  el("panicLevel").textContent = String(n);
}

function setWalletUI(connected) {
  el("walletPill").textContent = connected ? "Wallet: Connected" : "Wallet: Not Connected";
  el("modePill").textContent = state.demo ? "Mode: Demo" : "Mode: Live";
}

function shortAddr(a) {
  if (!a) return "—";
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function stopLoop(reason = "Stopped") {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.running = false;
  logLine(`<span class="bad">[STOP]</span> ${reason}`);
}

function startLoop() {
  if (state.running) return;
  state.running = true;
  logLine(`<span class="ok">[START]</span> bot running (demo=${state.demo ? "yes" : "no"}, cooldown=${state.cooldownSec}s)`);

  // simple loop: simulate “new listing intel” and “panic scoring”
  state.timer = setInterval(() => {
    // Fake “new token came in”
    const token = randomTokenName();
    const panic = computeFakePanic();
    setPanicLevel(panic);

    logLine(`<span class="hot">[NEW]</span> ${token} → Panic ${panic}`);

    if (panic >= 3) {
      // Fake Jupiter quote check
      const quoteOk = Math.random() > 0.2; // demo-only
      if (!quoteOk) {
        logLine(`<span class="bad">[QUOTE]</span> $1 USDC route looks trash. skip.`);
        return;
      }

      // One trade at a time (demo)
      logLine(`<span class="ok">[TRADE]</span> $1 USDC → ${token} (simulated)`);
      logLine(`<span class="muted">[RULE]</span> one trade. wait cooldown.`);
    }
  }, state.cooldownSec * 1000);
}

function computeFakePanic() {
  // Weighted so 3/4 is rarer
  const r = Math.random();
  if (r < 0.45) return 0;
  if (r < 0.70) return 1;
  if (r < 0.88) return 2;
  if (r < 0.97) return 3;
  return 4;
}

function randomTokenName() {
  const a = ["PANIC", "RUG", "GOD", "BUTTON", "CHAOS", "SIREN", "RED", "DEGEN", "MINT", "FOMO"];
  const b = ["CAT", "DOG", "AI", "COIN", "WIF", "FROG", "PUMP", "PRINT", "DRAIN", "MOON"];
  return `${a[Math.floor(Math.random()*a.length)]}-${b[Math.floor(Math.random()*b.length)]}`;
}

// Phantom connect (minimal)
async function connectPhantom() {
  try {
    const sol = window.solana;
    if (!sol || !sol.isPhantom) {
      logLine(`<span class="bad">[WALLET]</span> Phantom not found. (Demo still works.)`);
      alert("Phantom not found. Install Phantom or use Demo mode.");
      return;
    }
    const res = await sol.connect();
    state.addr = res.publicKey?.toString?.() || null;
    el("addrText").textContent = shortAddr(state.addr);

    state.demo = false; // “live mode” only means connected for now
    setWalletUI(true);
    logLine(`<span class="ok">[WALLET]</span> connected: <span class="mono">${state.addr}</span>`);
    logLine(`<span class="muted">[NOTE]</span> beta = UI + rules. trading engine will run off-page.`);
  } catch (e) {
    logLine(`<span class="bad">[WALLET]</span> connect failed`);
    console.error(e);
  }
}

function panicNow() {
  // This is the meme + kill switch UI event.
  // Later: this triggers vault halt tx.
  stopLoop("🚨 PANIC BUTTON PRESSED — ALL ACTIVITY HALTED");
  setPanicLevel(0);
}

// Wire UI
function boot() {
  el("cooldownVal").textContent = String(state.cooldownSec);
  setWalletUI(false);

  el("cooldown").addEventListener("input", (e) => {
    state.cooldownSec = Number(e.target.value);
    el("cooldownVal").textContent = String(state.cooldownSec);
    if (state.running) {
      // keep it simple: restart loop to apply cooldown
      stopLoop("cooldown changed — restarting");
      startLoop();
    }
  });

  el("connectBtn").addEventListener("click", connectPhantom);
  el("connectBtn2").addEventListener("click", connectPhantom);

  el("demoBtn").addEventListener("click", () => {
    state.demo = true;
    setWalletUI(!!state.addr);
    logLine(`<span class="hot">[DEMO]</span> demo mode enabled.`);
  });

  el("startBtn").addEventListener("click", startLoop);
  el("stopBtn").addEventListener("click", () => stopLoop("Stopped by user"));
  el("panicBtn").addEventListener("click", panicNow);

  // Initial log
  logLine(`<span class="muted">[BOOT]</span> press START for demo logs. connect Phantom when ready.`);
}

boot();
