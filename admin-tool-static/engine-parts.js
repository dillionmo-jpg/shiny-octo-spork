const state = { engineId: "", data: null, filter: "", hideEmpty: true };
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `${response.status} ${response.statusText}`);
  return payload;
}
function status(text, cls="") { const el=$("statusText"); el.textContent=text; el.className=cls; }

async function load(engineId = state.engineId) {
  try {
    const qs = engineId ? `?engineId=${encodeURIComponent(engineId)}` : "";
    state.data = await api(`/api/admin/engine-catalog${qs}`);
    state.engineId = String(state.data.selectedEngineId || "");
    render();
    status("Loaded engine catalog.", "ok");
  } catch (err) { status(`Load failed: ${err.message}`, "bad"); }
}

function render() {
  renderEngineSelect();
  renderStats();
  renderWarnings();
  renderCategories();
}
function renderEngineSelect() {
  const sel = $("engineSelect");
  sel.innerHTML = (state.data.engines || []).map(e => `<option value="${esc(e.id)}" ${String(e.id)===state.engineId?"selected":""}>${esc(e.displayName || e.engineCode || e.id)} — ${esc(e.id)}</option>`).join("");
}
function renderStats() {
  const e = state.data.selectedEngine || {};
  const t = state.data.totals || {};
  const max = state.data.estimatedMax || {};
  const stats = [
    [e.horsepower ?? 0, "Base HP"], [e.torque ?? 0, "Base TQ"], [t.count ?? 0, "Attached Parts"],
    [`+${num(t.hp)}`, "Attached HP"], [`+${num(t.tq)}`, "Attached TQ"], [num(t.weight), "Weight Delta"],
    [max.horsepower ?? 0, "Est. Max HP"], [max.torque ?? 0, "Est. Max TQ"], [t.oem ?? 0, "OEM Placeholders"],
  ];
  $("engineStats").innerHTML = stats.map(([v,l]) => `<div class="stat"><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`).join("");
}
function renderWarnings() {
  const w = state.data.warnings || [];
  $("warnings").innerHTML = w.map(x => `<div>⚠ ${esc(x)}</div>`).join("");
}
function categoryMatches(cat) {
  const f = state.filter.trim().toLowerCase();
  if (!f) return true;
  return JSON.stringify(cat).toLowerCase().includes(f);
}
function renderCategories() {
  const list = $("categoryList");
  const tpl = $("categoryTemplate");
  list.innerHTML = "";
  const cats = (state.data.categories || []).filter(cat => categoryMatches(cat)).filter(cat => !state.hideEmpty || cat.attachedCount > 0 || cat.candidateCount > 0);
  if (!cats.length) { list.innerHTML = `<section class="engineCategory"><div class="categoryHeader"><div class="categoryTitle">No categories match.</div></div></section>`; return; }
  for (const cat of cats) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.categoryId = cat.id;
    node.querySelector(".categoryTitle").textContent = `${cat.name} (${cat.id})`;
    node.querySelector(".categoryMeta").textContent = `${cat.attachedCount} attached | ${cat.candidateCount} available`;
    node.querySelector(".categoryHeader").addEventListener("click", (ev) => { if(ev.target.closest("button") && !ev.target.classList.contains("chevron")) return; node.classList.toggle("open"); });
    node.querySelector(".addPartBtn").addEventListener("click", async (ev) => { ev.stopPropagation(); await toggleAddPanel(node, cat); });
    fillCitySelect(node.querySelector(".newCity"));
    const tbody = node.querySelector("tbody");
    const parts = cat.attached || [];
    tbody.innerHTML = parts.length ? parts.map(renderPartRow).join("") : `<tr class="emptyRow"><td colspan="12">No parts attached to this engine in this category yet.</td></tr>`;
    tbody.querySelectorAll("tr.partRow").forEach(row => bindPartRow(row));
    list.appendChild(node);
  }
}
function renderPartRow(part) {
  const checked = (v) => v ? "checked" : "";
  return `<tr class="partRow" data-part-id="${esc(part.id)}">
    <td>${esc(part.legacyPartId || part.id)}</td>
    <td><input class="partName" data-field="name" value="${esc(part.name)}"></td>
    <td><input data-field="brand" value="${esc(part.brand)}"></td>
    <td><select data-field="cityId">${cityOptions(part.cityId)}</select></td>
    <td><input type="number" data-field="horsepowerDelta" value="${esc(part.horsepowerDelta || 0)}"></td>
    <td><input type="number" data-field="torqueDelta" value="${esc(part.torqueDelta || 0)}"></td>
    <td><input type="number" data-field="weightDeltaLbs" value="${esc(part.weightDeltaLbs || 0)}"></td>
    <td><input type="number" data-field="gripDelta" value="${esc(part.gripDelta || 0)}"></td>
    <td><input type="number" data-field="priceCash" value="${esc(part.priceCash || 0)}"></td>
    <td><input type="checkbox" data-field="isOem" ${checked(part.isOem)}></td>
    <td><input type="checkbox" data-field="enabled" ${checked(part.enabled !== false)}></td>
    <td class="actionsCell"><button class="rowBtn save">Save</button><button class="rowBtn dupe">Dupe</button><button class="rowBtn detach">Detach</button></td>
  </tr>`;
}
function cityOptions(selected) { return (state.data.cities || []).map(c => `<option value="${esc(c.id)}" ${String(c.id)===String(selected)?"selected":""}>${esc(c.name)}</option>`).join(""); }
function fillCitySelect(sel) { sel.innerHTML = cityOptions(100); }
function collectRowUpdates(row) {
  const updates = {};
  row.querySelectorAll("[data-field]").forEach(el => {
    const key = el.dataset.field;
    if (el.type === "checkbox") updates[key] = el.checked;
    else if (["cityId","horsepowerDelta","torqueDelta","weightDeltaLbs","gripDelta","priceCash"].includes(key)) updates[key] = Number(el.value || 0);
    else updates[key] = el.value;
  });
  return updates;
}
function bindPartRow(row) {
  const partId = row.dataset.partId;
  row.querySelector(".save").addEventListener("click", async () => {
    try { await api("/api/admin/engine-catalog/update-part", { method:"POST", body: JSON.stringify({ engineId: state.engineId, partId, updates: collectRowUpdates(row) }) }); await load(); status("Part saved.", "ok"); } catch(e){ status(e.message,"bad"); }
  });
  row.querySelector(".dupe").addEventListener("click", async () => {
    try { await api("/api/admin/engine-catalog/duplicate", { method:"POST", body: JSON.stringify({ engineId: state.engineId, partId }) }); await load(); status("Part duplicated for this engine.", "ok"); } catch(e){ status(e.message,"bad"); }
  });
  row.querySelector(".detach").addEventListener("click", async () => {
    if (!confirm("Detach this part from the selected engine? The part itself will remain in the global part pool.")) return;
    try { await api("/api/admin/engine-catalog/detach", { method:"POST", body: JSON.stringify({ engineId: state.engineId, partId }) }); await load(); status("Part detached.", "ok"); } catch(e){ status(e.message,"bad"); }
  });
}
async function toggleAddPanel(node, cat) {
  const panel = node.querySelector(".addPanel");
  panel.classList.toggle("hidden");
  if (!panel.classList.contains("hidden")) await loadCandidates(node, cat);
  node.querySelector(".candidateSearch").oninput = () => loadCandidates(node, cat);
  node.querySelector(".attachBtn").onclick = async () => {
    const partId = node.querySelector(".candidateSelect").value;
    if (!partId) return status("No candidate selected.", "bad");
    try { await api("/api/admin/engine-catalog/attach", { method:"POST", body: JSON.stringify({ engineId: state.engineId, partId }) }); await load(); status("Existing part attached.", "ok"); } catch(e){ status(e.message,"bad"); }
  };
  node.querySelector(".createBtn").onclick = async () => createPart(node, cat);
}
async function loadCandidates(node, cat) {
  const q = node.querySelector(".candidateSearch").value || "";
  const payload = await api(`/api/admin/engine-catalog/candidates?engineId=${encodeURIComponent(state.engineId)}&categoryId=${encodeURIComponent(cat.id)}&q=${encodeURIComponent(q)}`);
  const sel = node.querySelector(".candidateSelect");
  sel.innerHTML = payload.candidates.length ? payload.candidates.map(p => `<option value="${esc(p.id)}">${esc(p.legacyPartId || p.id)} — ${esc(p.name)} | HP ${esc(p.hp || 0)} / TQ ${esc(p.tq || 0)} / $${esc(p.priceCash || 0)}</option>`).join("") : `<option value="">No available parts in this category</option>`;
}
async function createPart(node, cat) {
  const input = {
    name: node.querySelector(".newName").value || "New Engine Part",
    brand: node.querySelector(".newBrand").value || "",
    model: node.querySelector(".newModel").value || "",
    priceCash: Number(node.querySelector(".newPrice").value || 0),
    horsepowerDelta: Number(node.querySelector(".newHp").value || 0),
    torqueDelta: Number(node.querySelector(".newTq").value || 0),
    weightDeltaLbs: Number(node.querySelector(".newWt").value || 0),
    cityId: Number(node.querySelector(".newCity").value || 100),
    isOem: node.querySelector(".newOem").checked,
  };
  try { await api("/api/admin/engine-catalog/create", { method:"POST", body: JSON.stringify({ engineId: state.engineId, categoryId: cat.id, input }) }); await load(); status("New part created and attached.", "ok"); } catch(e){ status(e.message,"bad"); }
}

$("engineSelect").addEventListener("change", e => load(e.target.value));
$("refreshBtn").addEventListener("click", () => load());
$("searchInput").addEventListener("input", e => { state.filter = e.target.value; renderCategories(); });
$("hideEmptyToggle").addEventListener("change", e => { state.hideEmpty = e.target.checked; renderCategories(); });
$("expandAllBtn").addEventListener("click", () => document.querySelectorAll(".engineCategory").forEach(x => x.classList.add("open")));
$("collapseAllBtn").addEventListener("click", () => document.querySelectorAll(".engineCategory").forEach(x => x.classList.remove("open")));
load();
