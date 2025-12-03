
// Simple PWA init + state handling for LoopOS

const STORAGE_KEYS = {
  LOOPS: "loopos_loops",
  ENTRIES: "loopos_entries",
  IDEAS: "loopos_ideas",
  MODE: "loopos_mode",
};

const FOCUS_STORAGE_KEY = "loopos_focus_timer";

let loops = [];
let entries = [];
let ideas = [];
let mode = "operator";
let showOnlyOpenLoops = true;

// ---- Fokus-Timer State ----
const defaultFocusState = {
  minutes: 25,
  remainingSec: 25 * 60,
  running: false,
  endTs: null,
  notifications: false,
  loopId: "",
};

let focusState = { ...defaultFocusState };
let focusTimerId = null;

// ---- Inaktivitäts-Detection (Shutdown-Hinweis) ----
let inactivityTimerId = null;
const INACTIVITY_LIMIT_MS = 90_000; // 90 Sekunden ohne Aktivität

document.addEventListener("DOMContentLoaded", () => {
  initState();
  initTabs();
  initLoopSection();
  initEntrySection();
  initModeSection();
  initIdeaSection();
  initFocusSection();   // 🔔 Fokustimer
  initInactivityDetector(); // 🧠 Shutdown-Overlay bei Stillstand
  registerServiceWorker();
});

/* ---------- STATE ---------- */

function initState() {
  loops = readStorage(STORAGE_KEYS.LOOPS, []);
  entries = readStorage(STORAGE_KEYS.ENTRIES, []);
  ideas = readStorage(STORAGE_KEYS.IDEAS, []);
  mode = readStorage(STORAGE_KEYS.MODE, "operator");

  renderLoops();
  renderEntries();
  renderMode();
  renderIdeas();
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Storage read error for", key, e);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("Storage write error for", key, e);
  }
}

/* ---------- TABS ---------- */

function initTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const panels = {
    loops: document.getElementById("tab-loops"),
    belege: document.getElementById("tab-belege"),
    modus: document.getElementById("tab-modus"),
    ideen: document.getElementById("tab-ideen"),
    focus: document.getElementById("tab-focus"),
  };

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      buttons.forEach((b) => b.classList.toggle("active", b === btn));
      Object.entries(panels).forEach(([name, panel]) => {
        if (!panel) return;
        panel.classList.toggle("active", name === tab);
      });
    });
  });
}

/* ---------- LOOPS ---------- */

function initLoopSection() {
  const form = document.getElementById("loop-form");
  const toggleBtn = document.getElementById("toggle-loops-view");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const titleEl = document.getElementById("loop-title");
    const critEl = document.getElementById("loop-criterion");
    const title = titleEl.value.trim();
    const criterion = critEl.value.trim();

    if (!title) return;

    const loop = {
      id: Date.now().toString(),
      title,
      criterion: criterion || "",
      status: "open",
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    loops.unshift(loop);
    writeStorage(STORAGE_KEYS.LOOPS, loops);
    titleEl.value = "";
    critEl.value = "";
    renderLoops();
  });

  toggleBtn.addEventListener("click", () => {
    showOnlyOpenLoops = !showOnlyOpenLoops;
    toggleBtn.textContent = showOnlyOpenLoops
      ? "Nur offene / alle"
      : "Alle / nur offene";
    renderLoops();
  });
}

function renderLoops() {
  const container = document.getElementById("loop-list");
  container.innerHTML = "";

  const list = showOnlyOpenLoops
    ? loops.filter((l) => l.status === "open")
    : loops;

  if (!list.length) {
    container.innerHTML =
      '<li class="item-meta">Keine Loops in dieser Ansicht.</li>';
    updateFocusLoopSelect();
    return;
  }

  list.forEach((loop) => {
    const li = document.createElement("li");
    li.className = "item-card";

    const header = document.createElement("header");
    const title = document.createElement("h4");
    title.textContent = loop.title;

    const meta = document.createElement("div");
    meta.className = "item-meta";
    const created = new Date(loop.createdAt);
    meta.textContent =
      (loop.status === "done" ? "Abgeschlossen" : "Angelegt") +
      " · " +
      created.toLocaleDateString();

    header.appendChild(title);
    header.appendChild(meta);

    const body = document.createElement("div");
    body.className = "item-body";

    if (loop.criterion) {
      const crit = document.createElement("div");
      crit.textContent = "Abschluss-Kriterium: " + loop.criterion;
      body.appendChild(crit);
    }

    if (loop.completedAt) {
      const done = document.createElement("div");
      done.className = "item-meta";
      done.textContent =
        "Fertig: " + new Date(loop.completedAt).toLocaleString();
      body.appendChild(done);
    }

    const actions = document.createElement("div");
    actions.className = "item
