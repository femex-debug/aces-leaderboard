// ── Leaderboard Module ──
import { getPlayers } from "./players.js";


let allMatches = [];
let prevRanks = {};

export function setMatches(matches) { allMatches = matches; }

function winPct(w, l) { return w + l === 0 ? 0 : Math.round((w / (w + l)) * 100); }

function buildStats(matches, players) {
  const stats = {};
  players.forEach(p => {
    stats[p.name] = { division: p.division, wins: 0, losses: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, streak: 0, streakType: "" };
  });

  // Only show players currently in the roster — removed players are excluded

  matches.forEach(m => {
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

    // Sets and games
    if (m.sets) {
      const t1Names = m.matchType === "doubles" ? [m.team1a, m.team1b] : [m.player1];
      const t2Names = m.matchType === "doubles" ? [m.team2a, m.team2b] : [m.player2];
      m.sets.forEach(s => {
        const a = s.p1 !== undefined ? s.p1 : s[0];
        const b = s.p2 !== undefined ? s.p2 : s[1];
        t1Names.filter(Boolean).forEach(n => {
          if (!stats[n] || !players.find(p => p.name === n)) return;
          stats[n].gamesWon += a; stats[n].gamesLost += b;
          if (a > b) stats[n].setsWon++; else if (b > a) stats[n].setsLost++;
        });
        t2Names.filter(Boolean).forEach(n => {
          if (!stats[n] || !players.find(p => p.name === n)) return;
          stats[n].gamesWon += b; stats[n].gamesLost += a;
          if (b > a) stats[n].setsWon++; else if (a > b) stats[n].setsLost++;
        });
      });
    }
  });

  // Streaks (matches sorted oldest first)
  Object.keys(stats).forEach(n => { stats[n].streak = 0; stats[n].streakType = ""; });
  matches.forEach(m => {
    let winners, losers;
    if (m.matchType === "doubles") {
      winners = m.winner === 1 ? [m.team1a, m.team1b] : [m.team2a, m.team2b];
      losers = m.winner === 1 ? [m.team2a, m.team2b] : [m.team1a, m.team1b];
    } else {
      winners = [m.winner === 1 ? m.player1 : m.player2];
      losers = [m.winner === 1 ? m.player2 : m.player1];
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

function streakHtml(count, type) {
  if (!count) return "—";
  return type === "W"
    ? `<span class="streak-hot">🔥W${count}</span>`
    : `<span class="streak-cold">❄️L${count}</span>`;
}

export function renderLeaderboard() {
  const activeSkill = document.querySelector(".skill-tab.active");
  const div = activeSkill ? activeSkill.dataset.div : "all";

  const stats = buildStats(allMatches, getPlayers());
  let entries = Object.entries(stats).map(([name, s]) => ({ name, ...s, pct: winPct(s.wins, s.losses) }));
  if (div && div !== "all") {
    entries = entries.filter(p => (p.division||"").toLowerCase() === div);
  }

  entries.sort((a, b) => b.pct - a.pct || b.wins - a.wins || a.losses - b.losses);

  const tbody = document.querySelector("#leaderboard-table tbody");
  tbody.innerHTML = entries.map((p, i) => {
    const rank = i + 1;
    const anim = prevRanks[p.name] !== undefined && rank < prevRanks[p.name] ? "rank-up" : "";
    const rc = rank <= 3 ? `rank-${rank}` : "";
    const trophy = rank === 1 ? " 🏆" : "";
    const badge = `<span class="division-badge badge-${p.division}">${p.division === "men" ? "M" : "W"}</span>`;
    const isAdmin = window._getIsAdmin ? window._getIsAdmin() : false;
    const delBtn = isAdmin ? `<button class="btn-danger btn-sm" onclick="window._removePlayerByName('${p.name}')">✕</button>` : "";
    const pctBar = `<div class="pct-bar"><div class="pct-track"><div class="pct-fill" style="width:${p.pct}%"></div></div><span class="pct-text">${p.pct}%</span></div>`;
    return `<tr class="${anim}">
      <td class="rank-cell ${rc}">${rank}</td>
      <td><div class="player-name">${p.name}${trophy} ${badge}</div></td>
      <td style="font-weight:600;color:#5CE88A">${p.wins}</td>
      <td style="color:rgba(255,255,255,0.4)">${p.losses}</td>
      <td>${pctBar}</td>
      <td style="font-size:12px;color:rgba(255,255,255,0.6)">${p.setsWon}-${p.setsLost}</td>
      <td style="font-size:12px;color:rgba(255,255,255,0.6)">${p.gamesWon}-${p.gamesLost}</td>
      <td>${streakHtml(p.streak, p.streakType)}</td>
      <td>${delBtn}</td>
    </tr>`;
  }).join("");

  prevRanks = {};
  entries.forEach((p, i) => { prevRanks[p.name] = i + 1; });
}

export function initLeaderboard() {
  // skill-tab filtering handled in app.js
;
}

// ── Weekly MVP ──
export function computeMVP() {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recent = allMatches.filter(m => m.timestamp >= weekAgo);
  const wins = {};

  recent.forEach(m => {
    let winners;
    if (m.matchType === "doubles") {
      winners = m.winner === 1 ? [m.team1a, m.team1b] : [m.team2a, m.team2b];
    } else {
      winners = [m.winner === 1 ? m.player1 : m.player2];
    }
    winners.filter(Boolean).forEach(n => { wins[n] = (wins[n] || 0) + 1; });
  });

  let mvp = null, maxWins = 0;
  Object.entries(wins).forEach(([name, w]) => {
    if (w >= 2 && w > maxWins) { mvp = name; maxWins = w; }
  });

  const banner = document.getElementById("mvp-banner");
  if (mvp) {
    banner.textContent = `⭐ Weekly MVP: ${mvp} — ${maxWins} wins this week!`;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}
