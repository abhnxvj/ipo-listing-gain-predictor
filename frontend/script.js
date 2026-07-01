// Build the dashboard from /api/meta, then predict via /api/predict.

// Single deployment: the same Render app serves this UI and the API,
// so we call the API on the same origin (relative paths).
const API_BASE = "";

let META = null;

async function loadMeta() {
  const fields = document.getElementById("fields");
  const btn = document.getElementById("predict-btn");
  btn.disabled = true;
  fields.innerHTML =
    `<p class="loading-note"><span class="spinner"></span>` +
    `Loading model… the first load can take about 60 seconds while the server wakes up.</p>`;

  try {
    const res = await fetch(`${API_BASE}/api/meta`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    META = await res.json();
  } catch (e) {
    fields.innerHTML =
      `<p class="loading-note error">Couldn't reach the prediction server. ` +
      `It may still be waking up — <button type="button" id="retry-meta" class="btn ghost">Retry</button></p>`;
    document.getElementById("retry-meta").addEventListener("click", loadMeta);
    return;
  }

  const m = META.metrics;

  // Top stat cards
  document.getElementById("stat-r2").textContent = m.r2;
  document.getElementById("stat-mae").textContent = `±${m.mae}`;
  document.getElementById("stat-ntest").textContent = m.n_test;
  document.getElementById("stat-period").textContent = m.test_period;

  // Input fields
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
  btn.disabled = false;
}

function resetToMedians() {
  for (const f of META.feature_meta) {
    document.getElementById(f.name).value = f.default;
  }
  document.getElementById("result").hidden = true;
}

function setLoading(on) {
  document.getElementById("result-loading").hidden = !on;
  document.getElementById("result-content").hidden = on;
}

function showResult(data) {
  const gainEl = document.getElementById("gain");
  const gain = data.predicted_gain_pct;

  gainEl.textContent = `${gain > 0 ? "+" : ""}${gain.toFixed(2)}%`;
  gainEl.className = "gain " + (gain >= 5 ? "pos" : gain <= -5 ? "neg" : "flat");

  document.getElementById("band").textContent = `± ${data.mae_pp} pp typical error`;
  document.getElementById("interpretation").textContent = data.interpretation;
  document.getElementById("disclaimer").textContent = data.disclaimer;
  setLoading(false);
}

async function predict(evt) {
  evt.preventDefault();
  if (!META) return; // model not loaded yet
  const btn = document.getElementById("predict-btn");
  btn.disabled = true;
  btn.textContent = "Calculating…";

  const payload = {};
  for (const f of META.feature_meta) {
    payload[f.name] = parseFloat(document.getElementById(f.name).value);
  }

  // Show the loading animation with a live elapsed-seconds counter.
  const result = document.getElementById("result");
  result.hidden = false;
  setLoading(true);
  result.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const started = Date.now();
  const sub = document.getElementById("loading-sub");
  const timer = setInterval(() => {
    const s = Math.round((Date.now() - started) / 1000);
    sub.textContent =
      `Elapsed ${s}s — this can take about 60 seconds while the model wakes up.`;
  }, 1000);

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
    setLoading(false);
    document.getElementById("gain").textContent = "—";
    document.getElementById("band").textContent = "";
    document.getElementById("interpretation").innerHTML =
      `<span class="error">Error: ${e.message}</span>`;
    document.getElementById("disclaimer").textContent = "";
  } finally {
    clearInterval(timer);
    sub.textContent =
      "This can take about 60 seconds while the model wakes up.";
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
