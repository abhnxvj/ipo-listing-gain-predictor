// Build the form from /api/meta, then call /api/predict on submit.

let META = null;

async function loadMeta() {
  const res = await fetch("/api/meta");
  META = await res.json();

  // Accuracy banner
  const m = META.metrics;
  document.getElementById("accuracy").textContent =
    `Honest accuracy: R² ${m.r2} · typical error ±${m.mae} pp ` +
    `(tested on ${m.n_test} out-of-time IPOs, ${m.test_period}).`;

  // Input fields
  const fields = document.getElementById("fields");
  fields.innerHTML = "";
  for (const f of META.feature_meta) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.innerHTML = `
      <label for="${f.name}">${f.label}</label>
      <input id="${f.name}" name="${f.name}" type="number" step="any"
             value="${f.default}" />
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
    const res = await fetch("/api/predict", {
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
    result.querySelector("#gain").textContent = "—";
    document.getElementById("interpretation").innerHTML =
      `<span class="error">Error: ${e.message}</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Predict listing gain";
  }
}

document.getElementById("predict-form").addEventListener("submit", predict);
document.getElementById("reset-btn").addEventListener("click", resetToMedians);
loadMeta();
