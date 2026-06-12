// ── Round Robin Tournament Module ──
import { db, collection, doc, addDoc, setDoc, deleteDoc, getDocs, onSnapshot, query, where } from "./firebase.js";
import { getIsAdmin } from "./admin.js";
import { getPlayers } from "./players.js";
import { determineWinner } from "./matches.js";

const RR_START = "2026-06-15";
let rrTournaments = {}; // { id: data }

export function initRoundRobin() {
  // Listen to rr_tournaments collection
  onSnapshot(collection(db, "rr_tournaments"), snap => {
    rrTournaments = {};
    snap.docs.forEach(d => { rrTournaments[d.id] = { id: d.id, ...d.data() }; });
    renderRRPage();
  });
}

// ── AUTO-ASSIGN GROUPS ──
// Fisher-Yates shuffle then split into 2 groups per division
function assignGroups(players, division) {
  const filtered = players.filter(p => {
    const d = (p.division || p.skillLevel || "").toLowerCase();
    if (division === "beginner") return d === "beginner";
    return d === "experienced";
  });
  // Shuffle
  for (let i = filtered.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
  }
  const half = Math.ceil(filtered.length / 2);
  return {
    A: filtered.slice(0, half).map(p => p.name),
    B: filtered.slice(half).map(p => p.name)
  };
}

// Generate assigned matchups: 2 per player per week
// Round-robin schedule using circle method
function generateMatchups(players) {
  const list = [...players];
  if (list.length % 2 !== 0) list.push("BYE");
  const n = list.length;
  const rounds = [];
  const fixed = list[0];
  const rotating = list.slice(1);

  for (let r = 0; r < n - 1; r++) {
    const round = [];
    const circle = [fixed, ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const p1 = circle[i];
      const p2 = circle[n - 1 - i];
      if (p1 !== "BYE" && p2 !== "BYE") round.push([p1, p2]);
    }
    rounds.push(round);
    rotating.push(rotating.shift());
  }
  return rounds; // array of rounds, each round is array of [p1,p2] pairs
}

// Assign 2 matchups per player per week
function buildWeeklyAssignments(rounds) {
  const weeks = [];
  let roundIdx = 0;
  // Each week gets 2 rounds worth of matches (2 assigned per player)
  while (roundIdx < rounds.length) {
    const weekMatches = [];
    for (let r = 0; r < 2 && roundIdx < rounds.length; r++, roundIdx++) {
      weekMatches.push(...rounds[roundIdx]);
    }
    weeks.push(weekMatches);
  }
  return weeks;
}

// ── CREATE ROUND ROBIN ──
async function createRoundRobin(division) {
  const players = getPlayers();
  const groups = assignGroups(players, division);

  if (groups.A.length < 2 && groups.B.length < 2) {
    alert(`Not enough ${division} players. Assign skill levels first.`);
    return;
  }

  const matchupsA = generateMatchups(groups.A);
  const matchupsB = generateMatchups(groups.B);
  const weeklyA = buildWeeklyAssignments(matchupsA);
  const weeklyB = buildWeeklyAssignments(matchupsB);

  const payload = {
    division,
    startDate: RR_START,
    status: "active",
    groups: {
      A: { players: groups.A, weeklyMatchups: weeklyA },
      B: { players: groups.B, weeklyMatchups: weeklyB }
    },
    standings: {
      A: Object.fromEntries(groups.A.map(p => [p, { played: 0, setWins: 0, setLosses: 0, matchWins: 0 }])),
      B: Object.fromEntries(groups.B.map(p => [p, { played: 0, setWins: 0, setLosses: 0, matchWins: 0 }]))
    },
    matches: [],
    semifinals: null,
    final: null,
    champion: "",
    createdAt: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, "rr_tournaments"), payload);
  } catch (err) {
    alert("Error creating tournament: " + err.message);
    console.error(err);
  }
}

// ── ENTER MATCH SCORE ──
window._rrEnterScore = async (rrId, group, p1, p2) => {
  const score = prompt(`Enter score for ${p1} vs ${p2}\nFormat: sets won by ${p1} - sets won by ${p2}\nExample: 2-1`);
  if (!score) return;
  const parts = score.split("-").map(s => parseInt(s.trim()));
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1]) || parts[0] === parts[1]) {
    alert("Invalid score. Enter format like 2-1 or 1-0"); return;
  }

  const t = rrTournaments[rrId];
  if (!t) return;

  const p1Sets = parts[0], p2Sets = parts[1];
  const winner = p1Sets > p2Sets ? p1 : p2;
  const loser  = winner === p1 ? p2 : p1;

  // Update standings
  const st = JSON.parse(JSON.stringify(t.standings));
  if (!st[group][p1]) st[group][p1] = { played:0, setWins:0, setLosses:0, matchWins:0 };
  if (!st[group][p2]) st[group][p2] = { played:0, setWins:0, setLosses:0, matchWins:0 };

  st[group][p1].played++;
  st[group][p2].played++;
  st[group][p1].setWins += p1Sets;
  st[group][p1].setLosses += p2Sets;
  st[group][p2].setWins += p2Sets;
  st[group][p2].setLosses += p1Sets;
  if (p1Sets > p2Sets) st[group][p1].matchWins++;
  else st[group][p2].matchWins++;

  const matchRecord = {
    group, p1, p2, p1Sets, p2Sets, winner,
    date: new Date().toISOString()
  };

  const updatedMatches = [...(t.matches || []), matchRecord];

  // Check if top 2 from each group can be determined
  const { semis, final, champion } = checkAdvancement(t, st, updatedMatches);

  try {
    await setDoc(doc(db, "rr_tournaments", rrId), {
      standings: st,
      matches: updatedMatches,
      semifinals: semis || t.semifinals,
      final: final || t.final,
      champion: champion || t.champion || "",
      status: champion ? "completed" : t.status
    }, { merge: true });

    // Write to main matches collection for leaderboard
    await addDoc(collection(db, "matches"), {
      matchType: "singles",
      division: t.division,
      player1: p1,
      player2: p2,
      winner: p1Sets > p2Sets ? 1 : 2,
      sets: [{ p1: p1Sets, p2: p2Sets, tb: null }],
      resultType: "completed",
      source: "roundrobin",
      rrId,
      rrGroup: group,
      date: new Date().toISOString(),
      timestamp: Date.now()
    });

  } catch (err) {
    alert("Error saving score: " + err.message);
    console.error(err);
  }
};

function getTopTwo(standing) {
  return Object.entries(standing)
    .sort(([,a],[,b]) => {
      if (b.setWins !== a.setWins) return b.setWins - a.setWins;
      const aDiff = a.setWins - a.setLosses;
      const bDiff = b.setWins - b.setLosses;
      return bDiff - aDiff;
    })
    .slice(0, 2)
    .map(([name]) => name);
}

function checkAdvancement(t, standings, matches) {
  const topA = getTopTwo(standings.A);
  const topB = getTopTwo(standings.B);

  // Only advance if all players have played enough matches
  const totalA = t.groups.A.players.length;
  const totalB = t.groups.B.players.length;
  const minMatchesA = Math.min(...Object.values(standings.A).map(s => s.played));
  const minMatchesB = Math.min(...Object.values(standings.B).map(s => s.played));

  let semis = t.semifinals;
  let final = t.final;
  let champion = "";

  // Auto-set semis when both groups have completed round robin
  // Semi: A1 vs B2, B1 vs A2
  const semiMatch1 = matches.find(m => m.isSemiFinal && m.matchId === "semi1");
  const semiMatch2 = matches.find(m => m.isSemiFinal && m.matchId === "semi2");
  const finalMatch = matches.find(m => m.isFinal);

  if (finalMatch && finalMatch.winner) champion = finalMatch.winner;

  return { semis, final, champion };
}

// ── ENTER SEMIFINAL / FINAL SCORE ──
window._rrEnterKnockoutScore = async (rrId, stage, matchId, p1, p2) => {
  const score = prompt(`${stage}: ${p1} vs ${p2}\nSets won format: e.g. 2-1`);
  if (!score) return;
  const parts = score.split("-").map(s => parseInt(s.trim()));
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1]) || parts[0] === parts[1]) {
    alert("Invalid score format."); return;
  }
  const winner = parts[0] > parts[1] ? p1 : p2;

  const t = rrTournaments[rrId];
  if (!t) return;

  const updatedMatches = [...(t.matches || []), {
    group: "knockout", p1, p2,
    p1Sets: parts[0], p2Sets: parts[1],
    winner, isSemiFinal: stage === "semifinal",
    isFinal: stage === "final", matchId,
    date: new Date().toISOString()
  }];

  let champion = t.champion || "";
  if (stage === "final") champion = winner;

  // Update semis/final tracking
  const semis = t.semifinals ? JSON.parse(JSON.stringify(t.semifinals)) : {
    semi1: { p1: null, p2: null, winner: null },
    semi2: { p1: null, p2: null, winner: null }
  };
  const finalState = t.final || { p1: null, p2: null, winner: null };

  if (stage === "semifinal") {
    semis[matchId] = { p1, p2, winner };
    // If both semis done, set final players
    if (semis.semi1.winner && semis.semi2.winner) {
      finalState.p1 = semis.semi1.winner;
      finalState.p2 = semis.semi2.winner;
    }
  }
  if (stage === "final") {
    finalState.winner = winner;
  }

  try {
    await setDoc(doc(db, "rr_tournaments", rrId), {
      matches: updatedMatches,
      semifinals: semis,
      final: finalState,
      champion,
      status: champion ? "completed" : "active"
    }, { merge: true });

    // Write to main leaderboard
    await addDoc(collection(db, "matches"), {
      matchType: "singles",
      division: t.division,
      player1: p1,
      player2: p2,
      winner: parts[0] > parts[1] ? 1 : 2,
      sets: [{ p1: parts[0], p2: parts[1], tb: null }],
      resultType: "completed",
      source: "roundrobin",
      rrId,
      rrGroup: stage,
      date: new Date().toISOString(),
      timestamp: Date.now()
    });
  } catch (err) {
    alert("Error: " + err.message);
  }
};

window._rrDelete = async (rrId) => {
  if (!confirm("Delete this round robin tournament?")) return;
  await deleteDoc(doc(db, "rr_tournaments", rrId));
};

// ── RENDER ──
function renderRRPage() {
  const container = document.getElementById("rr-container");
  if (!container) return;
  const isAdmin = getIsAdmin();

  let html = "";

  if (isAdmin) {
    html += `<div class="rr-admin-bar">
      <button class="btn-primary" onclick="window._rrCreate('beginner')">+ Beginner Round Robin</button>
      <button class="btn-primary" onclick="window._rrCreate('experienced')">+ Experienced Round Robin</button>
    </div>`;
  }

  const tournaments = Object.values(rrTournaments).sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||""));

  if (!tournaments.length) {
    document.getElementById("rr-empty") && document.getElementById("rr-empty").classList.remove("hidden");
    container.innerHTML = html;
    return;
  }

  tournaments.forEach(t => {
    const statusBadge = t.status === "completed"
      ? `<span class="status-completed">Completed</span>`
      : `<span class="status-active">Active</span>`;

    html += `<div class="rr-card">`;

    // Header
    html += `<div class="rr-header">
      <div style="display:flex;align-items:center;gap:12px">
        <span class="rr-header-title">${t.division.toUpperCase()} ROUND ROBIN</span>
        ${statusBadge}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:11px;color:rgba(255,255,255,0.5);font-family:Inter,sans-serif">Started ${t.startDate}</span>
        ${isAdmin ? `<button class="btn-sm" style="background:rgba(214,48,49,0.15);border-color:rgba(214,48,49,0.3);color:#FF8080" onclick="window._rrDelete('${t.id}')">🗑 Delete</button>` : ""}
      </div>
    </div>`;

    // Body
    html += `<div class="rr-body">`;
    html += `<div class="rr-groups">`;

    ["A","B"].forEach(grp => {
      const group = t.groups?.[grp];
      const standing = t.standings?.[grp] || {};
      if (!group) return;

      const sorted = [...group.players].sort((a,b) => {
        const sa = standing[a] || {setWins:0,setLosses:0,matchWins:0};
        const sb = standing[b] || {setWins:0,setLosses:0,matchWins:0};
        if (sb.setWins !== sa.setWins) return sb.setWins - sa.setWins;
        return (sb.setWins-sb.setLosses) - (sa.setWins-sa.setLosses);
      });

      html += `<div>`;
      html += `<div class="rr-group-title">Group ${grp}</div>`;

      // Standings table
      html += `<table class="rr-table" style="margin-bottom:12px">`;
      html += `<tr><th style="text-align:left">Player</th><th>SW</th><th>SL</th><th>W</th></tr>`;
      sorted.forEach((p,i) => {
        const s = standing[p] || {setWins:0,setLosses:0,matchWins:0,played:0};
        const isTop = i < 2 && s.played > 0;
        html += `<tr class="${isTop?"top-row":""}">
          <td>${isTop?"🏆 ":""}${p}</td>
          <td>${s.setWins}</td>
          <td>${s.setLosses}</td>
          <td>${s.matchWins}</td>
        </tr>`;
      });
      html += `</table>`;

      // Weekly matchups
      const weekly = group.weeklyMatchups || [];
      if (weekly.length) {
        weekly.forEach((weekMatches,wi) => {
          html += `<div class="rr-week-label">Week ${wi+1}</div>`;
          weekMatches.forEach(([mp1,mp2]) => {
            const played = (t.matches||[]).some(m =>
              !m.isSemiFinal && !m.isFinal && m.group===grp &&
              ((m.p1===mp1&&m.p2===mp2)||(m.p1===mp2&&m.p2===mp1))
            );
            html += `<div class="rr-matchup${played?" played":""}">
              <span style="font-size:12px">${played?"✅ ":""}${mp1} <b>vs</b> ${mp2}</span>
              ${isAdmin && !played && t.status==="active" ? `<button class="btn-secondary btn-xs" onclick="window._rrEnterScore('${t.id}','${grp}','${mp1}','${mp2}')">Score</button>` : ""}
            </div>`;
          });
        });
      }

      // Match history
      const history = (t.matches||[]).filter(m => m.group===grp && !m.isSemiFinal && !m.isFinal);
      if (history.length) {
        html += `<div class="rr-week-label" style="margin-top:10px">Match History</div>`;
        history.slice().reverse().forEach(m => {
          const d = m.date ? new Date(m.date).toLocaleDateString() : "";
          html += `<div style="font-size:11px;color:var(--text-2);padding:3px 0;font-family:Inter,sans-serif">
            <span style="color:var(--green);font-weight:600">${m.winner}</span> def. ${m.p1===m.winner?m.p2:m.p1}
            <span style="background:var(--gold-pale);border-radius:10px;padding:1px 7px;font-size:10px;color:#7A5C00;margin:0 4px">${m.p1Sets}-${m.p2Sets}</span>
            <span style="color:var(--muted)">${d}</span>
          </div>`;
        });
      }

      // Admin: log open match
      if (isAdmin && t.status==="active") {
        html += `<div style="margin-top:10px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <select id="rr-${t.id}-${grp}-p1" style="flex:1;min-width:100px;font-size:11px;padding:5px 8px">
            <option value="">Player 1</option>
            ${group.players.map(p=>`<option value="${p}">${p}</option>`).join("")}
          </select>
          <span style="font-size:11px;color:var(--muted)">vs</span>
          <select id="rr-${t.id}-${grp}-p2" style="flex:1;min-width:100px;font-size:11px;padding:5px 8px">
            <option value="">Player 2</option>
            ${group.players.map(p=>`<option value="${p}">${p}</option>`).join("")}
          </select>
          <button class="btn-secondary btn-xs" onclick="
            var p1=document.getElementById('rr-${t.id}-${grp}-p1').value;
            var p2=document.getElementById('rr-${t.id}-${grp}-p2').value;
            if(!p1||!p2||p1===p2){alert('Pick two different players');return;}
            window._rrEnterScore('${t.id}','${grp}',p1,p2)
          ">Log Match</button>
        </div>`;
      }

      html += `</div>`;
    });

    html += `</div>`; // rr-groups

    // Knockout stage
    const topA = getTopTwo(t.standings?.A || {});
    const topB = getTopTwo(t.standings?.B || {});
    if (topA.length >= 2 && topB.length >= 2) {
      const semis = t.semifinals;
      const fin = t.final;
      const s1p1 = topA[0]||"TBD", s1p2 = topB[1]||"TBD";
      const s2p1 = topB[0]||"TBD", s2p2 = topA[1]||"TBD";
      const s1 = semis?.semi1, s2 = semis?.semi2;

      html += `</div><div class="rr-knockout">`;
      html += `<div class="rr-knockout-title">🏆 Knockout Stage</div>`;
      html += `<div class="semi-grid">`;

      // Semi 1
      html += `<div class="semi-card">
        <div class="semi-label">Semifinal 1 — A1 vs B2</div>
        <div class="semi-matchup">${s1p1} vs ${s1p2}</div>
        ${s1?.winner ? `<div class="semi-result">✅ ${s1.winner} advances</div>` : (isAdmin && t.status==="active" ? `<button class="btn-secondary btn-xs" style="margin-top:8px" onclick="window._rrEnterKnockoutScore('${t.id}','semifinal','semi1','${s1p1}','${s1p2}')">Enter Score</button>` : "")}
      </div>`;

      // Semi 2
      html += `<div class="semi-card">
        <div class="semi-label">Semifinal 2 — B1 vs A2</div>
        <div class="semi-matchup">${s2p1} vs ${s2p2}</div>
        ${s2?.winner ? `<div class="semi-result">✅ ${s2.winner} advances</div>` : (isAdmin && t.status==="active" ? `<button class="btn-secondary btn-xs" style="margin-top:8px" onclick="window._rrEnterKnockoutScore('${t.id}','semifinal','semi2','${s2p1}','${s2p2}')">Enter Score</button>` : "")}
      </div>`;
      html += `</div>`;

      // Final
      if (s1?.winner && s2?.winner) {
        const fp1 = fin?.p1||s1.winner, fp2 = fin?.p2||s2.winner;
        html += `<div class="final-card">`;
        html += `<div class="final-label">Final</div>`;
        if (t.champion) {
          html += `<div class="final-champion">${t.champion}</div>`;
          html += `<div class="final-champ-label">${t.division} Champion</div>`;
        } else {
          html += `<div class="final-matchup">${fp1} vs ${fp2}</div>`;
          if (isAdmin) html += `<button class="btn-sm" style="background:rgba(201,168,76,0.2);border-color:rgba(201,168,76,0.4);color:var(--gold);margin-top:10px" onclick="window._rrEnterKnockoutScore('${t.id}','final','final','${fp1}','${fp2}')">Enter Final Score</button>`;
        }
        html += `</div>`;
      }
    } else {
      html += `</div>`; // close rr-body
    }

    html += `</div>`; // rr-card
  });

  container.innerHTML = html;
}

window._rrCreate = (division) => createRoundRobin(division);
