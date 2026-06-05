// ── Players Module ──
import { db, collection, doc, addDoc, deleteDoc, getDocs, onSnapshot, query, orderBy, where } from "./firebase.js";
import { getIsAdmin } from "./admin.js";

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
  if (confirm("Remove this player from the roster?")) await deleteDoc(doc(db, "players", id));
};

window._removePlayerByName = async (name) => {
  const player = playersList.find(p => p.name === name);
  if (!player) return;
  const deleteHistory = confirm(
    `Remove ${name} from the leaderboard?\n\nClick OK to remove them AND delete their match history.\nThis cannot be undone.`
  );
  if (!deleteHistory) return;
  try {
    // Delete player record
    await deleteDoc(doc(db, "players", player.id));
    // Delete all matches involving this player
    const matchesRef = collection(db, "matches");
    const q1 = query(matchesRef, where("player1", "==", name));
    const q2 = query(matchesRef, where("player2", "==", name));
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    const deletes = [
      ...snap1.docs.map(d => deleteDoc(doc(db, "matches", d.id))),
      ...snap2.docs.map(d => deleteDoc(doc(db, "matches", d.id)))
    ];
    await Promise.all(deletes);
    console.log(`Removed ${name} and ${deletes.length} matches`);
  } catch (err) {
    console.error("Remove player error:", err);
    alert("Error removing player: " + err.message);
  }
};

// Expose admin check for leaderboard delete buttons
window._getIsAdmin = () => getIsAdmin();

export function updateDatalist() {
  const dl = document.getElementById("player-list");
  dl.innerHTML = playersList.map(p => `<option value="${p.name}">`).join("");
}
