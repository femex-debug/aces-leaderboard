// ── Main App Entry ──
import { initAdmin } from "./admin.js";
import { initPlayers, setOnPlayersChange, renderSkillAssignment } from "./players.js";
import { initLeaderboard, renderLeaderboard } from "./leaderboard.js";
import { initMatches } from "./matches.js";
import { initSchedule } from "./schedule.js";
import { initTournament } from "./tournament.js";
import { initRoundRobin } from "./roundrobin.js";
import { initPending, updatePublicDropdowns } from "./pending.js";

// Tabs
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
    // Re-render skill assignment when admin tab is opened
    if (btn.dataset.tab === "admin-panel") renderSkillAssignment();
    // Re-render pending queue when submit tab opened
    if (btn.dataset.tab === "submit-panel") {
      document.getElementById("pub-p1") && updatePubDropdowns();
    }
  });
});

// Init all modules
initAdmin();
initPlayers();
initLeaderboard();
initMatches();
initSchedule();
initTournament();
initRoundRobin();
initPending();

// Re-render when roster changes
setOnPlayersChange(() => {
  renderLeaderboard();
  renderSkillAssignment();
  updatePublicDropdowns();
});
