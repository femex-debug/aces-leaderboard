// ── Main App Entry ──
import { initAdmin } from "./admin.js";
import { initPlayers, setOnPlayersChange } from "./players.js";
import { initLeaderboard, renderLeaderboard } from "./leaderboard.js";
import { initMatches } from "./matches.js";
import { initSchedule } from "./schedule.js";
import { initTournament } from "./tournament.js";

// Tabs
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// Init all modules
initAdmin();
initPlayers();
initLeaderboard();
initMatches();
initSchedule();
initTournament();

// Re-render leaderboard when player roster changes
setOnPlayersChange(() => renderLeaderboard());
