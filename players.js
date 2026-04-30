// ── Players Module ──
import { db, collection, doc, addDoc, deleteDoc, onSnapshot, query, orderBy } from "./firebase.js";

let playersList = []; // [{ id, name, division }]
let onPlayersChange = () => {};

export function getPlayers() { return playersList; }
export function setOnPlayersChange(fn) { onPlayersChange = fn; }

export function initPlayers() {
  const playersRef = collection(db, "players");
  const q = query(playersRef, orderBy("name"));

  onSnapshot(q, snap => {
    playersList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderRoster();
    updateDatalist();
    onPlayersChange();
  });

  document.getElementById("add-player-form").addEventListener("submit", async e => {
    e.preventDefault();
    const name = document.getElementById("new-player-name").value.trim();
    const division = document.getElementById("new-player-div").value;
    if (!name) return;
    if (playersList.find(p => p.name.toLowerCase() === name.toLowerCase())) { alert("Player already exists."); return; }
    await addDoc(collection(db, "players"), { name, division });
    document.getElementById("new-player-name").value = "";
  });
}

function renderRoster() {
  const el = document.getElementById("player-roster");
  el.innerHTML = playersList.map(p =>
    `<div class="roster-item">
      <span>${p.name} <span class="division-badge badge-${p.division}">${p.division.toUpperCase()}</span></span>
      <button onclick="window._removePlayer('${p.id}')">Remove</button>
    </div>`
  ).join("");
}

window._removePlayer = async (id) => {
  if (confirm("Remove this player?")) await deleteDoc(doc(db, "players", id));
};

export function updateDatalist() {
  const dl = document.getElementById("player-list");
  dl.innerHTML = playersList.map(p => `<option value="${p.name}">`).join("");
}
