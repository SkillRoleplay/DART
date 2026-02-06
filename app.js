"use strict";

/**
 * GRENACHER DART 501 (Segment-Grid 1–20)
 * - 2–4 Spieler, 501, Double-Out optional
 * - Aufnahme: 3 Darts einzeln (S/D/T + Segment 1–20 Buttons)
 * - MISS / OB 25 / BULL 50
 * - Fehler korrigieren: Slot antippen + neu setzen oder ↩️ Dart zurück
 * - Undo: kompletter letzter Zug
 */

const START_SCORE = 501;
const STORAGE_KEY = "grenacher_dart_501_v5";

const $ = (sel) => document.querySelector(sel);

const elSubtitle = $("#subtitle");
const elPlayers = $("#players");
const elCurrentName = $("#currentName");
const elDoubleOutLabel = $("#doubleOutLabel");
const elStatus = $("#status");

const btnNewLeg = $("#btnNewLeg");
const btnUndo = $("#btnUndo");
const btnSettings = $("#btnSettings");

/* Turn UI */
const elTurnTotal = $("#turnTotal");
const elDartSlots = $("#dartSlots");
const elActiveDisplay = $("#activeDisplay");

const btnMultS = $("#btnMultS");
const btnMultD = $("#btnMultD");
const btnMultT = $("#btnMultT");

const btnMiss = $("#btnMiss");
const btnOBull = $("#btnOBull");
const btnBull = $("#btnBull");
const btnUndoDart = $("#btnUndoDart");
const btnClearTurn = $("#btnClearTurn");

const segmentPad = $("#segmentPad");
const btnSubmitTurn = $("#btnSubmitTurn");

/* Start */
const dlgStart = $("#dlgStart");
const startPlayers = $("#startPlayers");
const startDoubleOut = $("#startDoubleOut");
const startNameInputs = [$("#startP1"), $("#startP2"), $("#startP3"), $("#startP4")];
const btnStartGame = $("#btnStartGame");

/* Settings */
const dlgSettings = $("#dlgSettings");
const selPlayers = $("#selPlayers");
const chkDoubleOut = $("#chkDoubleOut");
const nameInputs = [$("#p1"), $("#p2"), $("#p3"), $("#p4")];
const btnApplySettings = $("#btnApplySettings");
const btnResetMatch = $("#btnResetMatch");

const defaultState = () => ({
  initialized: false,
  playerCount: 4,
  doubleOut: true,
  current: 0,
  history: [],
  players: [
    { name: "Spieler 1", score: START_SCORE, legs: 0 },
    { name: "Spieler 2", score: START_SCORE, legs: 0 },
    { name: "Spieler 3", score: START_SCORE, legs: 0 },
    { name: "Spieler 4", score: START_SCORE, legs: 0 },
  ],
  turn: {
    darts: [null, null, null], // { label, points, isDoubleValid }
    selected: 0,
    mult: 1
  }
});

let state = loadState();

/* ---------- Persistenz ---------- */

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
  out.history = Array.isArray(out.history) ? out.history : [];

  const players = Array.isArray(out.players) ? out.players : d.players;
  out.players = d.players.map((p, i) => ({
    name: (players[i] && String(players[i].name || "").trim()) || p.name,
    score: clamp(Number(players[i]?.score ?? START_SCORE), 0, START_SCORE),
    legs: clamp(Number(players[i]?.legs ?? 0), 0, 999),
  }));

  const t = out.turn || {};
  out.turn = {
    darts: Array.isArray(t.darts) ? t.darts.slice(0, 3).map(x => x || null) : [null, null, null],
    selected: clamp(Number(t.selected) || 0, 0, 2),
    mult: [1,2,3].includes(Number(t.mult)) ? Number(t.mult) : 1
  };

  while (out.turn.darts.length < 3) out.turn.darts.push(null);
  out.turn.darts = out.turn.darts.slice(0, 3);

  return out;
}

/* ---------- Helpers ---------- */

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function getPlayers() { return state.players.slice(0, state.playerCount); }

function setStatus(msg, tone = "muted") {
  const icon = tone === "ok" ? "✅" : tone === "warn" ? "⚠️" : tone === "danger" ? "⛔" : "ℹ️";
  elStatus.textContent = `${icon} ${msg}`;
}

function multLetter(m) { return m === 1 ? "S" : m === 2 ? "D" : "T"; }

function turnTotal() {
  return state.turn.darts.reduce((sum, d) => sum + (d?.points || 0), 0);
}

function clearTurn() {
  state.turn.darts = [null, null, null];
  state.turn.selected = 0;
  state.turn.mult = 1;
}

function pushSnapshot() {
  const players = getPlayers();
  state.history.push({
    current: state.current,
    doubleOut: state.doubleOut,
    scores: players.map(p => p.score),
    legs: players.map(p => p.legs),
    turn: JSON.parse(JSON.stringify(state.turn))
  });
  if (state.history.length > 120) state.history.shift();
}

/* ---------- Segment Grid 1–20 ---------- */

function buildSegmentPad() {
  segmentPad.innerHTML = "";

  for (let n = 1; n <= 20; n++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "segBtn";
    b.textContent = String(n);
    b.addEventListener("click", () => setDartFromSegment(n));
    segmentPad.appendChild(b);
  }
}

/* ---------- Turn Eingabe ---------- */

function setMultiplier(m) {
  state.turn.mult = m;
  render();
}

function setSlot(idx) {
  state.turn.selected = clamp(idx, 0, 2);
  render();
}

function setDart(dartObj) {
  const i = state.turn.selected;
  state.turn.darts[i] = dartObj;

  // Auto weiter
  if (i < 2) state.turn.selected = i + 1;

  render();
}

function setDartFromSegment(seg) {
  const m = state.turn.mult;
  const pts = seg * m;
  const prefix = multLetter(m);
  const isDoubleValid = (m === 2);

  setDart({ label: `${prefix}${seg}`, points: pts, isDoubleValid });
  setStatus(`${prefix}${seg} gesetzt (${pts}).`, "ok");
}

function setMiss() {
  setDart({ label: "MISS", points: 0, isDoubleValid: false });
  setStatus("MISS gesetzt.", "ok");
}

function setOuterBull() {
  setDart({ label: "OB", points: 25, isDoubleValid: false });
  setStatus("Outer Bull 25 gesetzt.", "ok");
}

function setBull() {
  // BULL 50 gilt als Double-Out gültig
  setDart({ label: "BULL", points: 50, isDoubleValid: true });
  setStatus("Bull 50 gesetzt.", "ok");
}

function undoLastDart() {
  for (let i = 2; i >= 0; i--) {
    if (state.turn.darts[i] != null) {
      state.turn.darts[i] = null;
      state.turn.selected = i;
      setStatus("Letzter Dart gelöscht.", "ok");
      render();
      return;
    }
  }
  setStatus("Kein Dart zum Löschen.", "muted");
}

function lastScoringDart() {
  for (let i = 2; i >= 0; i--) {
    const d = state.turn.darts[i];
    if (d && (d.points || 0) > 0) return d;
  }
  return null;
}

/* ---------- Scoring ---------- */

function applyTurn() {
  const total = turnTotal();
  const players = getPlayers();
  const p = players[state.current];
  if (!p) return;

  pushSnapshot();

  const prev = p.score;
  const next = prev - total;

  if (total > prev) {
    setStatus("Bust: Zu viel geworfen.", "warn");
    nextPlayer();
    clearTurn();
    render();
    return;
  }

  if (!state.doubleOut) {
    if (next === 0) return winLeg(p);
    p.score = next;
    setStatus(`Eingetragen: ${total} → ${p.score} übrig`, "ok");
    nextPlayer();
    clearTurn();
    render();
    return;
  }

  // Double-Out an
  if (next === 1) {
    setStatus("Bust: Rest 1 bei Double-Out.", "warn");
    nextPlayer();
    clearTurn();
    render();
    return;
  }

  if (next === 0) {
    const last = lastScoringDart();
    if (last && last.isDoubleValid) return winLeg(p);

    setStatus("Bust: 0 ohne Double/Bull.", "warn");
    nextPlayer();
    clearTurn();
    render();
    return;
  }

  p.score = next;
  setStatus(`Eingetragen: ${total} → ${p.score} übrig`, "ok");
  nextPlayer();
  clearTurn();
  render();
}

function winLeg(p) {
  p.score = 0;
  p.legs += 1;
  setStatus(`Game Shot: ${p.name} 🏆`, "ok");

  // Neue Runde starten (Legs bleiben)
  const players = getPlayers();
  for (const pl of players) pl.score = START_SCORE;

  state.current = 0;
  state.history = [];
  clearTurn();
  render();
}

function nextPlayer() {
  state.current = (state.current + 1) % state.playerCount;
}

/* ---------- Undo / Neue Runde ---------- */

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

  state.turn = snap.turn || defaultState().turn;

  setStatus("Undo ausgeführt.", "ok");
  render();
}

function newLeg(resetLegs = false) {
  const players = getPlayers();
  for (const pl of players) {
    pl.score = START_SCORE;
    if (resetLegs) pl.legs = 0;
  }
  state.current = 0;
  state.history = [];
  clearTurn();
  setStatus(resetLegs ? "Match zurückgesetzt." : "Neue Runde gestartet (501).", "ok");
  render();
}

/* ---------- Start / Settings ---------- */

function openStart() {
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
  if (![2,3,4].includes(n)) { setStatus("Spieleranzahl ungültig.", "danger"); return; }

  state.playerCount = n;
  state.doubleOut = !!startDoubleOut.checked;

  for (let i = 0; i < 4; i++) {
    const v = String(startNameInputs[i].value || "").trim();
    state.players[i].name = v.length ? v : `Spieler ${i+1}`;
  }

  state.initialized = true;
  dlgStart.close();
  newLeg(true);
}

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
  if (![2,3,4].includes(n)) { setStatus("Spieleranzahl ungültig.", "danger"); return; }

  state.playerCount = n;
  state.doubleOut = !!chkDoubleOut.checked;

  for (let i = 0; i < 4; i++) {
    const v = String(nameInputs[i].value || "").trim();
    state.players[i].name = v.length ? v : `Spieler ${i+1}`;
  }

  state.current = clamp(state.current, 0, state.playerCount - 1);
  setStatus("Einstellungen übernommen.", "ok");
  render();
}

function resetMatch() {
  state = defaultState();
  saveState();
  setStatus("Match zurückgesetzt.", "ok");
  render();
  openStart();
}

/* ---------- Render ---------- */

function render() {
  const players = getPlayers();
  const current = players[state.current];

  elCurrentName.textContent = current?.name ?? "—";
  elDoubleOutLabel.textContent = state.doubleOut ? "an" : "aus";
  elSubtitle.textContent = `${state.playerCount} Spieler · 501 · Double-Out: ${state.doubleOut ? "an" : "aus"}`;

  // Aktiver Hinweis
  elActiveDisplay.textContent = `Dart ${state.turn.selected + 1} · ${multLetter(state.turn.mult)}`;

  // Mult Buttons
  [btnMultS, btnMultD, btnMultT].forEach(b => b.classList.remove("multBtn--active"));
  if (state.turn.mult === 1) btnMultS.classList.add("multBtn--active");
  if (state.turn.mult === 2) btnMultD.classList.add("multBtn--active");
  if (state.turn.mult === 3) btnMultT.classList.add("multBtn--active");

  // Scoreboard
  elPlayers.innerHTML = "";
  players.forEach((p, idx) => {
    const isActive = idx === state.current;
    const card = document.createElement("div");
    card.className = "player" + (isActive ? " player--active" : "");
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
      </div>
    `;
    elPlayers.appendChild(card);
  });

  // Turn total
  elTurnTotal.textContent = String(turnTotal());

  // Dart slots
  elDartSlots.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const d = state.turn.darts[i];
    const slot = document.createElement("div");
    slot.className = "dartSlot" + (state.turn.selected === i ? " dartSlot--active" : "");
    slot.innerHTML = `
      <div class="dartSlot__top">
        <div class="dartSlot__name">Dart ${i+1}</div>
        <div class="dartSlot__label">${d ? escapeHtml(d.label) : "—"}</div>
      </div>
      <div class="dartSlot__points">${d ? d.points : 0}</div>
    `;
    slot.addEventListener("click", () => setSlot(i));
    elDartSlots.appendChild(slot);
  }

  saveState();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  }[c]));
}

/* ---------- Events ---------- */

btnNewLeg.addEventListener("click", () => newLeg(false));
btnUndo.addEventListener("click", undo);
btnSettings.addEventListener("click", openSettings);

btnMultS.addEventListener("click", () => setMultiplier(1));
btnMultD.addEventListener("click", () => setMultiplier(2));
btnMultT.addEventListener("click", () => setMultiplier(3));

btnMiss.addEventListener("click", setMiss);
btnOBull.addEventListener("click", setOuterBull);
btnBull.addEventListener("click", setBull);

btnUndoDart.addEventListener("click", undoLastDart);
btnClearTurn.addEventListener("click", () => { clearTurn(); setStatus("Aufnahme gelöscht.", "ok"); render(); });

btnSubmitTurn.addEventListener("click", applyTurn);

/* Start */
startPlayers.addEventListener("change", updateStartDisable);
btnStartGame.addEventListener("click", applyStart);

/* Settings */
selPlayers.addEventListener("change", updateSettingsDisable);
btnApplySettings.addEventListener("click", applySettings);
btnResetMatch.addEventListener("click", resetMatch);

/* Init */
buildSegmentPad();
setStatus("Bereit ✅", "ok");
render();

if (!state.initialized) openStart();