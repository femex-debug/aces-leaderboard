// ── Players Module ──
import { db, collection, doc, addDoc, setDoc, deleteDoc, getDocs, onSnapshot, query, orderBy, where } from "./firebase.js";
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

// ── Skill Level Assignment (admin only) ──
export function renderSkillAssignment() {
  const el = document.getElementById("skill-assignment");
  if (!el) return;
  if (!getIsAdmin()) { el.innerHTML = ""; return; }

  if (!playersList.length) {
    el.innerHTML = `<p style="color:#888;font-size:13px">No players yet.</p>`;
    return;
  }

  // Sort: unassigned players first so admin can see who needs a level set
  const sorted = [...playersList].sort((a, b) => {
    const aSet = a.division ? 1 : 0;
    const bSet = b.division ? 1 : 0;
    return aSet - bSet || a.name.localeCompare(b.name);
  });

  const unassigned = sorted.filter(p => !p.division);
  const assigned = sorted.filter(p => p.division);

  let html = "";

  if (unassigned.length) {
    html += `<div style="background:#fff3cd;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#856404">
      ⚠️ ${unassigned.length} player${unassigned.length>1?"s":""} without a skill level assigned
    </div>`;
  }

  html += sorted.map(p => {
    const div = (p.division || "").toLowerCase();
    const isUnset = !p.division;
    const bg = isUnset ? "#fff8e1" : "white";
    const border = isUnset ? "1px solid #f0c040" : "0.5px solid #e0e0e0";
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:${bg};border:${border};border-radius:8px;margin-bottom:6px">
      <span style="font-weight:600;font-size:13px">${p.name}${isUnset?' <span style="font-size:10px;color:#856404;background:#fff3cd;padding:1px 6px;border-radius:10px">UNSET</span>':''}</span>
      <select onchange="window._setSkillLevel('${p.id}', this.value)" style="padding:5px 10px;border-radius:6px;border:0.5px solid #ccc;font-size:13px">
        <option value="" ${!div?"selected":""} disabled>Select level...</option>
        <option value="beginner" ${div==="beginner"?"selected":""}>Beginner</option>
        <option value="experienced" ${div==="experienced"?"selected":""}>Experienced</option>
      </select>
    </div>`;
  }).join("");

  el.innerHTML = html;
}

window._setSkillLevel = async (playerId, level) => {
  if (!level) return;
  try {
    await setDoc(doc(db, "players", playerId), { division: level }, { merge: true });
  } catch (err) {
    alert("Error updating skill level: " + err.message);
  }
};
