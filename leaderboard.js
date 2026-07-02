// ── Leaderboard Module ──
import { getPlayers } from "./players.js";

let allMatches = [];
let prevRanks  = {};

export function setMatches(matches) { allMatches = matches; }

function winPct(w, l) { return w + l === 0 ? 0 : Math.round((w / (w + l)) * 100); }

function buildStats(matches, players) {
  const stats = {};
  players.forEach(p => {
    stats[p.name] = {
      division: p.division,
      wins: 0, losses: 0,
      setsWon: 0, setsLost: 0,
      gamesWon: 0, gamesLost: 0,
      streak: 0, streakType: ""
    };
  });

  matches.forEach(m => {
    let winners, losers;
    if (m.matchType === "doubles") {
      winners = m.winner === 1 ? [m.team1a, m.team1b] : [m.team2a, m.team2b];
      losers  = m.winner === 1 ? [m.team2a, m.team2b] : [m.team1a, m.team1b];
    } else {
      winners = [m.winner === 1 ? m.player1 : m.player2];
      losers  = [m.winner === 1 ? m.player2 : m.player1];
    }
    winners.filter(Boolean).forEach(n => { if (stats[n]) stats[n].wins++; });
    losers.filter(Boolean).forEach(n => { if (stats[n]) stats[n].losses++; });

    if (m.sets) {
      const t1 = m.matchType === "doubles" ? [m.team1a, m.team1b] : [m.player1];
      const t2 = m.matchType === "doubles" ? [m.team2a, m.team2b] : [m.player2];
      m.sets.forEach(s => {
        const a = s.p1 !== undefined ? s.p1 : s[0];
        const b = s.p2 !== undefined ? s.p2 : s[1];
        t1.filter(Boolean).forEach(n => {
          if (!stats[n] || !players.find(p => p.name === n)) return;
          stats[n].gamesWon += a; stats[n].gamesLost += b;
          if (a > b) stats[n].setsWon++; else if (b > a) stats[n].setsLost++;
        });
        t2.filter(Boolean).forEach(n => {
          if (!stats[n] || !players.find(p => p.name === n)) return;
          stats[n].gamesWon += b; stats[n].gamesLost += a;
          if (b > a) stats[n].setsWon++; else if (a > b) stats[n].setsLost++;
        });
      });
    }
  });

  // Streaks
  matches.forEach(m => {
    let winners, losers;
    if (m.matchType === "doubles") {
      winners = m.winner === 1 ? [m.team1a, m.team1b] : [m.team2a, m.team2b];
      losers  = m.winner === 1 ? [m.team2a, m.team2b] : [m.team1a, m.team1b];
    } else {
      winners = [m.winner === 1 ? m.player1 : m.player2];
      losers  = [m.winner === 1 ? m.player2 : m.player1];
    }
    winners.filter(Boolean).forEach(n => {
      if (!stats[n] || !players.find(p => p.name === n)) return;
      stats[n].streak = stats[n].streakType === "W" ? stats[n].streak + 1 : 1;
      stats[n].streakType = "W";
    });
    losers.filter(Boolean).forEach(n => {
      if (!stats[n] || !players.find(p => p.name === n)) return;
      stats[n].streak = stats[n].streakType === "L" ? stats[n].streak + 1 : 1;
      stats[n].streakType = "L";
    });
  });

  return stats;
}

function streakCell(count, type) {
  if (!count) return `<span class="streak-none">—</span>`;
  return type === "W"
    ? `<span class="streak-w">${count}W</span>`
    : `<span class="streak-l">${count}L</span>`;
}

function rankLabel(rank) {
  if (rank === 1) return `<span class="rank-gold">${rank}</span>`;
  if (rank === 2) return `<span class="rank-silver">${rank}</span>`;
  if (rank === 3) return `<span class="rank-bronze">${rank}</span>`;
  return `<span class="rank-default">${rank}</span>`;
}

function divisionLabel(div) {
  if (!div) return "";
  const d = div.toLowerCase();
  return `<span class="div-pill div-${d}">${d.charAt(0).toUpperCase() + d.slice(1)}</span>`;
}

export function renderLeaderboard() {
  const activeSkill = document.querySelector(".skill-tab.active");
  const div = activeSkill ? activeSkill.dataset.div : "all";

  const stats = buildStats(allMatches, getPlayers());
  let entries = Object.entries(stats).map(([name, s]) => ({
    name, ...s, pct: winPct(s.wins, s.losses)
  }));

  if (div && div !== "all") {
    entries = entries.filter(p => (p.division || "").toLowerCase() === div);
  }

  entries.sort((a, b) => b.pct - a.pct || b.wins - a.wins || a.losses - b.losses);

  const tbody = document.querySelector("#leaderboard-table tbody");
  const empty = document.getElementById("lb-empty");

  if (!entries.length) {
    tbody.innerHTML = "";
    if (empty) empty.classList.remove("hidden");
    return;
  }
  if (empty) empty.classList.add("hidden");

  const isAdmin = window._getIsAdmin ? window._getIsAdmin() : false;

  tbody.innerHTML = entries.map((p, i) => {
    const rank   = i + 1;
    const moved  = prevRanks[p.name] !== undefined && rank < prevRanks[p.name] ? "rank-up" : "";
    const total  = p.wins + p.losses;
    const pctBar = `<div class="pct-bar">
      <div class="pct-track"><div class="pct-fill" style="width:${p.pct}%"></div></div>
      <span class="pct-label">${p.pct}%</span>
    </div>`;
    const delBtn = isAdmin
      ? `<button class="btn-del" onclick="window._removePlayerByName('${p.name}')" title="Remove">x</button>`
      : "";

    return `<tr class="${moved}">
      <td class="col-rank">${rankLabel(rank)}</td>
      <td class="col-name">
        <div class="player-cell">
          <span class="player-full-name player-link" onclick="window._goH2H('${p.name.replace(/'/g, "\\'")}')">${p.name}</span>
          ${divisionLabel(p.division)}
        </div>
      </td>
      <td class="col-num col-w">${p.wins}</td>
      <td class="col-num col-l">${p.losses}</td>
      <td class="col-num col-total">${total}</td>
      <td class="col-pct">${pctBar}</td>
      <td class="col-sets hide-sm">${p.setsWon}<span class="sep">/</span>${p.setsLost}</td>
      <td class="col-games hide-md">${p.gamesWon}<span class="sep">/</span>${p.gamesLost}</td>
      <td class="col-streak">${streakCell(p.streak, p.streakType)}</td>
      <td class="col-action">${delBtn}</td>
    </tr>`;
  }).join("");

  prevRanks = {};
  entries.forEach((p, i) => { prevRanks[p.name] = i + 1; });
}

export function initLeaderboard() {
  document.getElementById("share-standings").addEventListener("click", (e) => {
    e.preventDefault();
    const rows = document.querySelectorAll("#leaderboard-table tbody tr");
    let text = "ACES Club Standings:\n";
    rows.forEach((tr, i) => {
      const name = tr.querySelector(".player-full-name")?.textContent || "";
      const w = tr.querySelector(".col-w")?.textContent || "0";
      const l = tr.querySelector(".col-l")?.textContent || "0";
      if (name) text += `${i+1}. ${name} (${w}W-${l}L)\n`;
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  });
}

// ── Division Leaders ──
export function computeMVP() {
  const stats = {};
  const players = getPlayers();
  players.forEach(p => { stats[p.name] = { division: p.division, wins: 0, losses: 0 }; });

  allMatches.forEach(m => {
    let winners, losers;
    if (m.matchType === "doubles") {
      winners = m.winner === 1 ? [m.team1a, m.team1b] : [m.team2a, m.team2b];
      losers = m.winner === 1 ? [m.team2a, m.team2b] : [m.team1a, m.team1b];
    } else {
      winners = [m.winner === 1 ? m.player1 : m.player2];
      losers = [m.winner === 1 ? m.player2 : m.player1];
    }
    winners.filter(Boolean).forEach(n => { if (stats[n]) stats[n].wins++; });
    losers.filter(Boolean).forEach(n => { if (stats[n]) stats[n].losses++; });
  });

  // Find top player in each division (best record = most wins)
  const beginners = Object.entries(stats).filter(([n,s]) => (s.division||'').toLowerCase() === 'beginner' && s.wins > 0).sort((a,b) => b[1].wins - a[1].wins || a[1].losses - b[1].losses);
  const experienced = Object.entries(stats).filter(([n,s]) => (s.division||'').toLowerCase() === 'experienced' && s.wins > 0).sort((a,b) => b[1].wins - a[1].wins || a[1].losses - b[1].losses);

  const banner = document.getElementById("mvp-banner");
  if (!banner) return;

  const topBeg = beginners[0];
  const topExp = experienced[0];

  if (topBeg || topExp) {
    let html = '';
    if (topExp) html += `<span class="mvp-crown">Experienced Leader</span><span class="mvp-name">${topExp[0]}</span><span class="mvp-stat">${topExp[1].wins}W-${topExp[1].losses}L</span>`;
    if (topExp && topBeg) html += `<span style="margin:0 16px;opacity:0.3">|</span>`;
    if (topBeg) html += `<span class="mvp-crown">Beginner Leader</span><span class="mvp-name">${topBeg[0]}</span><span class="mvp-stat">${topBeg[1].wins}W-${topBeg[1].losses}L</span>`;
    banner.innerHTML = html;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}
