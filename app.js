// ── Main App Entry ──
import { initAdmin } from "./admin.js";
import { initPlayers, setOnPlayersChange, renderSkillAssignment } from "./players.js";
import { initLeaderboard, renderLeaderboard } from "./leaderboard.js";
import { initMatches } from "./matches.js";
import { initSchedule } from "./schedule.js";
import { initTournament } from "./tournament.js";
import { initRoundRobin } from "./roundrobin.js";
import { initPending, updatePublicDropdowns } from "./pending.js";

// Main tabs
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    const panel = document.getElementById(btn.dataset.tab);
    if (panel) { panel.classList.add("active"); panel.style.display = "block"; }
    if (btn.dataset.tab === "admin-panel") renderSkillAssignment();
  });
});

// Skill-level filter tabs on leaderboard
document.querySelectorAll(".skill-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".skill-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    // renderLeaderboard reads the active skill-tab to filter
    renderLeaderboard();
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
