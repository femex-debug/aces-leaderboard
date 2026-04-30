// ── Tournament Bracket Module (standalone, does NOT affect leaderboard) ──
import { db, collection, doc, addDoc, setDoc, onSnapshot, query, orderBy } from "./firebase.js";
import { getIsAdmin } from "./admin.js";

let tournaments = [];

export function initTournament() {
  const ref = collection(db, "tournaments");
  const q = query(ref, orderBy("date", "desc"));

  onSnapshot(q, snap => {
    tournaments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTourneyList();
  });

  document.getElementById("tourney-gen-seeds").addEventListener("click", () => {
    const size = parseInt(document.getElementById("tourney-size").value);
    const container = document.getElementById("tourney-seeds");
    container.innerHTML = "<h3>Seed Players</h3>";
    for (let i = 1; i <= size; i++) {
      container.innerHTML += `<div class="form-row"><label>Seed ${i} <input type="text" class="seed-input" list="player-list" placeholder="Player name"></label></div>`;
    }
  });

  document.getElementById("tourney-form").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = document.getElementById("tourney-msg");
    const name = document.getElementById("tourney-name").value.trim();
    const division = document.getElementById("tourney-div").value;
    const size = parseInt(document.getElementById("tourney-size").value);
    const date = document.getElementById("tourney-date").value;

    const seedInputs = document.querySelectorAll(".seed-input");
    const seeds = Array.from(seedInputs).map(i => i.value.trim()).filter(Boolean);
    if (seeds.length < 2) { msg.textContent = "Need at least 2 players."; msg.className = "msg-err"; return; }

    const rounds = buildBracket(seeds, size);

    await addDoc(collection(db, "tournaments"), {
      name, division, size, date, seeds, rounds, status: "active", champion: null
    });
    msg.textContent = "✅ Tournament created!"; msg.className = "msg-ok";
    e.target.reset();
    document.getElementById("tourney-seeds").innerHTML = "";
  });
}

function buildBracket(seeds, size) {
  while (seeds.length < size) seeds.push("BYE");
  const rounds = [];
  const r1 = [];
  for (let i = 0; i < size; i += 2) {
    const p1 = seeds[i], p2 = seeds[i + 1];
    const match = { p1, p2, score: null, winner: null };
    if (p2 === "BYE") match.winner = p1;
    else if (p1 === "BYE") match.winner = p2;
    r1.push(match);
  }
  rounds.push(r1);

  let prevCount = r1.length;
  while (prevCount > 1) {
    const round = [];
    for (let i = 0; i < prevCount; i += 2) {
      round.push({ p1: null, p2: null, score: null, winner: null });
    }
    rounds.push(round);
    prevCount = round.length;
  }
  propagateWinners(rounds);
  return rounds;
}

function propagateWinners(rounds) {
  for (let r = 0; r < rounds.length - 1; r++) {
    rounds[r].forEach((match, i) => {
      if (match.winner) {
        const nextIdx = Math.floor(i / 2);
        const slot = i % 2 === 0 ? "p1" : "p2";
        if (rounds[r + 1][nextIdx]) rounds[r + 1][nextIdx][slot] = match.winner;
      }
    });
  }
}

function getRoundNames(count) {
  if (count === 1) return ["Final"];
  if (count === 2) return ["Semifinal", "Final"];
  if (count === 3) return ["Quarterfinal", "Semifinal", "Final"];
  if (count === 4) return ["Round of 16", "Quarterfinal", "Semifinal", "Final"];
  return Array.from({ length: count }, (_, i) => i === count - 1 ? "Final" : `Round ${i + 1}`);
}

function renderTourneyList() {
  const el = document.getElementById("tourney-list");
  if (!tournaments.length) { el.innerHTML = "<p>No tournaments yet.</p>"; return; }

  el.innerHTML = tournaments.map(t => {
    const status = t.status === "active" ? "🟢 In Progress" : "✅ Completed";
    const champ = t.champion ? `<br>🏆 Champion: <b>${t.champion}</b>` : "";
    return `<div class="tourney-card" onclick="window._viewBracket('${t.id}')">
      <h4>${t.name}</h4>
      <p>${t.division.toUpperCase()} • ${t.size} draw • ${t.date} • ${status}${champ}</p>
    </div>`;
  }).join("");
}

window._viewBracket = (id) => {
  const t = tournaments.find(x => x.id === id);
  if (!t) return;
  const view = document.getElementById("bracket-view");
  view.classList.remove("hidden");

  const roundNames = getRoundNames(t.rounds.length);
  let html = `<h3>${t.name} <small style="color:#757575">${t.date}</small></h3>`;
  if (t.champion) html += `<div class="tourney-champion">🏆 Champion: ${t.champion}</div>`;
  html += `<div class="bracket">`;

  t.rounds.forEach((round, ri) => {
    html += `<div class="bracket-round"><h4>${roundNames[ri]}</h4>`;
    round.forEach((match, mi) => {
      const completed = match.winner ? "completed" : "";
      const p1Class = match.winner === match.p1 && match.p1 ? "winner" : (match.p1 ? "" : "empty");
      const p2Class = match.winner === match.p2 && match.p2 ? "winner" : (match.p2 ? "" : "empty");
      const scoreStr = match.score ? ` (${match.score})` : "";
      const canEnter = getIsAdmin() && match.p1 && match.p2 && !match.winner && match.p1 !== "BYE" && match.p2 !== "BYE";
      const enterBtn = canEnter ? `<button class="btn-sm" onclick="window._enterBracketScore('${id}',${ri},${mi})">Score</button>` : "";

      html += `<div class="bracket-match ${completed}">
        <div class="bracket-slot ${p1Class}">${match.p1 || "TBD"}${match.winner === match.p1 ? scoreStr : ""}</div>
        <div class="bracket-slot ${p2Class}">${match.p2 || "TBD"}</div>
        ${enterBtn}
      </div>`;
    });
    html += `</div>`;
  });

  html += `</div>`;
  view.innerHTML = html;
};

window._enterBracketScore = async (tourneyId, roundIdx, matchIdx) => {
  const score = prompt("Enter set scores (e.g. 6-4, 7-5):");
  if (!score) return;
  const winnerNum = prompt("Who won? Enter 1 or 2:");
  if (winnerNum !== "1" && winnerNum !== "2") return;

  const t = tournaments.find(x => x.id === tourneyId);
  if (!t) return;

  const match = t.rounds[roundIdx][matchIdx];
  match.score = score;
  match.winner = winnerNum === "1" ? match.p1 : match.p2;

  // Advance winner to next round
  if (roundIdx < t.rounds.length - 1) {
    const nextIdx = Math.floor(matchIdx / 2);
    const slot = matchIdx % 2 === 0 ? "p1" : "p2";
    t.rounds[roundIdx + 1][nextIdx][slot] = match.winner;
  }

  // Check if final is decided
  const finalMatch = t.rounds[t.rounds.length - 1][0];
  let champion = null;
  if (finalMatch.winner) {
    t.status = "completed";
    champion = finalMatch.winner;
  }

  await setDoc(doc(db, "tournaments", tourneyId), {
    rounds: t.rounds,
    status: t.status,
    champion: champion || t.champion || null
  }, { merge: true });
};
