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
    actions.className = "item-actions";

    const statusChip = document.createElement("span");
    statusChip.className = "chip " + (loop.status === "done" ? "done" : "");
    statusChip.textContent =
      loop.status === "done" ? "Abgeschlossen" : "Offen";
    actions.appendChild(statusChip);

    if (loop.status === "open") {
      const completeBtn = document.createElement("button");
      completeBtn.className = "ghost-btn";
      completeBtn.textContent = "Loop schließen";
      completeBtn.addEventListener("click", () => {
        completeLoop(loop.id);
      });
      actions.appendChild(completeBtn);
    } else {
      const reopenBtn = document.createElement("button");
      reopenBtn.className = "ghost-btn";
      reopenBtn.textContent = "Wieder öffnen";
      reopenBtn.addEventListener("click", () => {
        reopenLoop(loop.id);
      });
      actions.appendChild(reopenBtn);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "ghost-btn";
    deleteBtn.textContent = "Löschen";
    deleteBtn.addEventListener("click", () => {
      deleteLoop(loop.id);
    });
    actions.appendChild(deleteBtn);

    li.appendChild(header);
    li.appendChild(body);
    li.appendChild(actions);
    container.appendChild(li);
  });

  updateFocusLoopSelect();
}

function completeLoop(id) {
  const loop = loops.find((l) => l.id === id);
  if (!loop) return;
  loop.status = "done";
  loop.completedAt = new Date().toISOString();
  writeStorage(STORAGE_KEYS.LOOPS, loops);
  renderLoops();
}

function reopenLoop(id) {
  const loop = loops.find((l) => l.id === id);
  if (!loop) return;
  loop.status = "open";
  loop.completedAt = null;
  writeStorage(STORAGE_KEYS.LOOPS, loops);
  renderLoops();
}

function deleteLoop(id) {
  loops = loops.filter((l) => l.id !== id);
  writeStorage(STORAGE_KEYS.LOOPS, loops);
  renderLoops();
}

/* ---------- ENTRIES (BELEGE) ---------- */

function initEntrySection() {
  const form = document.getElementById("entry-form");
  const dateField = document.getElementById("entry-date");
  const clearBtn = document.getElementById("clear-entries");

  // Default date = today
  dateField.value = new Date().toISOString().slice(0, 10);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const date = dateField.value || new Date().toISOString().slice(0, 10);
    const outputEl = document.getElementById("entry-output");
    const fulfilledEl = document.getElementById("entry-fulfilled");

    const output = outputEl.value.trim();
    if (!output) return;

    const entry = {
      id: Date.now().toString(),
      date,
      output,
      fulfilled: !!fulfilledEl.checked,
    };

    entries.unshift(entry);
    writeStorage(STORAGE_KEYS.ENTRIES, entries);
    outputEl.value = "";
    fulfilledEl.checked = false;
    renderEntries();
  });

  clearBtn.addEventListener("click", () => {
    if (!entries.length) return;
    const asText = entries
      .map(
        (e) =>
          `${e.date} | ${e.output} | Zweck erfüllt: ${
            e.fulfilled ? "Ja" : "Nein"
          }`
      )
      .join("\n");
    const blob = new Blob([asText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "loopos-belege.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    if (confirm("Belege wirklich lokal leeren?")) {
      entries = [];
      writeStorage(STORAGE_KEYS.ENTRIES, entries);
      renderEntries();
    }
  });
}

function renderEntries() {
  const container = document.getElementById("entry-list");
  container.innerHTML = "";

  if (!entries.length) {
    container.innerHTML =
      '<li class="item-meta">Noch keine Belege. Kleine Schritte zählen.</li>';
    return;
  }

  entries.forEach((e) => {
    const li = document.createElement("li");
    li.className = "item-card";

    const header = document.createElement("header");
    const title = document.createElement("h4");
    title.textContent = e.output;

    const meta = document.createElement("div");
    meta.className = "item-meta";
    meta.textContent = e.date;

    header.appendChild(title);
    header.appendChild(meta);

    const body = document.createElement("div");
    body.className = "item-body";
    const status = document.createElement("span");
    status.className = "chip " + (e.fulfilled ? "done" : "");
    status.textContent = e.fulfilled
      ? "Zweck erfüllt"
      : "Noch offen im System";
    body.appendChild(status);

    li.appendChild(header);
    li.appendChild(body);
    container.appendChild(li);
  });
}

/* ---------- MODE ---------- */

function initModeSection() {
  const buttons = document.querySelectorAll(".chip-toggle");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const newMode = btn.dataset.mode;
      setMode(newMode);
      buttons.forEach((b) =>
        b.classList.toggle("active", b.dataset.mode === newMode)
      );
    });
  });
}

function setMode(newMode) {
  mode = newMode === "overload" ? "overload" : "operator";
  writeStorage(STORAGE_KEYS.MODE, mode);
  renderMode();
}

function renderMode() {
  const modeLabel = document.getElementById("mode-label");
  const modeDesc = document.getElementById("mode-description");
  const buttons = document.querySelectorAll(".chip-toggle");

  if (!modeLabel || !modeDesc) return;

  if (mode === "operator") {
    modeLabel.textContent = "Modus: Operator";
    modeDesc.textContent =
      "Operator: Klar, strukturiert, Loops schließen, Systeme stabilisieren.";
  } else {
    modeLabel.textContent = "Modus: Überlast";
    modeDesc.textContent =
      "Überlast: Zu viele Reize, zu viele Loops. Kleine Schritte, nichts Großes planen.";
  }

  buttons.forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === mode)
  );
}

/* ---------- IDEAS ---------- */

function initIdeaSection() {
  const form = document.getElementById("idea-form");
  const exportBtn = document.getElementById("export-ideas");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const titleEl = document.getElementById("idea-title");
    const notesEl = document.getElementById("idea-notes");
    const title = titleEl.value.trim();
    const notesRaw = notesEl.value.trim();

    if (!title) return;

    const idea = {
      id: Date.now().toString(),
      title,
      notes: notesRaw,
      createdAt: new Date().toISOString(),
    };

    ideas.unshift(idea);
    writeStorage(STORAGE_KEYS.IDEAS, ideas);
    titleEl.value = "";
    notesEl.value = "";
    renderIdeas();
  });

  exportBtn.addEventListener("click", () => {
    if (!ideas.length) return;
    const asText = ideas
      .map(
        (i) =>
          `${new Date(i.createdAt).toLocaleString()} | ${i.title}\n${
            i.notes || ""
          }`
      )
      .join("\n\n---\n\n");
    const blob = new Blob([asText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "loopos-ideen.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

function renderIdeas() {
  const container = document.getElementById("idea-list");
  container.innerHTML = "";

  if (!ideas.length) {
    container.innerHTML =
      '<li class="item-meta">Noch keine geparkten Ideen. Gut – weniger offene Loops.</li>';
    return;
  }

  ideas.forEach((idea) => {
    const li = document.createElement("li");
    li.className = "item-card";

    const header = document.createElement("header");
    const title = document.createElement("h4");
    title.textContent = idea.title;

    const meta = document.createElement("div");
    meta.className = "item-meta";
    meta.textContent =
      "Geparkt am " + new Date(idea.createdAt).toLocaleDateString();

    header.appendChild(title);
    header.appendChild(meta);

    const body = document.createElement("div");
    body.className = "item-body";

    if (idea.notes) {
      const notes = document.createElement("div");
      notes.className = "idea-notes";
      notes.textContent = idea.notes;
      body.appendChild(notes);
    }

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const removeBtn = document.createElement("button");
    removeBtn.className = "ghost-btn";
    removeBtn.textContent = "Entfernen";
    removeBtn.addEventListener("click", () => {
      ideas = ideas.filter((i) => i.id !== idea.id);
      writeStorage(STORAGE_KEYS.IDEAS, ideas);
      renderIdeas();
    });
    actions.appendChild(removeBtn);

    li.appendChild(header);
    li.appendChild(body);
    li.appendChild(actions);
    container.appendChild(li);
  });
}

/* ---------- FOKUS-TIMER ---------- */

function initFocusSection() {
  const minutesInput = document.getElementById("focus-minutes");
  const displayEl = document.getElementById("focus-display");
  const startBtn = document.getElementById("focus-start");
  const pauseBtn = document.getElementById("focus-pause");
  const resetBtn = document.getElementById("focus-reset");
  const notifyBtn = document.getElementById("focus-notify-btn");
  const notifyLabel = document.getElementById("focus-notify-label");
  const loopSelect = document.getElementById("focus-loop-select");

  if (!displayEl) return;

  loadFocusState();
  updateFocusLoopSelect();

  if (minutesInput) {
    minutesInput.value = focusState.minutes;
    minutesInput.addEventListener("change", () => {
      let m = parseInt(minutesInput.value, 10);
      if (Number.isNaN(m) || m < 5) m = 5;
      if (m > 120) m = 120;
      focusState.minutes = m;

      if (!focusState.running) {
        focusState.remainingSec = m * 60;
      }

      minutesInput.value = m;
      saveFocusState();
      renderFocusTimer(displayEl);
    });
  }

  // Timer wiederherstellen (läuft weiter auch wenn Tab gewechselt wurde)
  restoreFocusTimer(displayEl);

  if (startBtn) {
    startBtn.addEventListener("click", () => {
      startFocusTimer(displayEl);
    });
  }

  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      pauseFocusTimer();
      renderFocusTimer(displayEl);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetFocusTimer();
      renderFocusTimer(displayEl);
    });
  }

  if (notifyBtn && notifyLabel) {
    notifyBtn.addEventListener("click", () => {
      if (!("Notification" in window)) {
        notifyLabel.textContent = "Benachrichtigung nicht verfügbar";
        return;
      }

      if (Notification.permission === "granted") {
        focusState.notifications = !focusState.notifications;
        saveFocusState();
        updateFocusNotifyUI(notifyBtn, notifyLabel);
      } else {
        Notification.requestPermission().then(() => {
          focusState.notifications = Notification.permission === "granted";
          saveFocusState();
          updateFocusNotifyUI(notifyBtn, notifyLabel);
        });
      }
    });

    updateFocusNotifyUI(notifyBtn, notifyLabel);
  }

  if (loopSelect) {
    loopSelect.addEventListener("change", () => {
      focusState.loopId = loopSelect.value || "";
      saveFocusState();
    });

    if (focusState.loopId) {
      loopSelect.value = focusState.loopId;
    }
  }

  renderFocusTimer(displayEl);
}

function updateFocusLoopSelect() {
  const select = document.getElementById("focus-loop-select");
  if (!select) return;

  const openLoops = loops.filter((l) => l.status === "open");
  const prevId = focusState.loopId || "";

  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = openLoops.length
    ? "-- Bitte wählen --"
    : "Keine offenen Loops";
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);

  openLoops.forEach((loop) => {
    const option = document.createElement("option");
    option.value = loop.id;
    option.textContent = loop.title;
    select.appendChild(option);
  });

  if (openLoops.some((l) => l.id === prevId)) {
    select.value = prevId;
    placeholder.selected = false;
  } else {
    if (focusState.loopId) {
      focusState.loopId = "";
      saveFocusState();
    }
    select.value = "";
  }

  select.disabled = openLoops.length === 0;
}

function loadFocusState() {
  try {
    const raw = localStorage.getItem(FOCUS_STORAGE_KEY);
    if (!raw) {
      focusState = { ...defaultFocusState };
      return;
    }
    const parsed = JSON.parse(raw);
    focusState = {
      ...defaultFocusState,
      ...parsed,
    };
  } catch {
    focusState = { ...defaultFocusState };
  }
}

function saveFocusState() {
  try {
    localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(focusState));
  } catch {}
}

function formatFocusTime(sec) {
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function renderFocusTimer(displayEl) {
  if (!displayEl) return;
  displayEl.textContent = formatFocusTime(focusState.remainingSec);
}

function startFocusTimer(displayEl) {
  if (focusState.running) return;

  const now = Date.now();
  if (!focusState.endTs) {
    focusState.endTs = now + focusState.remainingSec * 1000;
  }

  focusState.running = true;
  saveFocusState();

  clearInterval(focusTimerId);
  focusTimerId = setInterval(() => {
    const now = Date.now();
    const remaining = Math.round((focusState.endTs - now) / 1000);

    if (remaining <= 0) {
      focusState.remainingSec = 0;
      focusState.running = false;
      focusState.endTs = null;
      saveFocusState();
      renderFocusTimer(displayEl);
      clearInterval(focusTimerId);
      focusTimerId = null;
      handleFocusFinished();
      return;
    }

    focusState.remainingSec = remaining;
    renderFocusTimer(displayEl);
    saveFocusState();
  }, 1000);
}

function pauseFocusTimer() {
  if (!focusState.running) return;
  focusState.running = false;
  focusState.endTs = null;
  clearInterval(focusTimerId);
  focusTimerId = null;
  saveFocusState();
}

function resetFocusTimer() {
  pauseFocusTimer();
  focusState.remainingSec = focusState.minutes * 60;
  focusState.endTs = null;
  saveFocusState();
}

function restoreFocusTimer(displayEl) {
  if (!focusState.running || !focusState.endTs) {
    renderFocusTimer(displayEl);
    return;
  }

  const now = Date.now();
  const remaining = Math.round((focusState.endTs - now) / 1000);

  if (remaining <= 0) {
    focusState.remainingSec = 0;
    focusState.running = false;
    focusState.endTs = null;
    saveFocusState();
    renderFocusTimer(displayEl);
    handleFocusFinished();
    return;
  }

  focusState.remainingSec = remaining;
  renderFocusTimer(displayEl);

  clearInterval(focusTimerId);
  focusTimerId = setInterval(() => {
    const now = Date.now();
    const remaining = Math.round((focusState.endTs - now) / 1000);

    if (remaining <= 0) {
      focusState.remainingSec = 0;
      focusState.running = false;
      focusState.endTs = null;
      saveFocusState();
      renderFocusTimer(displayEl);
      clearInterval(focusTimerId);
      focusTimerId = null;
      handleFocusFinished();
      return;
    }

    focusState.remainingSec = remaining;
    renderFocusTimer(displayEl);
    saveFocusState();
  }, 1000);
}

function updateFocusNotifyUI(btn, label) {
  if (!("Notification" in window)) {
    btn.classList.add("disabled");
    label.textContent = "Benachrichtigung nicht verfügbar";
    return;
  }

  if (Notification.permission === "denied") {
    btn.classList.remove("active");
    label.textContent = "Benachrichtigungen blockiert";
    return;
  }

  if (focusState.notifications && Notification.permission === "granted") {
    btn.classList.add("active");
    label.textContent = "Benachrichtigungen: An";
  } else {
    btn.classList.remove("active");
    label.textContent = "Benachrichtigungen: Aus";
  }
}

function handleFocusFinished() {
  playGentleChime();
  showFocusNotification();

  try {
    const original = document.title || "LoopOS";
    document.title = "⏱ Fokusblock fertig · LoopOS";
    setTimeout(() => {
      document.title = original;
    }, 8000);
  } catch {}
}

function playGentleChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const freqs = [880, 660, 880]; // drei sanfte Töne
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = freq;

      const start = ctx.currentTime + i * 0.25;
      const end = start + 0.22;

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.linearRampToValueAtTime(0, end);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(end);
    });

    setTimeout(() => ctx.close(), 1500);
  } catch (e) {
    // leise scheitern
  }
}

function showFocusNotification() {
  if (!focusState.notifications) return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    new Notification("Fokusblock fertig", {
      body: "Einmal durchatmen – diesen Loop bewusst schließen.",
      icon: "./icon-192.png",
    });
  } catch (e) {
    // kein Drama, wenn es nicht geht
  }
}

/* ---------- INAKTIVITÄTS-DETECTOR / SHUTDOWN OVERLAY ---------- */

function initInactivityDetector() {
  const handler = () => {
    if (!focusState.running) {
      hideShutdownOverlay();
    }
    resetInactivityTimer();
  };

  ["click", "keydown", "mousemove", "touchstart"].forEach((eventName) => {
    document.addEventListener(eventName, handler, { passive: true, capture: true });
  });

  resetInactivityTimer();
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimerId);
  inactivityTimerId = setTimeout(() => {
    if (!focusState.running) {
      showShutdownOverlay();
    }
  }, INACTIVITY_LIMIT_MS);
}

function showShutdownOverlay() {
  const overlay = document.getElementById("shutdown-overlay");
  if (!overlay) return;
  overlay.classList.add("visible");
}

function hideShutdownOverlay() {
  const overlay = document.getElementById("shutdown-overlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
}

/* ---------- SERVICE WORKER ---------- */

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./service-worker.js")
      .catch((err) => console.warn("SW registration failed", err));
  }
}
