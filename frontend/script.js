// Build the dashboard from /api/meta, then predict via /api/predict.

// Backend lives on Render. When developing against the local backend
// (localhost) we call the same origin; in production (Vercel) we call Render.
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const API_BASE = LOCAL ? "" : "https://ipo-listing-gain-predictor.onrender.com";

let META = null;

async function loadMeta() {
  const res = await fetch(`${API_BASE}/api/meta`);
  META = await res.json();
  const m = META.metrics;

  // Top stat cards
  document.getElementById("stat-r2").textContent = m.r2;
  document.getElementById("stat-mae").textContent = `±${m.mae}`;
  document.getElementById("stat-ntest").textContent = m.n_test;
  document.getElementById("stat-period").textContent = m.test_period;

  // Input fields
  const fields = document.getElementById("fields");
  fields.innerHTML = "";
  for (const f of META.feature_meta) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.innerHTML = `
      <label for="${f.name}">${f.label}</label>
      <input id="${f.name}" name="${f.name}" type="number" step="any" value="${f.default}" />
      <span class="hint">${f.help}</span>`;
    fields.appendChild(wrap);
  }
}

function resetToMedians() {
  for (const f of META.feature_meta) {
    document.getElementById(f.name).value = f.default;
  }
  document.getElementById("result").hidden = true;
}

function showResult(data) {
  const result = document.getElementById("result");
  const gainEl = document.getElementById("gain");
  const gain = data.predicted_gain_pct;

  gainEl.textContent = `${gain > 0 ? "+" : ""}${gain.toFixed(2)}%`;
  gainEl.className = "gain " + (gain >= 5 ? "pos" : gain <= -5 ? "neg" : "flat");

  document.getElementById("band").textContent = `± ${data.mae_pp} pp typical error`;
  document.getElementById("interpretation").textContent = data.interpretation;
  document.getElementById("disclaimer").textContent = data.disclaimer;
  result.hidden = false;
  result.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function predict(evt) {
  evt.preventDefault();
  const btn = document.getElementById("predict-btn");
  btn.disabled = true;
  btn.textContent = "Predicting…";

  const payload = {};
  for (const f of META.feature_meta) {
    payload[f.name] = parseFloat(document.getElementById(f.name).value);
  }

  try {
    const res = await fetch(`${API_BASE}/api/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(JSON.stringify(err.detail || err));
    }
    showResult(await res.json());
  } catch (e) {
    const result = document.getElementById("result");
    result.hidden = false;
    document.getElementById("gain").textContent = "—";
    document.getElementById("interpretation").innerHTML =
      `<span class="error">Error: ${e.message}</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Predict listing gain";
  }
}

// ----- Sidebar active state on scroll-to -----
function initNav() {
  for (const item of document.querySelectorAll(".nav-item[data-target]")) {
    item.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
      item.classList.add("active");
    });
  }
}

initNav();
document.getElementById("predict-form").addEventListener("submit", predict);
document.getElementById("reset-btn").addEventListener("click", resetToMedians);
loadMeta();
