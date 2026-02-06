"use strict";

const START_SCORE = 501;
const STORAGE_KEY = "dart_501_scoreboard_v3";

const $ = (sel) => document.querySelector(sel);

const elSubtitle = $("#subtitle");
const elPlayers = $("#players");
const elCurrentName = $("#currentName");
const elDoubleOutLabel = $("#doubleOutLabel");
const elInputDisplay = $("#inputDisplay");
const elStatus = $("#status");

const btnNewLeg = $("#btnNewLeg");
const btnUndo = $("#btnUndo");
const btnSettings = $("#btnSettings");

const btnClear = $("#btnClear");
const btnSubmit = $("#btnSubmit");
const keypad = $("#keypad");

const dlgStart = $("#dlgStart");
const dlgSettings = $("#dlgSettings");
const dlgFinish = $("#dlgFinish");
const dlgWinner = $("#dlgWinner");

/* START fields */
const startPlayers = $("#startPlayers");
const startDoubleOut = $("#startDoubleOut");
const startNameInputs = [$("#startP1"), $("#startP2"), $("#startP3"), $("#startP4")];
const btnStartGame = $("#btnStartGame");

/* SETTINGS fields */
const selPlayers = $("#selPlayers");
const chkDoubleOut = $("#chkDoubleOut");
const nameInputs = [$("#p1"), $("#p2"), $("#p3"), $("#p4")];
const btnApplySettings = $("#btnApplySettings");
const btnResetMatch = $("#btnResetMatch");

/* Finish/Winner */
const finishText = $("#finishText");
const btnFinishYes = $("#btnFinishYes");
const btnFinishNo = $("#btnFinishNo");
const winnerText = $("#winnerText");
const btnWinnerNewLeg = $("#btnWinnerNewLeg");

let pendingFinish = null; // { playerIndex, prevScore }

const defaultState = () => ({
  initialized: false,
  playerCount: 4,
  doubleOut: true,
  current: 0,
  input: "",
  history: [],
  players: [
    { name: "Spieler 1", score: START_SCORE, legs: 0 },
    { name: "Spieler 2", score: START_SCORE, legs: 0 },
    { name: "Spieler 3", score: START_SCORE, legs: 0 },
    { name: "Spieler 4", score: START_SCORE, legs: 0 },
  ],
});

let state = loadState();

/* ---------------- Persistenz ---------------- */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.players)) return defaultState();
    return sanitizeState(parsed);
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function sanitizeState(s) {
  const d = defaultState();
  const out = { ...d, ...s };

  out.initialized = !!out.initialized;
  out.playerCount = [2, 3, 4].includes(Number(out.playerCount)) ? Number(out.playerCount) : 4;
  out.doubleOut = !!out.doubleOut;
  out.current = clamp(Number(out.current) || 0, 0, out.playerCount - 1);
  out.input = typeof out.input === "string" ? out.input : "";
  out.history = Array.isArray(out.history) ? out.history : [];

  const players = Array.isArray(out.players) ? out.players : d.players;
  out.players = d.players.map((p, i) => ({
    name: (players[i] && String(players[i].name || "").trim()) || p.name,
    score: clamp(Number(players[i]?.score ?? START_SCORE), 0, START_SCORE),
    legs: clamp(Number(players[i]?.legs ?? 0), 0, 999),
  }));

  return out;
}

/* ---------------- Helpers ---------------- */

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  }[c]));
}

function getPlayers() {
  return state.players.slice(0, state.playerCount);
}

function setStatus(msg, tone = "muted") {
  const icon = tone === "ok" ? "✅" : tone === "warn" ? "⚠️" : tone === "danger" ? "⛔" : "ℹ️";
  elStatus.textContent = `${icon} ${msg}`;
}

/* ---------------- UI: Keypad ---------------- */

function buildKeypad() {
  keypad.innerHTML = "";

  const keys = [
    "1","2","3",
    "4","5","6",
    "7","8","9",
    "⌫","0","00"
  ];

  keys.forEach((k) => {
    const btn = document.createElement("button");
    btn.className = "key" + (k === "⌫" ? " key--ghost" : "");
    btn.type = "button";
    btn.textContent = k;
    btn.addEventListener("click", () => onKey(k));
    keypad.appendChild(btn);
  });

  const extras = [
    { label: "25", cls: "key key--ghost", val: "25" },
    { label: "50", cls: "key key--ghost", val: "50" },
    { label: "OK", cls: "key key--ok", val: "SUBMIT" },
  ];

  extras.forEach((e) => {
    const btn = document.createElement("button");
    btn.className = e.cls;
    btn.type = "button";
    btn.textContent = e.label;
    btn.addEventListener("click", () => onKey(e.val));
    keypad.appendChild(btn);
  });
}

function onKey(k) {
  if (k === "⌫") {
    state.input = state.input.slice(0, -1);
    render();
    return;
  }
  if (k === "SUBMIT") {
    applyThrow();
    return;
  }
  const next = (state.input + k).replace(/^0+(?=\d)/, "");
  if (next.length > 3) return;
  state.input = next;
  render();
}

/* ---------------- Regeln / Scoring ---------------- */

function validateThrowScore(n) {
  if (!Number.isFinite(n)) return { ok: false, msg: "Ungültige Zahl." };
  if (n < 0) return { ok: false, msg: "Score darf nicht negativ sein." };
  if (n > 180) return { ok: false, msg: "Maximal 180 pro Aufnahme." };
  return { ok: true, msg: "" };
}

function evaluateThrow(prevScore, throwScore, doubleOut) {
  if (throwScore > prevScore) return { type: "bust", reason: "Zu viel geworfen (Bust)." };
  const newScore = prevScore - throwScore;

  if (!doubleOut) {
    if (newScore === 0) return { type: "win" };
    return { type: "ok", newScore };
  }

  if (newScore === 1) return { type: "bust", reason: "Rest 1 ist bei Double-Out Bust." };
  if (newScore === 0) return { type: "needFinishConfirm" };
  return { type: "ok", newScore };
}

/* ---------------- History / Undo ---------------- */

function pushSnapshot() {
  const players = getPlayers();
  state.history.push({
    current: state.current,
    doubleOut: state.doubleOut,
    scores: players.map(p => p.score),
    legs: players.map(p => p.legs),
  });
  if (state.history.length > 100) state.history.shift();
}

function undo() {
  const snap = state.history.pop();
  if (!snap) {
    setStatus("Nichts zum Undo.", "muted");
    return;
  }

  state.current = clamp(snap.current, 0, state.playerCount - 1);
  state.doubleOut = !!snap.doubleOut;

  const players = getPlayers();
  for (let i = 0; i < players.length; i++) {
    players[i].score = clamp(Number(snap.scores[i]), 0, START_SCORE);
    players[i].legs = clamp(Number(snap.legs[i]), 0, 999);
  }

  state.input = "";
  pendingFinish = null;
  setStatus("Undo ausgeführt.", "ok");
  render();
}

/* ---------------- Game Flow ---------------- */

function clearInput() {
  state.input = "";
  render();
}

function nextPlayer() {
  state.current = (state.current + 1) % state.playerCount;
}

function newLeg({ resetLegs = false } = {}) {
  const players = getPlayers();
  for (const p of players) {
    p.score = START_SCORE;
    if (resetLegs) p.legs = 0;
  }
  state.current = 0;
  state.input = "";
  state.history = [];
  pendingFinish = null;
  setStatus(resetLegs ? "Match zurückgesetzt." : "Neue Runde gestartet (501).", "ok");
  render();
}

function applyThrow() {
  const n = state.input.length ? Number(state.input) : 0;
  const v = validateThrowScore(n);
  if (!v.ok) {
    setStatus(v.msg, "danger");
    return;
  }

  const players = getPlayers();
  const p = players[state.current];
  if (!p) return;

  const prevScore = p.score;
  const res = evaluateThrow(prevScore, n, state.doubleOut);

  pushSnapshot();

  if (res.type === "bust") {
    setStatus(res.reason, "warn");
    nextPlayer();
    clearInput();
    return;
  }

  if (res.type === "needFinishConfirm") {
    pendingFinish = { playerIndex: state.current, prevScore };
    finishText.textContent = `${p.name} würde auf 0 kommen. War der letzte Dart ein Double oder Bull?`;
    dlgFinish.showModal();
    setStatus("Finish-Bestätigung nötig.", "warn");
    return;
  }

  if (res.type === "win") {
    p.score = 0;
    p.legs += 1;
    showWinner(p.name);
    clearInput();
    return;
  }

  p.score = res.newScore;
  setStatus(`Eingetragen: ${n} → ${p.score} übrig`, "ok");
  nextPlayer();
  clearInput();
}

function finishConfirm(isDoubleOrBull) {
  dlgFinish.close();

  const players = getPlayers();
  const idx = pendingFinish?.playerIndex;

  if (idx == null || !players[idx]) {
    pendingFinish = null;
    render();
    return;
  }

  const p = players[idx];

  if (isDoubleOrBull) {
    p.score = 0;
    p.legs += 1;
    setStatus(`Game Shot: ${p.name} 🏆`, "ok");
    showWinner(p.name);
  } else {
    p.score = pendingFinish.prevScore;
    setStatus("0 ohne Double/Bull zählt nicht (Bust).", "warn");
    nextPlayer();
  }

  pendingFinish = null;
  clearInput();
}

function showWinner(name) {
  winnerText.textContent = `🏆 ${name} hat die Runde gewonnen!`;
  dlgWinner.showModal();
  render();
}

/* ---------------- START / SETUP ---------------- */

function openStart() {
  // Defaults reinladen
  startPlayers.value = String(state.playerCount || 4);
  startDoubleOut.checked = !!state.doubleOut;

  startNameInputs[0].value = state.players[0].name || "Spieler 1";
  startNameInputs[1].value = state.players[1].name || "Spieler 2";
  startNameInputs[2].value = state.players[2].name || "Spieler 3";
  startNameInputs[3].value = state.players[3].name || "Spieler 4";

  updateStartDisable();
  dlgStart.showModal();
}

function updateStartDisable() {
  const n = Number(startPlayers.value);
  for (let i = 0; i < 4; i++) {
    const disabled = i >= n;
    startNameInputs[i].disabled = disabled;
    startNameInputs[i].style.opacity = disabled ? "0.55" : "1";
  }
}

function applyStart() {
  const n = Number(startPlayers.value);
  if (![2, 3, 4].includes(n)) {
    setStatus("Spieleranzahl ungültig.", "danger");
    return;
  }

  state.playerCount = n;
  state.doubleOut = !!startDoubleOut.checked;

  for (let i = 0; i < 4; i++) {
    const val = String(startNameInputs[i].value || "").trim();
    state.players[i].name = val.length ? val : `Spieler ${i + 1}`;
  }

  state.initialized = true;
  dlgStart.close();

  // Neues Match (sauberer Start)
  newLeg({ resetLegs: true });
  setStatus("Spiel gestartet ✅", "ok");
}

/* ---------------- Settings ---------------- */

function openSettings() {
  selPlayers.value = String(state.playerCount);
  chkDoubleOut.checked = state.doubleOut;

  for (let i = 0; i < 4; i++) nameInputs[i].value = state.players[i].name;
  updateSettingsDisable();
  dlgSettings.showModal();
}

function updateSettingsDisable() {
  const n = Number(selPlayers.value);
  for (let i = 0; i < 4; i++) {
    const disabled = i >= n;
    nameInputs[i].disabled = disabled;
    nameInputs[i].style.opacity = disabled ? "0.55" : "1";
  }
}

function applySettings() {
  const n = Number(selPlayers.value);
  if (![2, 3, 4].includes(n)) {
    setStatus("Spieleranzahl ungültig.", "danger");
    return;
  }

  state.playerCount = n;
  state.doubleOut = !!chkDoubleOut.checked;

  for (let i = 0; i < 4; i++) {
    const val = String(nameInputs[i].value || "").trim();
    state.players[i].name = val.length ? val : `Spieler ${i + 1}`;
  }

  state.current = clamp(state.current, 0, state.playerCount - 1);
  pendingFinish = null;

  dlgSettings.close();
  setStatus("Einstellungen übernommen.", "ok");
  render();
}

/* ---------------- Render ---------------- */

function render() {
  const players = getPlayers();
  const current = players[state.current];

  elCurrentName.textContent = current?.name ?? "—";
  elDoubleOutLabel.textContent = state.doubleOut ? "an" : "aus";
  elSubtitle.textContent = `${state.playerCount} Spieler · Double-Out: ${state.doubleOut ? "an" : "aus"}`;
  elInputDisplay.textContent = state.input.length ? state.input : "0";

  elPlayers.innerHTML = "";

  players.forEach((p, idx) => {
    const isActive = idx === state.current;
    const progress = clamp((START_SCORE - p.score) / START_SCORE, 0, 1);

    const card = document.createElement("div");
    card.className = "player" + (isActive ? " player--active" : "");
    card.style.setProperty("--p", String(progress));

    card.innerHTML = `
      <div class="player__top">
        <div class="player__name">${isActive ? "🟦" : "👤"} ${escapeHtml(p.name)}</div>
        <div class="player__badges">
          ${isActive ? `<span class="badge badge--ok">am Zug</span>` : ``}
          <span class="badge">${state.doubleOut ? "Double-Out" : "Straight-Out"}</span>
        </div>
      </div>

      <div class="player__mid">
        <div>
          <div class="player__score">${p.score}</div>
          <div class="player__legs">Legs: ${p.legs}</div>
        </div>
        <div class="ring" title="Fortschritt">
          <span>${Math.round(progress * 100)}%</span>
        </div>
      </div>
    `;

    elPlayers.appendChild(card);
  });

  saveState();
}

/* ---------------- Events ---------------- */

btnNewLeg.addEventListener("click", () => newLeg({ resetLegs: false }));
btnUndo.addEventListener("click", undo);
btnSettings.addEventListener("click", openSettings);

btnClear.addEventListener("click", () => {
  state.input = "";
  setStatus("Eingabe gelöscht.", "muted");
  render();
});

btnSubmit.addEventListener("click", applyThrow);

document.querySelectorAll("[data-quick]").forEach((b) => {
  b.addEventListener("click", () => {
    const v = b.getAttribute("data-quick");
    if (v === "BUST") {
      state.input = "0";
      setStatus("Bust gewählt (0 eingetragen).", "warn");
      render();
      applyThrow();
      return;
    }
    state.input = String(v);
    render();
    applyThrow();
  });
});

/* Start */
startPlayers.addEventListener("change", updateStartDisable);
btnStartGame.addEventListener("click", applyStart);

/* Settings */
selPlayers.addEventListener("change", updateSettingsDisable);
btnApplySettings.addEventListener("click", applySettings);

btnResetMatch.addEventListener("click", () => {
  state = defaultState();
  saveState();
  dlgSettings.close();
  setStatus("Match zurückgesetzt.", "ok");
  render();
  openStart();
});

/* Finish/Winner */
btnFinishYes.addEventListener("click", () => finishConfirm(true));
btnFinishNo.addEventListener("click", () => finishConfirm(false));

btnWinnerNewLeg.addEventListener("click", () => {
  dlgWinner.close();
  newLeg({ resetLegs: false });
});

/* ---------------- Init ---------------- */

buildKeypad();
setStatus("Bereit ✅", "ok");
render();

if (!state.initialized) {
  openStart();
}