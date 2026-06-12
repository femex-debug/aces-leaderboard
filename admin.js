// ── Admin Module ──
import { db, doc, getDoc, setDoc } from "./firebase.js";

let isAdmin = false;

export function getIsAdmin() { return isAdmin; }

function showAdminUI(show) {
  isAdmin = show;
  document.getElementById("admin-bar").classList.toggle("hidden", !show);
  // Show admin-only tabs and elements
  document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("hidden", !show));
  document.getElementById("admin-toggle").textContent = show ? "🔓" : "🔒";
  document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("hidden", !show));
}

export function initAdmin() {
  document.getElementById("admin-toggle").addEventListener("click", () => {
    if (isAdmin) { showAdminUI(false); return; }
    document.getElementById("pin-modal").classList.remove("hidden");
  });

  document.getElementById("pin-cancel").addEventListener("click", () => {
    document.getElementById("pin-modal").classList.add("hidden");
    document.getElementById("pin-input").value = "";
  });

  document.getElementById("pin-submit").addEventListener("click", async () => {
    const pin = document.getElementById("pin-input").value;
    const msg = document.getElementById("pin-msg");
    const snap = await getDoc(doc(db, "config", "admin"));
    if (!snap.exists()) { msg.textContent = "No PIN set yet. Use the form below."; msg.className = "msg-err"; return; }
    if (snap.data().pin === pin) {
      showAdminUI(true);
      document.getElementById("pin-modal").classList.add("hidden");
      document.getElementById("pin-input").value = "";
      msg.textContent = "";
    } else { msg.textContent = "Wrong PIN."; msg.className = "msg-err"; }
  });

  document.getElementById("pin-set-btn").addEventListener("click", async () => {
    const pin = document.getElementById("pin-set").value;
    if (!pin || pin.length < 4) { document.getElementById("pin-msg").textContent = "PIN must be at least 4 characters."; return; }
    const snap = await getDoc(doc(db, "config", "admin"));
    if (snap.exists()) { document.getElementById("pin-msg").textContent = "PIN already set. Login first to change it."; return; }
    await setDoc(doc(db, "config", "admin"), { pin });
    showAdminUI(true);
    document.getElementById("pin-modal").classList.add("hidden");
  });

  document.getElementById("admin-logout").addEventListener("click", () => showAdminUI(false));
}
