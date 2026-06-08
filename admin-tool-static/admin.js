const $ = (s, r=document) => r.querySelector(s);
const app = $("#app"), statusBox = $("#status"), dialog = $("#editorDialog"), fields = $("#dialogFields");
let state = { page:"dashboard", data:{}, counts:{}, warnings:[] };
async function api(path, opts={}){
  const res = await fetch(path, { headers: { "Content-Type": "application/json", "Accept": "application/json" }, ...opts });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; }
  catch {
    const preview = (text || res.statusText || "Empty response").slice(0, 240);
    throw new Error(`Expected JSON from ${path}, got ${res.status} ${res.statusText}: ${preview}`);
  }
  if(!res.ok || data.ok===false) throw new Error(data.error || res.statusText || `Request failed: ${path}`);
  return data;
}
function esc(v){ return String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function flash(msg,type="ok"){ statusBox.className=`status ${type}`; statusBox.textContent=msg; statusBox.classList.remove("hidden"); setTimeout(()=>statusBox.classList.add("hidden"),4500); }
function pageHeader(title, subtitle){ $("#pageTitle").textContent=title; $("#pageSubtitle").textContent=subtitle; document.querySelectorAll("nav a").forEach(a=>a.classList.toggle("active",a.dataset.page===state.page)); }
async function load(){ const data=await api("/api/admin/bootstrap"); state.data=data.content; state.counts=data.counts; state.warnings=data.warnings||[]; render(); }
function parsePage(raw){ const v=String(raw||"dashboard").replace(/^#/,""); const [page,arg]=v.split(":"); return {page:page||"dashboard", arg:arg||""}; }
function setPage(page){ const parsed=parsePage(page); state.page=parsed.page||"dashboard"; if(parsed.page==="engineParts") state.engineFilter=decodeURIComponent(parsed.arg||state.engineFilter||""); location.hash=state.page==="engineParts"&&state.engineFilter ? `engineParts:${encodeURIComponent(state.engineFilter)}` : state.page; render(); }
function render(){ ({dashboard:renderDashboard,cars:renderCars,engines:renderEngines,engineParts:renderEngineParts,paints:renderPaints,parts:renderParts,forcedInduction:renderForcedInduction,promptStudio:renderPromptStudio,playerPortal:renderPlayerPortal,oem:renderOem,publish:renderPublish}[state.page]||renderDashboard)(); }
function normalizeCityId(value, fallback=100){
  if(value===null || value===undefined || value==="") return fallback;
  const raw=String(value).trim();
  const n=Number(raw);
  if(Number.isFinite(n)){
    if([100,200,300,400,500].includes(n)) return n;
    if(n>=1 && n<=5) return [100,200,300,400,500][n-1];
  }
  const norm=raw.toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
  return ({"toreno":100,"newburge":200,"creek side":300,"creekside":300,"vista heights":400,"vista":400,"diamond pointe":500,"diamond point":500,"diamond":500}[norm]) || fallback;
}
function cityName(id){ const cid=normalizeCityId(id,id); return (state.data.cities||[]).find(c=>String(c.id)===String(cid))?.name || id || "-"; }
function engineName(id){ return (state.data.engines||[]).find(e=>String(e.id)===String(id))?.displayName || id || "-"; }
function catName(id){ return (state.data.categories||[]).find(c=>String(c.id)===String(id))?.name || id || "-"; }
function normCategoryText(value){ return String(value||"").toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g," ").trim(); }
function canonicalCategoryId(value){
  const raw=String(value||"").trim();
  const cats=state.data.categories||[];
  const direct=cats.find(c=>String(c.id)===raw || String(c.legacyId)===raw || normCategoryText(c.name)===normCategoryText(raw) || normCategoryText(c.id)===normCategoryText(raw));
  if(direct) return direct.id;
  const aliases={"air filter":"air_filters","air filters":"air_filters","intake system":"air_filters","intake pipe":"intake_pipes","intake pipes":"intake_pipes","cat converter":"catalytic_converters","cat converters":"catalytic_converters","cat conv":"catalytic_converters","cat convs":"catalytic_converters","cats":"catalytic_converters","catalytic converter":"catalytic_converters","catalytic converters":"catalytic_converters","cat back system":"piping","catback system":"piping","cat back":"piping","catback":"piping","throttle body":"throttle_bodies","throttle bodies":"throttle_bodies","tb":"throttle_bodies","tbs":"throttle_bodies","camshaft":"cams","camshafts":"cams","cam":"cams","cams":"cams","intercooler":"intercoolers","intercoolers":"intercoolers","intercooler piping":"turbo_piping","intercooler pipes":"turbo_piping","charge piping":"turbo_piping","turbo downpipe":"turbo_down_pipe","turbo downpipes":"turbo_down_pipe","turbo down pipe":"turbo_down_pipe","turbo down pipes":"turbo_down_pipe","downpipe":"turbo_down_pipe","downpipes":"turbo_down_pipe","down pipe":"turbo_down_pipe","down pipes":"turbo_down_pipe","turbo exhaust manifold":"turbo_exhaust_manifold","turbo exhaust manifolds":"turbo_exhaust_manifold","exhaust manifold":"turbo_exhaust_manifold","exhaust manifolds":"turbo_exhaust_manifold","fuel system":"fuel_pump","ignition":"spark_plugs","rotating assembly kits":"pistons","top end kits":"cylinder_heads","suspension":"springs_shocks","body aero":"strut_braces","blow off valve":"bov","blow off valves":"bov","bov":"bov","bovs":"bov","supercharger pulley":"supercharger_pulleys","supercharger pulleys":"supercharger_pulleys","pulley":"supercharger_pulleys","pulleys":"supercharger_pulleys","nitrous bottle":"nitrous_bottles","nitrous bottles":"nitrous_bottles","nos bottle":"nitrous_bottles","nos bottles":"nitrous_bottles","nitrous jet":"nitrous_jet_kits","nitrous jets":"nitrous_jet_kits","nitrous jet kit":"nitrous_jet_kits","nitrous jet kits":"nitrous_jet_kits","nos jet":"nitrous_jet_kits","nos jets":"nitrous_jet_kits","boost controller":"boost_controller","boost controllers":"boost_controller"};
  return aliases[normCategoryText(raw)] || raw;
}
function paintShape(){ const f=state.data.factoryColors||{}; return {paints:Array.isArray(f.paints)?f.paints:(Array.isArray(f)?f:[]), colorsByCarId:f.colorsByCarId||{}}; }
function paintName(id){ return paintShape().paints.find(p=>String(p.id)===String(id))?.name || id || "-"; }
function matches(obj,q){ q=String(q||"").toLowerCase(); return !q || JSON.stringify(obj).toLowerCase().includes(q); }
function card(label, value){ return `<div class="card"><strong>${value ?? 0}</strong><span>${label}</span></div>`; }
function renderDashboard(){ pageHeader("Dashboard","Review warnings before publishing game-facing files."); app.innerHTML=`<div class="cards">${card("Cars",state.counts.cars)}${card("Engines",state.counts.engines)}${card("Parts",state.counts.performanceParts)}${card("FI Catalog",(state.data.forcedInduction||[]).length)}${card("OEM Paints",state.counts.oemPaints)}${card("City Shops",state.counts.shops || 5)}</div><div class="panel"><div class="toolbar"><div><h2>Content warnings</h2><p>Fix these before publishing a larger catalog.</p></div><button id="validateBtn">Validate</button></div><div class="warningList">${state.warnings.length?state.warnings.map(w=>`<div class="warning"><span class="badge warn">${esc(w.type)}</span> ${esc(w.message)}</div>`).join(""):`<div class="badge good">No warnings</div>`}</div></div>`; $("#validateBtn").onclick=async()=>{ const r=await api("/api/admin/validate"); state.warnings=r.warnings; renderDashboard(); }; }
function renderCars(){ pageHeader("Cars","Select OEM paints from dropdowns, then link the car to an engine."); const q=new URLSearchParams(location.search).get("q")||""; const cars=(state.data.cars||[]).filter(c=>matches(c,q)); app.innerHTML=`<div class="panel"><div class="toolbar"><div class="left"><input class="search" id="carSearch" placeholder="Search cars..." value="${esc(q)}"><button id="addCar" class="primary">Add Car</button></div><span class="badge">${cars.length} shown</span></div><table><thead><tr><th>ID</th><th>Car</th><th>City</th><th>Engine</th><th>OEM Paints</th><th>Status</th><th></th></tr></thead><tbody>${cars.map(c=>`<tr><td>${esc(c.legacyCatalogId||c.id)}</td><td><strong>${esc(c.displayName)}</strong><br><small>${esc([c.year,c.make,c.model,c.submodel].filter(Boolean).join(" "))}</small></td><td>${esc(cityName(c.cityId))}</td><td>${esc(engineName(c.engineId))}</td><td>${(c.factoryPaintIds||c.factoryColors||[]).map(p=>`<span class="badge">${esc(paintName(p))}</span>`).join(" ")||"-"}</td><td><span class="badge ${c.enabled?'good':'bad'}">${c.enabled?'Enabled':'Disabled'}</span></td><td class="actions"><button data-edit-car="${esc(c.id)}">Edit</button><button data-link-car="${esc(c.id)}">Link Engine</button></td></tr>`).join("")}</tbody></table></div>`; $("#addCar").onclick=()=>openCarEditor(); $("#carSearch").oninput=e=>{ history.replaceState(null,"",`?q=${encodeURIComponent(e.target.value)}#cars`); renderCars(); }; document.querySelectorAll("[data-edit-car]").forEach(b=>b.onclick=()=>openCarEditor((state.data.cars||[]).find(c=>c.id===b.dataset.editCar))); document.querySelectorAll("[data-link-car]").forEach(b=>b.onclick=()=>openLinker(b.dataset.linkCar)); }
function renderEngines(){ pageHeader("Engines","Factory engine can be generated as an Installed part in the Engines category."); const engines=state.data.engines||[]; app.innerHTML=`<div class="panel"><div class="toolbar"><button id="addEngine" class="primary">Add Engine</button><span class="badge">${engines.length} engines</span></div><table><thead><tr><th>Code</th><th>Name</th><th>Layout</th><th>Power</th><th>Linked Cars</th><th></th></tr></thead><tbody>${engines.map(e=>`<tr><td>${esc(e.engineCode)}</td><td><strong>${esc(e.displayName)}</strong><br><small>${esc(e.makeModelSource||"")}</small></td><td>${esc(e.displacementLiters)}L ${esc(e.configuration)} ${esc(e.induction)}</td><td>${esc(e.horsepower)} HP / ${esc(e.torque)} TQ</td><td>${(state.data.cars||[]).filter(c=>c.engineId===e.id).map(c=>`<span class="badge good">${esc(c.displayName)}</span>`).join(" ")||"-"}</td><td class="actions"><button data-catalog-engine="${esc(e.id)}">Parts Catalog</button><button data-edit-engine="${esc(e.id)}">Edit</button></td></tr>`).join("")}</tbody></table></div>`; $("#addEngine").onclick=()=>openEngineEditor(); document.querySelectorAll("[data-edit-engine]").forEach(b=>b.onclick=()=>openEngineEditor(engines.find(e=>e.id===b.dataset.editEngine))); document.querySelectorAll("[data-catalog-engine]").forEach(b=>b.onclick=()=>{ state.engineFilter=b.dataset.catalogEngine; setPage(`engineParts:${encodeURIComponent(state.engineFilter)}`); }); }
function renderPaints(){ pageHeader("OEM Paints","Create named OEM paint colors from hex codes, then assign them on the car editor."); const paints=paintShape().paints; app.innerHTML=`<div class="panel"><div class="toolbar"><button id="addPaint" class="primary">Add OEM Paint</button><span class="badge">${paints.length} paints</span></div><table><thead><tr><th>Color</th><th>Name</th><th>Hex</th><th>Notes</th><th></th></tr></thead><tbody>${paints.map(p=>`<tr><td><span class="swatch" style="background:${esc(p.hex)}"></span></td><td><strong>${esc(p.name)}</strong></td><td>${esc(p.hex)}</td><td>${esc(p.notes||"")}</td><td><button data-edit-paint="${esc(p.id)}">Edit</button></td></tr>`).join("")}</tbody></table></div>`; $("#addPaint").onclick=()=>openPaintEditor(); document.querySelectorAll("[data-edit-paint]").forEach(b=>b.onclick=()=>openPaintEditor(paints.find(p=>p.id===b.dataset.editPaint))); }
function partsForEngine(engineId,{includeOem=false}={}){ return (state.data.performanceParts||[]).filter(p=> (includeOem || !p.isOem) && (!engineId || (p.compatibleEngineIds||[]).map(String).includes(String(engineId)))); }
function groupPartsByCategory(parts){ const groups=new Map(); for(const p of parts){ const key=String(canonicalCategoryId(p.categoryId)||"uncategorized"); if(!groups.has(key)) groups.set(key,[]); groups.get(key).push(p); } return [...groups.entries()].sort((a,b)=>catName(a[0]).localeCompare(catName(b[0]))); }
function renderParts(){ pageHeader("Parts","Aftermarket/performance parts only. OEM placeholders are hidden here and generated from the OEM Generator."); const q=new URLSearchParams(location.search).get("partq")||""; const engineFilter=new URLSearchParams(location.search).get("engine")||""; const page=Math.max(1,Number(new URLSearchParams(location.search).get("p")||1)); const pageSize=20; const engines=state.data.engines||[]; const allParts=partsForEngine(engineFilter).filter(p=>matches(p,q)); const totalPages=Math.max(1,Math.ceil(allParts.length/pageSize)); const safePage=Math.min(page,totalPages); const shown=allParts.slice((safePage-1)*pageSize,safePage*pageSize); const oemHidden=(state.data.performanceParts||[]).filter(p=>p.isOem).length; const grouped=groupPartsByCategory(shown); app.innerHTML=`<div class="panel"><div class="toolbar"><div class="left"><input class="search" id="partSearch" placeholder="Search non-OEM parts..." value="${esc(q)}"><select id="enginePartFilter"><option value="">All engines</option>${engines.map(e=>`<option value="${esc(e.id)}" ${String(e.id)===String(engineFilter)?"selected":""}>${esc(e.displayName)}</option>`).join("")}</select><button id="addPart" class="primary">Add Part</button><button id="importParts">Import AI CSV</button><button id="undoImportParts">Undo Last Import</button></div><div class="actions"><span class="badge">${allParts.length} non-OEM</span><span class="badge">${oemHidden} OEM hidden</span></div></div>${grouped.length?grouped.map(([cat,items])=>`<details class="catGroup" open><summary><strong>${esc(catName(cat))}</strong><span class="badge">${items.length} shown</span><button data-add-cat="${esc(cat)}">+ Add in Category</button></summary>${partTable(items)}</details>`).join(""):`<div class="warning">No non-OEM parts match this filter.</div>`}<div class="pager"><button id="prevParts" ${safePage<=1?"disabled":""}>Previous</button><span class="badge">Page ${safePage} of ${totalPages}</span><button id="nextParts" ${safePage>=totalPages?"disabled":""}>Next</button></div></div>`; $("#addPart").onclick=()=>openPartEditor({}, engineFilter?{compatibleEngineIds:[engineFilter]}:{}); $("#importParts").onclick=()=>openPartsImportDialog(engineFilter); $("#undoImportParts").onclick=undoLastPartsImport; document.querySelectorAll("[data-edit-part]").forEach(b=>b.onclick=()=>openPartEditor((state.data.performanceParts||[]).find(p=>p.id===b.dataset.editPart))); document.querySelectorAll("[data-delete-part]").forEach(b=>b.onclick=()=>deletePart(b.dataset.deletePart)); document.querySelectorAll("[data-move-part]").forEach(b=>b.onclick=()=>openMovePartCategory(b.dataset.movePart)); document.querySelectorAll("[data-add-cat]").forEach(b=>b.onclick=(ev)=>{ ev.preventDefault(); openPartEditor({}, {categoryId:b.dataset.addCat, compatibleEngineIds:engineFilter?[engineFilter]:[]}); }); $("#partSearch").oninput=e=>{ history.replaceState(null,"",`?partq=${encodeURIComponent(e.target.value)}&engine=${encodeURIComponent(engineFilter)}&p=1#parts`); renderParts(); }; $("#enginePartFilter").onchange=e=>{ history.replaceState(null,"",`?partq=${encodeURIComponent(q)}&engine=${encodeURIComponent(e.target.value)}&p=1#parts`); renderParts(); }; $("#prevParts").onclick=()=>{ history.replaceState(null,"",`?partq=${encodeURIComponent(q)}&engine=${encodeURIComponent(engineFilter)}&p=${safePage-1}#parts`); renderParts(); }; $("#nextParts").onclick=()=>{ history.replaceState(null,"",`?partq=${encodeURIComponent(q)}&engine=${encodeURIComponent(engineFilter)}&p=${safePage+1}#parts`); renderParts(); }; }
function partTable(parts){ return `<table class="partTable"><thead><tr><th>Part</th><th>City</th><th>Engine/Car Compat</th><th>Price</th><th>Stats</th><th>FI Metadata</th><th></th></tr></thead><tbody>${parts.map(p=>`<tr><td><strong>${esc(p.name)}</strong><br><small>${esc(p.brand||"")} ${esc(p.model||"")}</small></td><td>${esc(cityName(p.cityId))}</td><td><small>${(p.compatibleEngineIds||[]).map(id=>`<span class="badge">${esc(engineName(id))}</span>`).join(" ")||"All engines"}<br>${(p.compatibleCarIds||[]).map(id=>`<span class="badge">Car ${esc(id)}</span>`).join(" ")}</small></td><td>$${Number(p.priceMoney||0).toLocaleString()}<br><small>${esc(p.pricePoints||0)} pts</small></td><td>${esc(p.horsepowerDelta||0)} HP / ${esc(p.torqueDelta||0)} TQ<br><small>${esc(p.gripDelta||0)} grip / ${esc(p.weightDelta||0)} wt</small></td><td>${p.forceInductionType?`<span class="badge warn">${esc(p.forceInductionType)}</span><br><small>${esc(p.maxPsi||0)} PSI / ${esc(p.spoolStartRpm||0)}-${esc(p.fullBoostRpm||0)} RPM</small>`:"-"}</td><td><button data-edit-part="${esc(p.id)}">Edit</button><button data-move-part="${esc(p.id)}">Move Category</button><button class="danger" data-delete-part="${esc(p.id)}">Delete</button></td></tr>`).join("")}</tbody></table>`; }
function renderEngineParts(){ const engine=(state.data.engines||[]).find(e=>String(e.id)===String(state.engineFilter)); if(!engine){ pageHeader("Engine Parts Catalog","Choose an engine from the Engines page."); app.innerHTML=`<div class="panel"><p>No engine selected.</p><button onclick="location.hash='engines'">Back to Engines</button></div>`; return; } pageHeader(`${engine.displayName} Parts Catalog`,`Create or attach aftermarket parts assigned to this engine. OEM placeholders are hidden from this working catalog.`); const q=new URLSearchParams(location.search).get("epq")||""; const parts=partsForEngine(engine.id).filter(p=>matches(p,q)); const oemHidden=(state.data.performanceParts||[]).filter(p=>p.isOem && (p.compatibleEngineIds||[]).map(String).includes(String(engine.id))).length; const categories=state.data.categories||[]; const groups=categories.map(c=>[c.id,parts.filter(p=>String(canonicalCategoryId(p.categoryId))===String(c.id))]).filter(([_,items])=>items.length || true); app.innerHTML=`<div class="panel engineCatalogHead"><div><h2>${esc(engine.engineCode||engine.displayName)}</h2><p>${esc(engine.displacementLiters)}L ${esc(engine.configuration)} ${esc(engine.induction)} - ${esc(engine.horsepower)} HP / ${esc(engine.torque)} TQ</p></div><div class="actions"><input class="search" id="enginePartSearch" placeholder="Search this engine catalog..." value="${esc(q)}"><button class="primary" id="addEnginePart">Add Part</button><button id="forceEngineLinks">Force Compat Links</button><button id="backEngines">Back to Engines</button></div></div><div class="panel"><div class="toolbar"><span class="badge">${parts.length} non-OEM parts</span><span class="badge">${oemHidden} OEM hidden</span><span class="badge">Use Attach Existing to reuse any non-OEM catalog part across multiple engines/cars</span></div>${groups.map(([cat,items])=>`<details class="catGroup" ${items.length?'open':''}><summary><strong>${esc(catName(cat))}</strong><span class="badge">${items.length} parts</span><button data-attach-existing-cat="${esc(cat)}">Attach Existing</button>${cat==="engines"?`<button data-attach-engine-swap-cat="${esc(cat)}">Attach Engine Swap</button>`:""}${isFiMainCategory(cat)?`<button data-attach-fi-cat="${esc(cat)}">Attach from FI Studio</button>`:""}<button data-add-oem-cat="${esc(cat)}">Create OEM Part</button><button data-add-engine-cat="${esc(cat)}">+ Add Custom Part</button></summary>${items.length?partTable(items):`<div class="emptyCat">No parts for this engine/category yet.</div>`}</details>`).join("")}</div>`; $("#backEngines").onclick=()=>setPage("engines"); $("#forceEngineLinks").onclick=()=>forceEnginePartLinks(engine.id); $("#addEnginePart").onclick=()=>openPartEditor({}, {compatibleEngineIds:[engine.id]}); $("#enginePartSearch").oninput=e=>{ history.replaceState(null,"",`?epq=${encodeURIComponent(e.target.value)}#engineParts:${encodeURIComponent(engine.id)}`); renderEngineParts(); }; document.querySelectorAll("[data-edit-part]").forEach(b=>b.onclick=()=>openPartEditor((state.data.performanceParts||[]).find(p=>p.id===b.dataset.editPart))); document.querySelectorAll("[data-delete-part]").forEach(b=>b.onclick=()=>deletePart(b.dataset.deletePart)); document.querySelectorAll("[data-move-part]").forEach(b=>b.onclick=()=>openMovePartCategory(b.dataset.movePart)); document.querySelectorAll("[data-add-engine-cat]").forEach(b=>b.onclick=(ev)=>{ ev.preventDefault(); openPartEditor({}, {categoryId:b.dataset.addEngineCat, compatibleEngineIds:[engine.id], forceInductionType:fiKindForCategory(b.dataset.addEngineCat)||""}); }); document.querySelectorAll("[data-add-oem-cat]").forEach(b=>b.onclick=(ev)=>{ ev.preventDefault(); const carsForEngine=(state.data.cars||[]).filter(c=>String(c.engineId)===String(engine.id)); const car=carsForEngine[0]||{}; openPartEditor({}, {name:`OEM ${catName(b.dataset.addOemCat)}`, brand:"OEM", model:catName(b.dataset.addOemCat), categoryId:b.dataset.addOemCat, cityId:normalizeCityId(car.cityId,100), isOem:true, installedByDefault:true, purchasable:false, enabled:true, priceMoney:0, pricePoints:0, horsepowerDelta:0, torqueDelta:0, gripDelta:0, weightDelta:0, compatibleEngineIds:[engine.id], compatibleCarIds:carsForEngine.map(c=>c.id)}); }); document.querySelectorAll("[data-attach-fi-cat]").forEach(b=>b.onclick=(ev)=>{ ev.preventDefault(); openAttachFiToEngine(engine.id,b.dataset.attachFiCat); }); document.querySelectorAll("[data-attach-engine-swap-cat]").forEach(b=>b.onclick=(ev)=>{ ev.preventDefault(); openAttachEngineSwapToEngine(engine.id); }); document.querySelectorAll("[data-attach-existing-cat]").forEach(b=>b.onclick=(ev)=>{ ev.preventDefault(); openAttachExistingPartToEngine(engine.id,b.dataset.attachExistingCat); }); }
function renderOem(){
  pageHeader("OEM Part Generator","Generate one do-nothing OEM placeholder per category, plus an Installed factory engine.");
  const cars=state.data.cars||[];
  app.innerHTML=`<div class="panel"><h2>Generate OEM parts for a car</h2><p>This creates Installed OEM placeholders in the car purchase city only. Turbo factory engines also get turbo OEM categories. Supercharged factory engines get supercharger + pulley.</p><br><label>Car<select id="oemCar">${cars.map(c=>`<option value="${esc(c.id)}">${esc(c.displayName)} - ${esc(cityName(c.cityId))}</option>`).join("")}</select></label><br><button id="genOem" class="primary">Generate missing OEM parts</button><button id="rebuildOem" class="danger">Rebuild OEM for Selected Car</button><button id="repairOem" class="danger">Repair Existing OEM Placement</button><button id="cleanStrayOem">Clean Stray OEM Duplicates</button><p class="routeNote">Repair moves existing OEM parts to the selected car/engine purchase city, removes invalid OEM Fuel Cell / Low Compression Pistons, de-dupes categories, and normalizes the CMS to 5 city shops.</p></div>`;
  $("#genOem").onclick=async()=>{ const carId=$("#oemCar").value; const r=await api("/api/admin/generate-oem-parts",{method:"POST",body:JSON.stringify({carId})}); flash(`Created ${r.created} missing OEM part(s).`); await load(); }; $("#rebuildOem").onclick=async()=>{ const carId=$("#oemCar").value; if(!confirm("Delete and rebuild all CMS OEM parts for this selected car/engine? This does not touch player cars until you run Player Portal repair.")) return; const r=await api("/api/admin/rebuild-oem-parts",{method:"POST",body:JSON.stringify({carId})}); flash(`Rebuilt OEM: removed ${r.removed}, created ${r.created}.`); await load(); };
  $("#repairOem").onclick=async()=>{ if(!confirm("Repair OEM placement and normalize city shops? Backups will be made.")) return; const r=await api("/api/admin/repair-oem-placement",{method:"POST",body:"{}"}); flash(`OEM repair complete: moved ${r.moved}, removed ${r.removed}, de-duped ${r.deDuped}.`); await load(); };
  $("#cleanStrayOem").onclick=async()=>{ if(!confirm("Clean stray/duplicate OEM parts and normalize supercharger category IDs? Backups will be made.")) return; const r=await api("/api/admin/clean-stray-oem",{method:"POST",body:"{}"}); flash(`Cleaned OEM: removed ${r.removed}, moved ${r.moved}, de-duped ${r.deDuped}. Publish after this.`); await load(); renderOem(); };
}

function fiKindBadge(item){ const label=item.kind === "Supercharger" && item.superchargerStyle ? `${item.kind}: ${item.superchargerStyle}` : item.kind; return `<span class="badge warn">${esc(label||"FI")}</span>`; }
const REGULAR_PART_CATEGORIES = `Air Filters, Intake Pipes, Motor Mounts, Springs & Shocks, Strut Braces, Sway Bars, Control Arms, Torsion Bars, Brakes, Seats, Radiators, Thermostat, Muffler, Exhaust Piping, Catalytic Converters, Headers, Turbo Down Pipe, Turbo Exhaust Manifold, Exhaust Thermo-wrap, Intake Manifold, Throttle Bodies, Cam Gears, Cams, Connecting Rods, Crankshaft, Cylinder Block, Cylinder Heads, Head Gaskets, Oil Coolers, Oil Filters, Oil Pump, Pistons, Valve Springs, Valves, Intercoolers, Turbo Piping, Blow Off Valves, ECU, Battery, Spark Plug Cables, Spark Plugs, Fuel Pump, Fuel Rail, Injectors, Fuel Pressure Regulator, Fuel Cell, Fuel Coolers, Fuel Filters, Nitrous Bottles, Nitrous Jet Kits, Supercharger Pulleys`;
const IMPORTABLE_PART_COLUMNS = `Category,City,Brand,Part Name,Model,Purchasable?,Trophy/Reward Only?,Money Price,Points Price,HP Add,TQ Add,Grip Add,Weight Change,Nitrous Shot HP,Nitrous Bottle Capacity Lbs,Compatible Engine IDs,Compatible Car IDs,Best In Category?,Notes`;
const REGULAR_PART_IMPORT_PROMPT = `I am creating importable aftermarket performance parts for a Nitto 1320 Legends remake CMS.

Return ONLY a CSV file or CSV code block. Do not return JSON. Do not add explanation before or after the CSV.

Create [NUMBER] parts for this car/engine:
Car: [CAR YEAR MAKE MODEL / CMS CAR ID]
Engine: [ENGINE CODE / DISPLACEMENT / CONFIGURATION / CMS ENGINE ID]
Target full build goal: [EX: +180 HP, +130 TQ, -220 lb, improved grip]
City plan: spread parts across Toreno, Newburge, Creek Side, Vista Heights, and Diamond Pointe.

Use this CSV header exactly:
${IMPORTABLE_PART_COLUMNS}

Allowed categories, using these exact category names only:
${REGULAR_PART_CATEGORIES}

Coverage rules:
- For a full car pack, do NOT only make 2-3 parts per broad area. Create enough parts to populate the actual engine catalog.
- Preferred full-pack coverage is one part per category per city, meaning 5 rows per category, unless I ask for a smaller pack.
- At minimum, include at least 1 row for every allowed category that makes sense for the car/engine.
- Critical categories that must not be skipped: Intake Pipes, Motor Mounts, Sway Bars, Control Arms, Torsion Bars, Seats, Thermostat, Muffler, Headers, Exhaust Thermo-wrap, Cam Gears, Crankshaft, Cylinder Block, Oil Coolers, Oil Pump, Valves, ECU, Battery, Fuel Pressure Regulator, Fuel Cell, Fuel Filters, and Supercharger Pulleys.
- Do not use umbrella category names such as Intake System, Fuel System, Ignition, Suspension, Body Aero, Top End Kits, Rotating Assembly Kits, or Cat-back System. Use the exact CMS category names listed above.

Rules:
- Do not create Turbo or Supercharger main-unit parts in this prompt. Those are created in Forced Induction Studio.
- You MAY create related forced-induction support parts: Turbo Down Pipe, Turbo Exhaust Manifold, Intercoolers, Turbo Piping, Blow Off Valves, Headers, and Supercharger Pulleys.
- Headers are for naturally aspirated/supercharged exhaust setups. Turbo Exhaust Manifold is for turbo systems. Do not describe Headers as compatible with an installed turbo system.
- Supercharger Pulleys are pulley parts for supercharger systems only. They are not a standalone supercharger.
- Do not generate utility/global feature-unlock parts unless explicitly requested: Boost Controller, Air Fuel Meter, Engine Diagnostic Tool, Traction Control, Coolant Additives, and Lubricants. Those are per-car utility purchases, not normal build-pack progression parts.
- 1320 Legends does not use rarity. Do not include rarity.
- City must be one of: Toreno, Newburge, Creek Side, Vista Heights, Diamond Pointe.
- Spread parts across all cities. Do not make Diamond Pointe always the best or always the most expensive.
- Some earlier-city parts should remain useful later through tradeoffs like low weight, good torque, or budget value.
- Trophy/Reward Only parts are unpurchasable from part shops. If Trophy/Reward Only? is Yes, Purchasable? must be No and prices should be 0.
- Money Price should scale with usefulness, but not only by city.
- Points Price should default to about 25% of Money Price unless Trophy/Reward Only is Yes.
- Weight Change should be negative for weight-loss items like Seats and Fuel Cell when appropriate.
- Nitrous Bottles should range from small 10 lb bottles up to two 20 lb bottle setups. For Nitrous Bottles, set Nitrous Bottle Capacity Lbs to total bottle capacity, e.g. single 10 lb = 10, dual 10 lb = 20, dual 20 lb = 40, and set Nitrous Shot HP to 0.
- Nitrous Jet Kits control shot size. For Nitrous Jet Kits, set Nitrous Shot HP to the shot size, e.g. 50, 100, 150, 200, 250, 300, and set Nitrous Bottle Capacity Lbs to 0.
- Do not add HP Add/TQ Add to Nitrous Bottles. The bottle stores capacity only.
- For Nitrous Jet Kits, HP Add may mirror the shot size for legacy display, but Nitrous Shot HP is the source of truth for runtime NOS power.
- HP Add, TQ Add, Grip Add, and Weight Change must be numeric only.
- Compatible Engine IDs should be [ENGINE ID] unless I specify otherwise.
- Compatible Car IDs should be blank for engine-bound parts so engine swaps can carry parts forward. Only use [CAR ID] for car/chassis-bound parts like Brakes, Motor Mounts, Springs & Shocks, Strut Braces, Sway Bars, Control Arms, Torsion Bars, Seats, Fuel Cell, Wheels, Tires, or body/chassis items if explicitly requested.
- Mark exactly one best overall part per category with Best In Category? = Yes, and all others No.
- Notes should briefly explain the balancing purpose.
- Make the generated part names and models feel inspired by real-world aftermarket brands, but do not copy trademark-heavy names if uncertain.`

const PROMPT_PRESETS = {
  fivePartTest: {
    title: "Importable 5-Part City Spread Test",
    subtitle: "Creates 5 CSV rows that can be imported into Parts → Import AI CSV.",
    prompt: `I am creating importable aftermarket performance parts for a Nitto 1320 Legends remake CMS.

Return ONLY a CSV file or CSV code block. Do not return JSON. Do not add explanation before or after the CSV.

Create exactly 5 parts for this car/engine:
Car: [CAR YEAR MAKE MODEL / CMS CAR ID]
Engine: [ENGINE CODE / DISPLACEMENT / CONFIGURATION / CMS ENGINE ID]
Target test goal: [EX: +35 HP, +25 TQ, -40 lb]

Put exactly one part in each city:
- Toreno
- Newburge
- Creek Side
- Vista Heights
- Diamond Pointe

Use this CSV header exactly:
${IMPORTABLE_PART_COLUMNS}

Allowed categories for this test only:
${REGULAR_PART_CATEGORIES}

Rules:
- Do not create Turbo or Supercharger main-unit parts in this prompt.
- You MAY create support parts like intercoolers, turbo piping, BOVs, turbo manifolds, down pipes, and supercharger pulleys.
- Do not generate utility/global feature-unlock parts unless explicitly requested: Boost Controller, Air Fuel Meter, Engine Diagnostic Tool, Traction Control, Coolant Additives, and Lubricants.
- If creating Nitrous Bottles or Nitrous Jet Kits, fill the nitrous metadata columns: bottles get capacity lbs, jets get shot HP.
- 1320 Legends does not use rarity. Do not include rarity.
- City must be one of: Toreno, Newburge, Creek Side, Vista Heights, Diamond Pointe.
- Not every Diamond Pointe part should be the best.
- Trophy/Reward Only parts are unpurchasable from shops.
- HP Add, TQ Add, Grip Add, and Weight Change must be numeric only.
- Compatible Engine IDs should be [ENGINE ID].
- Compatible Car IDs should be [CAR ID].
- Mark Best In Category? as Yes only when that row is intended to be the strongest/useful best part for its category.
- Notes should briefly explain the part's balancing purpose.`
  },
  fullCarPack: {
    title: "Full Car Part Shop Pack",
    subtitle: "Generate a full aftermarket part list for one car across compatible categories and cities.",
    prompt: `I am creating a full aftermarket parts catalog for one car in a Nitto 1320 Legends remake CMS.

Do NOT return JSON.
Return ONLY a CSV file or CSV code block. Do not return JSON. Use the exact CSV header listed below so I can import it into my CMS.

Car: [CAR YEAR MAKE MODEL]
Engine: [ENGINE CODE / DISPLACEMENT / CONFIGURATION / INDUCTION]
Stock HP/TQ/Weight: [HP] HP / [TQ] TQ / [WEIGHT] lb
Full-build target goal: [EX: +220 HP, +180 TQ, -280 lb]
Preferred city focus, optional: [EX: mostly Toreno/Newburge early-game, or balanced all cities]
Exclude forced-induction main units: Yes. Do not create Turbochargers or Superchargers.
Allowed forced-induction support parts: manifolds, down pipes, piping, intercoolers, BOVs, pulleys only if compatible. Do not generate Boost Controller here unless I specifically ask for utility/global parts.

Create parts across compatible categories and spread them across these cities:
Toreno, Newburge, Creek Side, Vista Heights, Diamond Pointe

Use these exact CMS category names only. Do not use broad umbrella names:
${REGULAR_PART_CATEGORIES}

Coverage requirement:
- For a real full-car pack, aim for one part per category per city, meaning 5 rows per category.
- At minimum, include every category that makes sense for the car/engine.
- Do not skip small/support categories like Intake Pipes, Motor Mounts, Sway Bars, Control Arms, Torsion Bars, Seats, Thermostat, Muffler, Headers, Exhaust Thermo-wrap, Cam Gears, Crankshaft, Cylinder Block, Oil Coolers, Oil Pump, Valves, ECU, Battery, Fuel Pressure Regulator, Fuel Cell, Fuel Filters, or Supercharger Pulleys.
- Do not use umbrella category names such as Intake System, Fuel System, Ignition, Suspension, Body Aero, Top End Kits, Rotating Assembly Kits, or Cat-back System.

Use this CSV header exactly for every part row:
${IMPORTABLE_PART_COLUMNS}

Rules:
- 1320 Legends does not use rarity. Do not include rarity.
- Do not create OEM placeholder parts. These are aftermarket upgrades only.
- Do not create Turbocharger or Supercharger main units in this prompt.
- Trophy/Reward Only means unpurchasable from part shops.
- Include a few Trophy/Reward Only parts, but most parts should be purchasable.
- Do not generate utility/global feature-unlock parts unless explicitly requested: Boost Controller, Air Fuel Meter, Engine Diagnostic Tool, Traction Control, Coolant Additives, and Lubricants.
- Headers are for naturally aspirated/supercharged exhaust setups. Turbo Exhaust Manifold is for turbo systems. Do not describe Headers as compatible with an installed turbo system.
- Supercharger Pulleys are pulley parts for supercharger systems only. They are not a standalone supercharger.
- Nitrous Bottles store bottle capacity only; Nitrous Jet Kits store shot size only. A working NOS setup needs both a bottle and a jet kit.
- Compatible Engine IDs should be [ENGINE ID] for engine-bound parts. Compatible Car IDs should usually be blank for engine-bound parts so engine swaps work cleanly.
- Do not place all best parts in Diamond Pointe.
- The best full build should require parts from multiple cities.
- Give each category a clear progression from mild to stronger parts when appropriate.
- Points Price should usually be about 25% of Money Price unless Trophy/Reward Only.
- HP/TQ/Weight gains must add up near the full-build target if the best part from each category is equipped.
- Mark the best part in each category by starting Notes with "BEST IN CATEGORY -".
- Balance for drag racing, not fantasy dyno numbers.
- After the CSV, do not add a prose summary. Instead include best-part information only inside the Best In Category? and Notes columns.`
  },
  turboCatalog: {
    title: "Turbocharger Catalog Table",
    subtitle: "Generate turbo data to type into the Forced Induction Studio or Add Part modal.",
    prompt: `I am creating turbocharger parts for a Nitto 1320 Legends remake CMS.

Do NOT return JSON.
Return ONLY CSV, with no extra explanation before or after it.

Create [NUMBER] turbocharger parts.
Compatible engine focus: [EX: B18C1 1.8L I4, small displacement FWD drag build]
City focus: [EX: spread across all cities, or Toreno only]
Power target range: [EX: +35 HP to +180 HP]

Use this CSV header exactly:
Part Type | Brand | Part Name | Model | City | Purchasable? | Trophy/Reward Only? | Compatible Engine Types | Recommended Displacement | Money Price | Points Price | HP Add | TQ Add | Max PSI | Weight Change | Turbo Spool Start RPM | Turbo Full Boost RPM | Turbo Falloff RPM | Turbo A/R Ratio | Notes

Rules:
- Part Type must be Turbo.
- Cities must be one of: Toreno, Newburge, Creek Side, Vista Heights, Diamond Pointe.
- 1320 Legends does not use rarity. Do not include rarity.
- Trophy/Reward Only parts are unpurchasable from shops.
- Do not put all best turbos in Diamond Pointe.
- Earlier city turbos can stay useful if they spool faster or weigh less.
- Make power, spool, boost, and price tradeoffs clear.
- Balance for drag racing.
- Notes should explain the intended use in one short sentence.`
  },
  superchargerCatalog: {
    title: "Supercharger Catalog Table",
    subtitle: "Generate supercharger data with type-specific fields.",
    prompt: `I am creating supercharger parts for a Nitto 1320 Legends remake CMS.

Do NOT return JSON.
Return ONLY CSV, with no extra explanation before or after it.

Create [NUMBER] supercharger parts.
Compatible engine focus: [EX: V6/V8, street/drag]
City focus: [EX: spread across all cities, or Newburge/Diamond Pointe]
Power target range: [EX: +45 HP to +220 HP]

Use this CSV header exactly:
Part Type | Supercharger Type | Brand | Part Name | Model | City | Purchasable? | Trophy/Reward Only? | Compatible Engine Types | Recommended Displacement | Money Price | Points Price | HP Add | TQ Add | Max PSI | Weight Change | Pulley Ratio | Boost Curve | Parasitic Loss HP | Notes

Rules:
- Part Type must be Supercharger.
- Supercharger Type must be one of: Roots, Centrifugal, TwinScroll, Electric, ProCharger.
- Cities must be one of: Toreno, Newburge, Creek Side, Vista Heights, Diamond Pointe.
- 1320 Legends does not use rarity. Do not include rarity.
- Trophy/Reward Only parts are unpurchasable from shops.
- Roots should usually have strong low-end torque and more heat/weight tradeoff.
- Centrifugal and ProCharger should usually be stronger up top.
- Electric should be niche, limited, or early-spool focused unless specified otherwise.
- Make power, boost, pulley, price, and weight tradeoffs clear.
- Balance for drag racing.
- Notes should explain the intended use in one short sentence.`
  },
  regularPartsImport: {
    title: "Importable Full Part Shop Pack",
    subtitle: "Generates CMS-importable CSV rows across all regular categories and cities.",
    prompt: REGULAR_PART_IMPORT_PROMPT
  },
  enginePrompt: {
    title: "Engine Data Table",
    subtitle: "Generate engine specs to type into the Engines page.",
    prompt: `I am creating an engine entry for a Nitto 1320 Legends remake CMS.

Do NOT return JSON.
Return a clearly labeled table only.

Create engine data for:
Engine/car: [EX: Acura Integra GS-R B18C1]

Use this CSV header exactly:
Engine Code | Display Name | Make/Model Source | Displacement Liters | Cylinder Count | Configuration | Induction | Horsepower | Torque | HP RPM | Torque RPM | Redline RPM | Idle RPM | Engine Weight Lbs | Fuel Type | Notes

Rules:
- Use realistic factory-style specs.
- Induction must be NA, Turbo, Twin Turbo, or Supercharged.
- Notes should include any important factory forced-induction/OEM metadata concern.
- Return one row unless I ask for multiple engines.`
  }
};
function presetButton(key){ const p=PROMPT_PRESETS[key]; return `<button data-prompt-preset="${esc(key)}"><strong>${esc(p.title)}</strong><small>${esc(p.subtitle)}</small></button>`; }
function openPartsImportDialog(engineFilter=""){
  const engines=state.data.engines||[];
  const cars=state.data.cars||[];
  fields.innerHTML=`<label class="wide">Upload CSV File<input id="partsImportFile" type="file" accept=".csv,text/csv"></label><label class="wide">Or Paste AI CSV<textarea id="partsImportText" rows="14" placeholder="Category,City,Brand,Part Name,Model,Purchasable?,Trophy/Reward Only?,Money Price,Points Price,HP Add,TQ Add,Grip Add,Weight Change,Compatible Engine IDs,Compatible Car IDs,Best In Category?,Notes\nAir Filters,Toreno,Example,Street Panel Filter,SPF-1,Yes,No,350,88,2,1,0,0,[ENGINE ID],[CAR ID],No,Starter airflow upgrade"></textarea></label><label>Assign Engine<select id="partsImportEngine"><option value="">Use CSV values only</option>${engines.map(e=>`<option value="${esc(e.id)}" ${String(e.id)===String(engineFilter)?"selected":""}>${esc(e.displayName)}</option>`).join("")}</select></label><label>Assign Car<select id="partsImportCar"><option value="">Use CSV values only</option>${cars.map(c=>`<option value="${esc(c.id)}">${esc(c.displayName)}</option>`).join("")}</select></label><div class="infoBox wide"><strong>Required CSV header:</strong><br><code>${esc(IMPORTABLE_PART_COLUMNS)}</code><br><br>Turbo and Supercharger main units are blocked here. Use Forced Induction Studio for those. Markdown tables still work as a fallback, but CSV is preferred.</div>`;
  $("#dialogTitle").textContent="Import AI Parts CSV";
  $("#dialogHint").textContent="Upload or paste the exact CSV from AI Prompt Studio. The importer creates non-OEM draft parts. Selected Assign Engine/Car is always added, even if the CSV has placeholders.";
  dialog.showModal();
  $("#partsImportFile").onchange=async(e)=>{ const file=e.target.files?.[0]; if(file) $("#partsImportText").value=await file.text(); };
  $("#saveDialogBtn").onclick=async(e)=>{
    e.preventDefault();
    const r=await api("/api/admin/import-parts-table",{method:"POST",body:JSON.stringify({tableText:$("#partsImportText").value,engineId:$("#partsImportEngine").value,carId:$("#partsImportCar").value})});
    dialog.close();
    const best=(r.bestByCategory||[]).map(x=>`${x.category}: ${x.name} (${x.city||"city not set"})`).join("; ");
    flash(`Imported ${r.imported} part(s). ${best ? "Best by category: "+best : ""}`.slice(0,420));
    await load();
  };
}

function renderPublish(){ pageHeader("Publish / Reset","Generate the legacy catalog files the game currently reads."); app.innerHTML=`<div class="publishGrid"><div class="panel"><h2>Publish active CMS content</h2><p>Writes active cars and enabled parts, including Installed OEM placeholders, into src/catalog-data.</p><div class="code">src/catalog-data/cars-catalog.json<br>src/catalog-data/car-runtime-data.json<br>src/catalog-data/car-stock-specs.json<br>src/catalog-data/parts-catalog.xml</div><br><button class="primary" id="doPublish">Publish to game files</button></div><div class="panel"><h2>Reset clean starter state</h2><p>Archives current live catalog, keeps only Car ID 1 active, and empties the active part shop.</p><div class="warning"><strong>This is destructive for active catalog files.</strong><br>Backups are created before writes.</div><br><button class="danger" id="doReset">Reset to one active car and empty part shop</button></div></div>`; $("#doPublish").onclick=publish; $("#doReset").onclick=resetClean; }
function formField(f,value){ if(f.type==="select") return `<label data-field="${f.name}" class="${f.wide?'wide':''}">${f.label}<select name="${f.name}">${f.options.map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(value)?'selected':''}>${esc(o.label)}</option>`).join("")}</select></label>`; if(f.type==="multiselect") { const vals=Array.isArray(value)?value:String(value||"").split(",").filter(Boolean); return `<label data-field="${f.name}" class="${f.wide?'wide':''}">${f.label}<select name="${f.name}" multiple size="${Math.min(8, Math.max(3, f.options.length))}">${f.options.map(o=>`<option value="${esc(o.value)}" ${vals.includes(String(o.value))?'selected':''}>${esc(o.label)}</option>`).join("")}</select><small>Hold Ctrl/Cmd to select multiple.</small></label>`; } if(f.type==="textarea") return `<label data-field="${f.name}" class="wide">${f.label}<textarea name="${f.name}" rows="3">${esc(value)}</textarea></label>`; if(f.type==="checkbox") return `<label data-field="${f.name}">${f.label}<select name="${f.name}"><option value="true" ${value?'selected':''}>Yes</option><option value="false" ${!value?'selected':''}>No</option></select></label>`; return `<label data-field="${f.name}" class="${f.wide?'wide':''}">${f.label}<input name="${f.name}" type="${f.type||'text'}" value="${esc(value)}"></label>`; }
function formData(panel){ const fd=new FormData(panel); const data={}; for(const [k,v] of fd.entries()){ if(data[k]) data[k]=Array.isArray(data[k])?[...data[k],v]:[data[k],v]; else data[k]=v; } panel.querySelectorAll("select[multiple]").forEach(s=>data[s.name]=Array.from(s.selectedOptions).map(o=>o.value)); return data; }
function openEditor(title,hint,schema,item,onSave,onOpen){ $("#dialogTitle").textContent=title; $("#dialogHint").textContent=hint; fields.innerHTML=schema.map(f=>formField(f,item?.[f.name]??f.default??"")).join(""); dialog.showModal(); if(onOpen) onOpen($(".dialogPanel")); $("#saveDialogBtn").onclick=async(e)=>{ e.preventDefault(); const data=formData($(".dialogPanel")); if(item?.id) data.id=item.id; await onSave(data); dialog.close(); await load(); }; }
function cityOptions(){ return (state.data.cities||[]).map(c=>({value:c.id,label:c.name})); }
function engineOptions(){ return (state.data.engines||[]).map(e=>({value:e.id,label:e.displayName})); }
function categoryOptions(){ return (state.data.categories||[]).map(c=>({value:c.id,label:c.name})); }
function paintOptions(){ return paintShape().paints.map(p=>({value:p.id,label:`${p.name} (${p.hex})`})); }
function openCarEditor(car={}){ openEditor(car.id?"Edit Car":"Add Car","OEM paints are selected from the paint library, not typed manually.",[{name:"legacyCatalogId",label:"Catalog / Legacy ID",type:"number",default:1},{name:"year",label:"Year",type:"number"},{name:"make",label:"Make"},{name:"model",label:"Model"},{name:"submodel",label:"Submodel"},{name:"displayName",label:"Display Name"},{name:"cityId",label:"City / Dealership",type:"select",options:cityOptions()},{name:"engineId",label:"Linked Engine",type:"select",options:[{value:"",label:"Unlinked"},...engineOptions()]},{name:"factoryPaintIds",label:"Factory OEM Paints",type:"multiselect",wide:true,options:paintOptions()},{name:"defaultPaintId",label:"Default Paint",type:"select",options:[{value:"",label:"None"},...paintOptions()]},{name:"vehicleLayout",label:"Vehicle Layout",wide:true},{name:"drivetrain",label:"Drivetrain"},{name:"transmission",label:"Transmission"},{name:"curbWeightLbs",label:"Curb Weight lbs",type:"number"},{name:"zeroToSixtySeconds",label:"0-60 Time",type:"number"},{name:"priceMoney",label:"Money Price",type:"number"},{name:"pricePoints",label:"Points Price",type:"number"},{name:"enabled",label:"Enabled",type:"checkbox",default:true},{name:"notes",label:"Notes",type:"textarea"}],{...car,factoryPaintIds:car.factoryPaintIds||car.factoryColors||[],defaultPaintId:car.defaultPaintId||car.defaultColor||""},async(data)=>api("/api/admin/cars",{method:"POST",body:JSON.stringify(data)})); }
function openEngineEditor(engine={}){ openEditor(engine.id?"Edit Engine":"Add Engine","Engine source of truth for runtime stats and car linking.",[{name:"engineCode",label:"Engine Code"},{name:"displayName",label:"Display Name"},{name:"makeModelSource",label:"Make/Model Source",wide:true},{name:"displacementLiters",label:"Displacement Liters",type:"number"},{name:"cylinderCount",label:"Cylinder Count",type:"number"},{name:"configuration",label:"Configuration"},{name:"induction",label:"Induction",type:"select",options:["NA","Turbo","Twin Turbo","Supercharged"].map(x=>({value:x,label:x}))},{name:"horsepower",label:"Horsepower",type:"number"},{name:"torque",label:"Torque",type:"number"},{name:"horsepowerRpm",label:"HP RPM",type:"number"},{name:"torqueRpm",label:"TQ RPM",type:"number"},{name:"redlineRpm",label:"Redline RPM",type:"number"},{name:"idleRpm",label:"Idle RPM",type:"number"},{name:"engineWeightLbs",label:"Engine Weight lbs",type:"number"},{name:"fuelType",label:"Fuel Type"},{name:"notes",label:"Notes",type:"textarea"}],engine,async(data)=>api("/api/admin/engines",{method:"POST",body:JSON.stringify(data)})); }
function openPaintEditor(paint={}){ openEditor(paint.id?"Edit OEM Paint":"Add OEM Paint","Use a #RRGGBB hex code and a real paint name.",[{name:"name",label:"Paint Name"},{name:"hex",label:"Hex Color",type:"color",default:"#ffffff"},{name:"notes",label:"Notes",type:"textarea"}],paint,async(data)=>api("/api/admin/paints",{method:"POST",body:JSON.stringify(data)})); }

function fiKindForCategory(categoryId){ const c=String(categoryId||"").toLowerCase(); if(c==="turbo") return "Turbo"; if(c==="supercharger") return "Supercharger"; return ""; }
function isFiMainCategory(categoryId){ return !!fiKindForCategory(categoryId); }
function forcedInductionOptions(kind=""){ const items=(state.data.forcedInduction||[]).filter(i=>(i.enabled!==false) && (!kind || i.kind===kind)); return [{value:"",label:"Manual / none"},...items.map(i=>({value:i.id,label:`${i.brand?i.brand+" ":""}${i.name} (${i.maxPsi||0} PSI)`}))]; }
function setSelectOptions(select, options, selected=""){ if(!select) return; select.innerHTML=options.map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(selected)?"selected":""}>${esc(o.label)}</option>`).join(""); }
function moneyValue(item){ return item?.priceMoney ?? item?.moneyPrice ?? item?.price ?? 0; }
function pointsValue(item){ return item?.pricePoints ?? item?.pointsPrice ?? (moneyValue(item)?Math.round(Number(moneyValue(item))*0.05):0); }
function applyFiCatalogToPartDefaults(item){ if(!item) return {}; const categoryId=item.kind==="Turbo"?"turbo":"supercharger"; return { forceInductionCatalogId:item.id, forceInductionType:item.kind, superchargerStyle:item.superchargerStyle||"", name:item.name, brand:item.brand||"", model:item.model||item.name, categoryId, maxPsi:item.maxPsi||0, basePsi:item.basePsi||0, spoolStartRpm:item.spoolStartRpm||0, fullBoostRpm:item.fullBoostRpm||0, compressorWheelMm:item.compressorWheelMm||0, turbineWheelMm:item.turbineWheelMm||0, turbineAR:item.turbineAR||item.arRatio||0, compressorEfficiency:item.compressorEfficiency||0, pulleyRatio:item.pulleyRatio||0, driveRatio:item.driveRatio||0, sizeLabel:item.sizeLabel||"", horsepowerDelta:item.targetHorsepowerDelta||item.horsepowerDelta||0, torqueDelta:item.targetTorqueDelta||item.torqueDelta||0, weightDelta:item.weightDelta||0, priceMoney:moneyValue(item), pricePoints:pointsValue(item), purchasable:true, enabled:true }; }
function adaptPartModal(panel){ const moneyInput=panel.querySelector('[name="priceMoney"]'); const pointsInput=panel.querySelector('[name="pricePoints"]'); const isOemInput=panel.querySelector('[name="isOem"]'); const autoPoints=()=>{ if(pointsInput && moneyInput) pointsInput.value=Math.round(Number(moneyInput.value||0)*0.25); }; moneyInput?.addEventListener("input", autoPoints); isOemInput?.addEventListener("change", autoPoints); const typeSel=panel.querySelector('[name="forceInductionType"]'); const catSel=panel.querySelector('[name="categoryId"]'); const catalogSel=panel.querySelector('[name="forceInductionCatalogId"]'); const show=(name,on)=>{ const el=panel.querySelector(`[data-field="${name}"]`); if(el) el.classList.toggle("hidden",!on); }; const currentKind=()=>{ const catKind=fiKindForCategory(catSel?.value); if(catKind && typeSel && !typeSel.value) typeSel.value=catKind; return typeSel?.value || catKind || ""; }; const refreshCatalogOptions=(keepValue=true)=>{ const old=catalogSel?.value||""; const kind=currentKind(); setSelectOptions(catalogSel, forcedInductionOptions(kind), keepValue?old:""); }; const refresh=()=>{ const type=currentKind(); const turbo=type==="Turbo"; const sc=type==="Supercharger"; refreshCatalogOptions(true); ["forceInductionCatalogId","maxPsi","basePsi","compressorEfficiency","sizeLabel"].forEach(n=>show(n,turbo||sc)); ["spoolStartRpm","fullBoostRpm","compressorWheelMm","turbineWheelMm","turbineAR"].forEach(n=>show(n,turbo)); ["superchargerStyle","pulleyRatio","driveRatio"].forEach(n=>show(n,sc)); }; typeSel?.addEventListener("change",()=>{ refreshCatalogOptions(false); refresh(); }); catSel?.addEventListener("change",()=>{ const k=fiKindForCategory(catSel.value); if(k && typeSel) typeSel.value=k; refreshCatalogOptions(false); refresh(); }); catalogSel?.addEventListener("change",()=>{ const item=(state.data.forcedInduction||[]).find(i=>i.id===catalogSel.value); if(!item) return; const data=applyFiCatalogToPartDefaults(item); for(const [k,v] of Object.entries(data)){ const input=panel.querySelector(`[name="${k}"]`); if(input) input.value=v; } refresh(); }); refresh(); }
function createPartFromFi(item){ openPartEditor({}, applyFiCatalogToPartDefaults(item)); }
async function deletePart(partId){
  const part=(state.data.performanceParts||[]).find(p=>String(p.id)===String(partId));
  if(!part) return flash("Part not found in current CMS data.","bad");
  if(!confirm(`Delete this part?\n\n${part.brand?part.brand+" ":""}${part.name||part.id}\n\nThis removes it from the CMS catalog. It does not clean already-owned player car XML.`)) return;
  await api(`/api/admin/parts/${encodeURIComponent(partId)}`,{method:"DELETE"});
  await load();
  flash(`Deleted ${part.name||partId}.`);
}
function openMovePartCategory(partId){
  const part=(state.data.performanceParts||[]).find(p=>String(p.id)===String(partId));
  if(!part) return flash("Part not found in current CMS data.","bad");
  openEditor("Move Part Category",`Move ${part.brand?part.brand+" ":""}${part.name||part.id} to another CMS category. This updates categoryId and legacyCategoryId; compatibility links stay untouched.`,[{name:"categoryId",label:"New Category",type:"select",options:categoryOptions()}],{id:part.id,categoryId:canonicalCategoryId(part.categoryId)},async(data)=>api("/api/admin/parts/move-category",{method:"POST",body:JSON.stringify({partId,categoryId:data.categoryId})}));
}
async function undoLastPartsImport(){
  if(!confirm("Undo the last Parts CSV import batch? This removes the imported CMS part rows only.")) return;
  const r=await api("/api/admin/import-parts-undo-last",{method:"POST",body:"{}"});
  await load();
  flash(`Undo complete. Removed ${r.deleted||0} imported part(s).`);
}
async function forceEnginePartLinks(engineId){
  const engine=(state.data.engines||[]).find(e=>String(e.id)===String(engineId));
  if(!engine) return flash("Engine not found.","bad");
  if(!confirm(`Force/fix compatibility links for ${engine.displayName||engineId}?\n\nThis will normalize known imported category aliases like cat_converters -> Catalytic Converters and ensure parts already compatible with this engine/car are visible in this engine catalog.`)) return;
  const r=await api("/api/admin/force-engine-part-links",{method:"POST",body:JSON.stringify({engineId,attachCars:true})});
  await load();
  flash(`Compat repair complete: changed ${r.changed||0}, fixed categories ${r.categoryFixed||0}, linked cars ${r.carLinked||0}. Publish after verifying.`);
}
function openAttachEngineSwapToEngine(engineId){
  const current=(state.data.engines||[]).find(e=>String(e.id)===String(engineId));
  const engines=state.data.engines||[];
  const carsForEngine=(state.data.cars||[]).filter(c=>String(c.engineId)===String(engineId));
  fields.innerHTML=`<label class="wide">Engine to offer as swap<select id="engineSwapSource">${engines.map(e=>`<option value="${esc(e.id)}">${esc(`${e.engineCode?e.engineCode+" - ":""}${e.displayName}`)}</option>`).join("")}</select></label><label>City / Shop<select id="engineSwapCity">${cityOptions().map(c=>`<option value="${esc(c.value)}">${esc(c.label)}</option>`).join("")}</select></label><label>Money Price<input id="engineSwapMoney" type="number" value="0"></label><label>Points Price<input id="engineSwapPoints" type="number" value="0"></label><label class="wide"><input id="engineSwapAlsoCars" type="checkbox" checked> Also attach to cars using ${esc(current?.displayName||engineId)}</label><div class="infoBox wide" id="engineSwapPreview">Select an engine. The generated part stores sourceEngineId and required OEM categories so engine-swap install logic can install the engine with its OEM parts later.</div>`;
  $("#dialogTitle").textContent="Attach Engine Swap Part";
  $("#dialogHint").textContent=`Creates a purchasable Engines-category part compatible with ${current?.displayName||engineId}.`;
  dialog.showModal();
  const refresh=()=>{ const e=engines.find(x=>String(x.id)===String($("#engineSwapSource")?.value)); if(!e) return; $("#engineSwapPreview").innerHTML=`<strong>${esc(e.engineCode||"")} ${esc(e.displayName||"")}</strong><br>${esc(e.displacementLiters||0)}L ${esc(e.configuration||"")} ${esc(e.induction||"")} | ${esc(e.horsepower||0)} HP / ${esc(e.torque||0)} TQ<br><small>Marked as an engine-swap part and paired with OEM categories for that source engine.</small>`; };
  $("#engineSwapSource").onchange=refresh; refresh();
  $("#saveDialogBtn").onclick=async(ev)=>{ ev.preventDefault(); const e=engines.find(x=>String(x.id)===String($("#engineSwapSource").value)); if(!e) throw new Error("Choose an engine first."); const attachCars=$("#engineSwapAlsoCars")?.checked; const compatibleCarIds=attachCars ? carsForEngine.map(c=>c.id) : []; const required=[...DEFAULT_OEM_CATEGORY_IDS,"engines"]; if(String(e.induction||"").toLowerCase().includes("turbo")) required.splice(required.indexOf("headers"),1,...TURBO_OEM_CATEGORY_IDS); if(String(e.induction||"").toLowerCase().includes("super")) required.push(...SUPERCHARGER_OEM_CATEGORY_IDS); const data={name:`${e.engineCode||e.displayName} Engine Swap`, brand:"Engine Swap", model:e.engineCode||e.displayName, categoryId:"engines", cityId:$("#engineSwapCity").value, priceMoney:$("#engineSwapMoney").value, pricePoints:$("#engineSwapPoints").value, horsepowerDelta:e.horsepower||0, torqueDelta:e.torque||0, weightDelta:e.engineWeightLbs||0, compatibleEngineIds:[engineId], compatibleCarIds, sourceEngineId:e.id, includesOemParts:true, requiredOemPartCategoryIds:required, isOem:false, installedByDefault:false, purchasable:true, enabled:true, notes:`Engine swap part. Source engine ${e.engineCode||e.displayName}; should install with OEM parts for source engine.`}; await api("/api/admin/parts",{method:"POST",body:JSON.stringify(data)}); dialog.close(); await load(); flash(`Attached ${e.engineCode||e.displayName} engine swap to ${current?.displayName||engineId}.`); };
}

function openAttachExistingPartToEngine(engineId, categoryId){
  const engine=(state.data.engines||[]).find(e=>String(e.id)===String(engineId));
  const categoryLegacyId=String(categoryLegacy(categoryId));
  const candidates=(state.data.performanceParts||[])
    .filter(p=>!p.isOem)
    .filter(p=>String(canonicalCategoryId(p.categoryId||""))===String(categoryId||"") || String(categoryLegacy(canonicalCategoryId(p.categoryId||"")))===categoryLegacyId || String(p.legacyCategoryId||"")===categoryLegacyId)
    .filter(p=>!(p.compatibleEngineIds||[]).map(String).includes(String(engineId)))
    .sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
  fields.innerHTML=`<label class="wide">Existing ${esc(catName(categoryId))} Part<select id="attachExistingId">${candidates.map(p=>`<option value="${esc(p.id)}">${esc(`${p.brand? p.brand+" ":""}${p.name||p.id} - ${cityName(p.cityId)} - ${p.horsepowerDelta||0} HP / ${p.torqueDelta||0} TQ`)}</option>`).join("")}</select></label><div class="infoBox wide" id="attachExistingPreview">${candidates.length?"Select a part to preview it.":"No reusable non-OEM parts found in this category. Create/import one first."}</div><label class="wide"><input id="attachAlsoCars" type="checkbox"> Also attach to cars using this engine (normally leave off for engine parts)</label>`;
  $("#dialogTitle").textContent=`Attach Existing ${catName(categoryId)} Part`;
  $("#dialogHint").textContent=`This reuses the same catalog part by adding ${engine?.displayName||engineId} to its compatible engine list. It does not duplicate the part.`;
  dialog.showModal();
  const refresh=()=>{ const part=candidates.find(p=>p.id===$("#attachExistingId")?.value); if(!part) return; $("#attachExistingPreview").innerHTML=`<strong>${esc(part.brand||"")} ${esc(part.name||"")}</strong><br>${esc(cityName(part.cityId))} | ${esc(part.priceMoney||0)} money / ${esc(part.pricePoints||0)} points<br>${esc(part.horsepowerDelta||0)} HP, ${esc(part.torqueDelta||0)} TQ, ${esc(part.gripDelta||0)} grip, ${esc(part.weightDelta||0)} wt<br><small>${esc(part.notes||"")}</small>`; };
  const sel=$("#attachExistingId"); if(sel) sel.onchange=refresh; refresh();
  $("#saveDialogBtn").onclick=async(e)=>{
    e.preventDefault();
    const id=$("#attachExistingId")?.value;
    if(!id) throw new Error("No existing part selected.");
    const attachCars=$("#attachAlsoCars")?.checked;
    const carsForEngine=(state.data.cars||[]).filter(c=>String(c.engineId)===String(engineId)).map(c=>String(c.id));
    const parts=(state.data.performanceParts||[]).map(p=>{
      if(String(p.id)!==String(id)) return p;
      const engineIds=new Set((p.compatibleEngineIds||[]).map(String)); engineIds.add(String(engineId));
      const carIds=new Set((p.compatibleCarIds||[]).map(String));
      if(attachCars) carsForEngine.forEach(c=>carIds.add(c));
      else carIds.clear();
      return {...p, compatibleEngineIds:[...engineIds], compatibleCarIds:[...carIds]};
    });
    await api("/api/admin/content/performanceParts",{method:"PUT",body:JSON.stringify({data:parts})});
    dialog.close(); await load(); flash(`Attached existing part to ${engine?.displayName||engineId}.`);
  };
}

function openAttachFiToEngine(engineId, categoryId){ const kind=fiKindForCategory(categoryId); const items=(state.data.forcedInduction||[]).filter(i=>(i.enabled!==false) && i.kind===kind); const engine=(state.data.engines||[]).find(e=>String(e.id)===String(engineId)); fields.innerHTML=`<label class="wide">Pre-made ${esc(kind)}<select id="attachFiId">${items.map(i=>`<option value="${esc(i.id)}">${esc(`${i.brand?i.brand+" ":""}${i.name} - ${i.maxPsi||0} PSI - ${i.sizeLabel||""}`)}</option>`).join("")}</select></label><label>City / Shop<select id="attachFiCity">${cityOptions().map(c=>`<option value="${esc(c.value)}">${esc(c.label)}</option>`).join("")}</select></label><label>Money Price<input id="attachFiMoney" type="number"></label><label>Points Price<input id="attachFiPoints" type="number"></label><label>Purchasable<select id="attachFiPurchasable"><option value="true">Yes</option><option value="false">No, trophy/reward only</option></select></label><div class="infoBox wide" id="attachFiPreview">Select a catalog item to preview specs.</div>`; $("#dialogTitle").textContent=`Attach ${kind} from FI Studio`; $("#dialogHint").textContent=`Creates an actual engine part assigned to ${engine?.displayName||engineId}. The FI Studio item remains reusable.`; dialog.showModal(); const refresh=()=>{ const item=items.find(i=>i.id===$("#attachFiId")?.value); if(!item) return; $("#attachFiMoney").value=moneyValue(item)||""; $("#attachFiPoints").value=pointsValue(item)||""; $("#attachFiPreview").innerHTML=`<strong>${esc(item.brand||"")} ${esc(item.name||"")}</strong><br>${esc(item.maxPsi||0)} PSI, ${esc(item.targetHorsepowerDelta||0)} HP / ${esc(item.targetTorqueDelta||0)} TQ, ${esc(item.weightDelta||0)} wt<br><small>${esc(item.notes||"")}</small>`; }; $("#attachFiId").onchange=refresh; refresh(); $("#saveDialogBtn").onclick=async(e)=>{ e.preventDefault(); const item=items.find(i=>i.id===$("#attachFiId").value); if(!item) throw new Error("Choose a forced induction catalog item first."); const data={...applyFiCatalogToPartDefaults(item), categoryId, cityId:$("#attachFiCity").value, priceMoney:$("#attachFiMoney").value, pricePoints:$("#attachFiPoints").value, purchasable:$("#attachFiPurchasable").value==="true", rewardable:$("#attachFiPurchasable").value!=="true", compatibleEngineIds:[engineId], isOem:false, installedByDefault:false, enabled:true}; await api("/api/admin/parts",{method:"POST",body:JSON.stringify(data)}); dialog.close(); await load(); flash(`${kind} attached to ${engine?.displayName||engineId}.`); }; }
function openForcedInductionEditor(item={}){ const kind=item.kind||"Turbo"; openEditor(item.id?"Edit Forced Induction Unit":"Add Forced Induction Unit","Create reusable turbo/supercharger specs. These can be copied into actual purchasable parts later.",[{name:"kind",label:"Type",type:"select",options:["Turbo","Supercharger"].map(x=>({value:x,label:x}))},{name:"superchargerStyle",label:"Supercharger Style",type:"select",options:["Roots","Centrifugal","TwinScroll","Electric","ProCharger"].map(x=>({value:x,label:x}))},{name:"name",label:"Name",wide:true},{name:"brand",label:"Brand"},{name:"model",label:"Model"},{name:"sizeLabel",label:"Size / Frame Label"},{name:"maxPsi",label:"Max PSI",type:"number"},{name:"basePsi",label:"Base PSI",type:"number"},{name:"compressorEfficiency",label:"Efficiency %",type:"number",default:70},{name:"spoolStartRpm",label:"Turbo Spool Start RPM",type:"number"},{name:"fullBoostRpm",label:"Turbo Full Boost RPM",type:"number"},{name:"compressorWheelMm",label:"Compressor Wheel mm",type:"number"},{name:"turbineWheelMm",label:"Turbine Wheel mm",type:"number"},{name:"turbineAR",label:"Turbine A/R",type:"number"},{name:"pulleyRatio",label:"Pulley Ratio",type:"number"},{name:"driveRatio",label:"Drive Ratio",type:"number"},{name:"targetHorsepowerDelta",label:"Target HP Delta",type:"number"},{name:"targetTorqueDelta",label:"Target TQ Delta",type:"number"},{name:"weightDelta",label:"Weight Delta",type:"number"},{name:"enabled",label:"Enabled",type:"checkbox",default:true},{name:"notes",label:"Notes",type:"textarea"}],item,async(data)=>api("/api/admin/forced-induction",{method:"POST",body:JSON.stringify(data)}),(panel)=>{ const refresh=()=>{ const isSc=panel.querySelector('[name="kind"]').value==="Supercharger"; ["superchargerStyle","pulleyRatio","driveRatio"].forEach(n=>panel.querySelector(`[data-field="${n}"]`)?.classList.toggle("hidden",!isSc)); ["spoolStartRpm","fullBoostRpm","compressorWheelMm","turbineWheelMm","turbineAR"].forEach(n=>panel.querySelector(`[data-field="${n}"]`)?.classList.toggle("hidden",isSc)); }; panel.querySelector('[name="kind"]').addEventListener("change",refresh); refresh(); }); }

function openPartEditor(part={}, defaults={}){ part={...defaults,...part}; const engines=engineOptions(), cars=(state.data.cars||[]).map(c=>({value:c.id,label:c.displayName})); const fiKind=part.forceInductionType||""; openEditor(part.id?"Edit Part":"Add Part","The form adapts for turbo/supercharger parts. Current server physics mainly uses HP/TQ/weight and max PSI; size fields are saved for balancing/future ActionScript-accurate tuning.",[{name:"name",label:"Name",wide:true},{name:"brand",label:"Brand"},{name:"model",label:"Model"},{name:"categoryId",label:"Category",type:"select",options:categoryOptions()},{name:"cityId",label:"City / Shop",type:"select",options:cityOptions()},{name:"isOem",label:"OEM",type:"checkbox"},{name:"installedByDefault",label:"Installed By Default",type:"checkbox"},{name:"purchasable",label:"Purchasable",type:"checkbox",default:true},{name:"enabled",label:"Enabled",type:"checkbox",default:true},{name:"specialOemMetadata",label:"Special OEM Metadata",type:"checkbox"},{name:"priceMoney",label:"Money Price",type:"number"},{name:"pricePoints",label:"Points Price",type:"number"},{name:"grade",label:"Grade / Rarity",type:"select",options:["C","B","A","S"].map(x=>({value:x,label:x}))},{name:"horsepowerDelta",label:"HP Delta",type:"number"},{name:"torqueDelta",label:"TQ Delta",type:"number"},{name:"gripDelta",label:"Grip Delta",type:"number"},{name:"weightDelta",label:"Weight Delta",type:"number"},{name:"nitrousShotHp",label:"Nitrous Shot HP",type:"number"},{name:"nitrousBottleCapacityLbs",label:"Nitrous Bottle Capacity Lbs",type:"number"},{name:"compatibleEngineIds",label:"Compatible Engines",type:"multiselect",wide:true,options:engines},{name:"compatibleCarIds",label:"Compatible Cars",type:"multiselect",wide:true,options:cars},{name:"forceInductionType",label:"Forced Induction Type",type:"select",options:[{value:"",label:"None"},{value:"Turbo",label:"Turbo"},{value:"Supercharger",label:"Supercharger"}]},{name:"forceInductionCatalogId",label:"Use FI Studio Unit",type:"select",options:forcedInductionOptions(fiKind)},{name:"superchargerStyle",label:"Supercharger Style",type:"select",options:["Roots","Centrifugal","TwinScroll","Electric","ProCharger"].map(x=>({value:x,label:x}))},{name:"sizeLabel",label:"Size / Frame Label"},{name:"maxPsi",label:"Max PSI",type:"number"},{name:"basePsi",label:"Base PSI",type:"number"},{name:"spoolStartRpm",label:"Spool Start RPM",type:"number"},{name:"fullBoostRpm",label:"Full Boost RPM",type:"number"},{name:"compressorWheelMm",label:"Compressor Wheel mm",type:"number"},{name:"turbineWheelMm",label:"Turbine Wheel mm",type:"number"},{name:"turbineAR",label:"Turbine A/R",type:"number"},{name:"compressorEfficiency",label:"Efficiency %",type:"number"},{name:"pulleyRatio",label:"Pulley Ratio",type:"number"},{name:"driveRatio",label:"Drive Ratio",type:"number"},{name:"notes",label:"Notes",type:"textarea"}],part,async(data)=>api("/api/admin/parts",{method:"POST",body:JSON.stringify(data)}),adaptPartModal); }
function openLinker(carId){ const car=(state.data.cars||[]).find(c=>c.id===carId); openEditor("Link car to engine",car?.displayName||carId,[{name:"engineId",label:"Engine",type:"select",options:engineOptions()}],{engineId:car?.engineId},async(data)=>api("/api/admin/link-car-engine",{method:"POST",body:JSON.stringify({carId,engineId:data.engineId})})); }
async function publish(){ const r=await api("/api/admin/publish",{method:"POST",body:"{}"}); flash(`Published ${r.publishedCars} car(s), ${r.publishedParts} part(s). Restart Node if needed.`); await load(); }
async function resetClean(){ if(!confirm("Reset active content to one car and empty part shop? Backups will be made.")) return; const r=await api("/api/admin/reset-clean",{method:"POST",body:"{}"}); flash(`Reset complete. Published ${r.publishedCars} car(s), ${r.publishedParts} part(s).`); await load(); }
// CMS boot is intentionally deferred until the end of the file.
// Prompt Studio constants below must be initialized before any render path can run.


const DEFAULT_OEM_CATEGORY_IDS = ["air_filters","intake_pipes","motor_mounts","springs_shocks","strut_braces","sway_bars","control_arms","torsion_bars","brakes","belts_harnesses","seats","radiator","thermostat","muffler","piping","catalytic_converters","headers","intake_manifold","cam_gears","cams","connecting_rods","crankshaft","cylinder_block","cylinder_heads","head_gaskets","oil_cooler","oil_filters","oil_pump","pistons","valve_springs","valves","ecu","battery","spark_plug_cables","spark_plugs","throttle_bodies","fuel_pump","fuel_rail","injectors","fuel_pressure_regulator","fuel_filter"];
const TURBO_OEM_CATEGORY_IDS = ["turbo_exhaust_manifold","turbo_down_pipe","turbo","intercoolers","turbo_piping","bov"];
const SUPERCHARGER_OEM_CATEGORY_IDS = ["supercharger","supercharger_pulleys"];
function safePartId(v){ return String(v||"").toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"") || "item"; }
function engineInductionTextClient(engine={}){ return [engine.induction, engine.displayName, engine.engineCode, engine.notes, engine.configuration].filter(Boolean).join(" ").toLowerCase(); }
function isTurboEngineClient(engine={}){ return /turbo|turbocharged|4g63t|2jz-gte|rb26dett|sr20det/.test(engineInductionTextClient(engine)); }
function isSuperchargedEngineClient(engine={}){ return /supercharged|supercharger|s\/c/.test(engineInductionTextClient(engine)); }
function categoryLabel(id){ return (state.data.categories||[]).find(c=>String(c.id)===String(id))?.name || id.replace(/_/g," ").replace(/\b\w/g,m=>m.toUpperCase()); }
function categoryLegacy(id){ return (state.data.categories||[]).find(c=>String(c.id)===String(id))?.legacyId || id; }
async function generateOemPartsClientFallback(carId){
  const cars=state.data.cars||[], engines=state.data.engines||[], parts=[...(state.data.performanceParts||[])];
  const car=cars.find(c=>String(c.id)===String(carId)||String(c.legacyCatalogId)===String(carId)||String(c.catalogId)===String(carId));
  if(!car) throw new Error(`Car not found for OEM generation: ${carId}`);
  const engine=engines.find(e=>String(e.id)===String(car.engineId));
  if(!engine) throw new Error(`Car ${car.displayName||car.id} does not have a linked engine yet.`);
  let categoryIds=[...DEFAULT_OEM_CATEGORY_IDS,"engines"];
  if(isTurboEngineClient(engine)) categoryIds=categoryIds.filter(id=>id!=="headers").concat(TURBO_OEM_CATEGORY_IDS);
  if(isSuperchargedEngineClient(engine)) categoryIds=categoryIds.concat(SUPERCHARGER_OEM_CATEGORY_IDS);
  const existing=new Set(parts.filter(p=>p.isOem && (p.compatibleCarIds||[]).map(String).includes(String(car.id))).map(p=>String(p.categoryId)));
  let created=0;
  for(const categoryId of categoryIds){
    if(existing.has(categoryId)) continue;
    const isEngine=categoryId==="engines";
    const label=categoryLabel(categoryId);
    parts.push({
      id:`oem_${safePartId(car.id)}_${safePartId(categoryId)}`,
      legacyPartId:null,
      name:isEngine ? `OEM ${engine.engineCode || engine.displayName} Engine` : `OEM ${label}`,
      brand:"OEM",
      brandKey:"oem",
      model:isEngine ? (engine.engineCode || engine.displayName) : label,
      categoryId,
      legacyCategoryId:String(categoryLegacy(categoryId)),
      type:"e",
      cityId:normalizeCityId(car.cityId,100),
      shopId:"",
      priceMoney:0,
      pricePoints:0,
      grade:"OEM",
      displayOrder:created + 1,
      isOem:true,
      installedByDefault:true,
      purchasable:false,
      rewardable:false,
      enabled:true,
      specialOemMetadata:false,
      horsepowerDelta:0,
      torqueDelta:0,
      gripDelta:0,
      weightDelta:0,
      compatibleEngineIds:[engine.id],
      compatibleCarIds:[car.id],
      notes:isEngine ? "Factory engine shown as Installed in the purchasing city's Engines category." : "Factory placeholder part shown as Installed until replaced by an aftermarket part.",
      forceInductionType:"",
      maxPsi:0,
      basePsi:0,
      spoolStartRpm:0,
      fullBoostRpm:0,
      compressorEfficiency:0,
      boostLagRating:0,
      pulleyRatio:0
    });
    created++;
  }
  await api("/api/admin/content/performanceParts",{method:"PUT",body:JSON.stringify({data:parts})});
  return {created,total:parts.length};
}

// --- Forced Induction Import + AI Studio Add-on ---
function renderForcedInduction(){
  pageHeader("Forced Induction Studio","Build/import a reusable catalog of real-world-inspired turbochargers and superchargers, then create game parts from them.");
  const items=state.data.forcedInduction||[];
  const turbos=items.filter(i=>i.kind==="Turbo");
  const supers=items.filter(i=>i.kind==="Supercharger");
  app.innerHTML=`<div class="panel"><div class="toolbar"><div class="left"><button id="addTurbo" class="primary">Add Turbocharger</button><button id="addSuper" class="primary">Add Supercharger</button><button id="importFi">Import AI CSV</button></div><div class="actions"><span class="badge">${turbos.length} turbos</span><span class="badge">${supers.length} superchargers</span></div></div><div class="infoBox"><strong>Balance note:</strong> the live legacy publish still needs HP/TQ deltas because the current server catalog stores parts that way. The FI catalog now stores real-world sizing, boost, spool, pulley, and efficiency so we can later calculate HP/TQ from engine airflow/boost once the physics path is fully mapped.</div>${["Turbo","Supercharger"].map(kind=>`<details class="catGroup" open><summary><strong>${kind}s</strong><span class="badge">${items.filter(i=>i.kind===kind).length}</span></summary><table><thead><tr><th>Name</th><th>Type</th><th>PSI / Size</th><th>RPM / Ratio</th><th>Target Gain</th><th></th></tr></thead><tbody>${items.filter(i=>i.kind===kind).map(i=>`<tr><td><strong>${esc(i.name)}</strong><br><small>${esc(i.brand||"")} ${esc(i.model||"")}</small></td><td>${fiKindBadge(i)}</td><td>${esc(i.maxPsi||0)} PSI<br><small>${esc(i.sizeLabel||"")}</small></td><td>${kind==="Turbo"?`${esc(i.spoolStartRpm||0)}-${esc(i.fullBoostRpm||0)} RPM`:`${esc(i.superchargerStyle||"")} / Pulley ${esc(i.pulleyRatio||0)}`}</td><td>${esc(i.targetHorsepowerDelta||0)} HP / ${esc(i.targetTorqueDelta||0)} TQ<br><small>${esc(i.weightDelta||0)} wt</small></td><td><button data-edit-fi="${esc(i.id)}">Edit</button><button data-make-part="${esc(i.id)}">Create Part</button></td></tr>`).join("")||`<tr><td colspan="6">No ${kind.toLowerCase()} entries yet.</td></tr>`}</tbody></table></details>`).join("")}</div>`;
  $("#addTurbo").onclick=()=>openForcedInductionEditor({kind:"Turbo"});
  $("#addSuper").onclick=()=>openForcedInductionEditor({kind:"Supercharger",superchargerStyle:"Roots"});
  $("#importFi").onclick=openForcedInductionImport;
  document.querySelectorAll("[data-edit-fi]").forEach(b=>b.onclick=()=>openForcedInductionEditor(items.find(i=>i.id===b.dataset.editFi)));
  document.querySelectorAll("[data-make-part]").forEach(b=>b.onclick=()=>createPartFromFi(items.find(i=>i.id===b.dataset.makePart)));
}

function openForcedInductionImport(){
  dialog.showModal();
  $("#dialogTitle").textContent="Import Forced Induction CSV";
  $("#dialogHint").textContent="Upload or paste the CSV returned by AI. This imports into the FI Studio catalog, not directly into game parts.";
  fields.innerHTML=`<label class="wide">Upload CSV File<input id="fiImportFile" type="file" accept=".csv,text/csv"></label><label class="wide">Or Paste AI CSV<textarea name="tableText" rows="14" placeholder="Part Type,Supercharger Type,Brand,Part Name,Model,Real World Reference,City,Purchasable?,Trophy/Reward Only?,Compatible Engine Types,Recommended Displacement,Money Price,Points Price,Target HP Add,Target TQ Add,Max PSI,Base PSI,Weight Change,Size / Frame Label,Compressor Wheel mm,Turbine Wheel mm,Turbo A/R Ratio,Turbo Spool Start RPM,Turbo Full Boost RPM,Compressor Efficiency %,Pulley Ratio,Drive Ratio,Boost Curve,Parasitic Loss HP,Notes\nTurbo,N/A,Garrett,GT28-inspired Turbo,GT28R,Garrett GT28R,Toreno,Yes,No,I4,1.6L-2.0L,3200,800,55,42,14,8,24,small-frame,47,53,0.64,2800,3900,72,N/A,N/A,N/A,N/A,Fast-spooling street turbo"></textarea></label><div class="infoBox wide"><strong>Required minimum CSV columns:</strong> Part Type, Brand, Part Name, Model, Max PSI.<br>Extra columns like spool RPM, wheel size, pulley ratio, city, price, and notes are preserved where possible. Markdown tables still work as a fallback, but CSV is preferred.</div>`;
  $("#fiImportFile").onchange=async(e)=>{ const file=e.target.files?.[0]; if(file) fields.querySelector('[name="tableText"]').value=await file.text(); };
  $("#saveDialogBtn").onclick=async(e)=>{
    e.preventDefault();
    const tableText=fields.querySelector('[name="tableText"]').value;
    const r=await api("/api/admin/import-forced-induction-table",{method:"POST",body:JSON.stringify({tableText})});
    dialog.close();
    flash(`Imported ${r.imported} forced induction catalog item(s).`);
    await load();
  };
}

const FI_IMPORT_PROMPT = `I am creating a forced induction catalog for a Nitto 1320 Legends remake CMS.

Base the entries on real-world turbochargers and superchargers. I may rename them later, but use realistic specs and behavior.

Return ONLY a CSV file or CSV code block. Do not return JSON. Do not add explanation before or after the CSV.

Create [NUMBER] forced induction catalog entries.
Focus: [EX: entry-level street turbos for 1.6L-2.0L I4 engines / V8 superchargers / mixed catalog]
City spread: [EX: one per city, spread across all cities, or only Toreno/Newburge]

Use this CSV header exactly:
Part Type,Supercharger Type,Brand,Part Name,Model,Real World Reference,City,Purchasable?,Trophy/Reward Only?,Compatible Engine Types,Recommended Displacement,Money Price,Points Price,Target HP Add,Target TQ Add,Max PSI,Base PSI,Weight Change,Size / Frame Label,Compressor Wheel mm,Turbine Wheel mm,Turbo A/R Ratio,Turbo Spool Start RPM,Turbo Full Boost RPM,Compressor Efficiency %,Pulley Ratio,Drive Ratio,Boost Curve,Parasitic Loss HP,Notes

Rules:
- Part Type must be Turbo or Supercharger.
- For turbos, Supercharger Type, Pulley Ratio, Drive Ratio, Boost Curve, and Parasitic Loss HP should be N/A.
- For superchargers, turbo wheel/spool/A/R fields should be N/A unless the field logically applies.
- Supercharger Type must be one of: Roots, Centrifugal, TwinScroll, Electric, ProCharger.
- Cities must be one of: Toreno, Newburge, Creek Side, Vista Heights, Diamond Pointe.
- 1320 Legends does not use rarity. Do not include rarity.
- Include Trophy/Reward Only parts only if requested. If Trophy/Reward Only? is Yes, Purchasable? must be No and prices should be 0.
- Use realistic real-world references such as Garrett, BorgWarner, Precision, Turbonetics, Vortech, ProCharger, Eaton, Magnuson, Whipple, Paxton, or similar.
- Target HP/TQ Add is a balancing estimate for the current server catalog. Base it on boost, size, efficiency, and intended engine range.
- Do not make every best part Diamond Pointe. Some earlier-city parts can be useful but have tradeoffs.
- Numeric columns must be numeric only or N/A.
- Notes should explain the intended use in one short sentence.`;

function renderPromptStudio(){
  pageHeader("AI Prompt Studio","Generate consistent prompts for tables, then import FI tables directly into the catalog.");
  const merged={...PROMPT_PRESETS, forcedInductionImport:{title:"Importable Forced Induction Catalog",subtitle:"Real-world-inspired turbo/supercharger CSV that can be imported into FI Studio.",prompt:FI_IMPORT_PROMPT}};
  const keys=Object.keys(merged);
  app.innerHTML=`<div class="promptLayout"><div class="panel promptSidebar"><h2>Prompt presets</h2><p>Pick a starting point, edit the text, then copy it into AI.</p><div class="promptPresetList">${keys.map(k=>`<button data-prompt-preset="${esc(k)}"><strong>${esc(merged[k].title)}</strong><small>${esc(merged[k].subtitle)}</small></button>`).join("")}</div></div><div class="panel promptMain"><div class="toolbar"><div><h2 id="promptPresetTitle">Prompt</h2><p id="promptPresetHint"></p></div><div class="actions"><button id="copyPrompt" class="primary">Copy Prompt</button><button id="resetPrompt">Reset Preset</button></div></div><textarea id="promptText" class="promptText"></textarea><div class="infoBox"><strong>Workflow:</strong> copy an importable prompt, get a CSV file/code block back, then paste it into Parts → Import AI CSV or Forced Induction Studio → Import AI CSV.</div></div></div>`;
  let current="forcedInductionImport";
  const setPreset=(key)=>{ current=key; const p=merged[key]; $("#promptPresetTitle").textContent=p.title; $("#promptPresetHint").textContent=p.subtitle; $("#promptText").value=p.prompt; document.querySelectorAll("[data-prompt-preset]").forEach(b=>b.classList.toggle("active",b.dataset.promptPreset===key)); };
  document.querySelectorAll("[data-prompt-preset]").forEach(b=>b.onclick=()=>setPreset(b.dataset.promptPreset));
  $("#copyPrompt").onclick=async()=>{ await navigator.clipboard.writeText($("#promptText").value); flash("Prompt copied."); };
  $("#resetPrompt").onclick=()=>setPreset(current);
  setPreset(current);
}


// Player Portal add-on
async function renderPlayerPortal(){
  pageHeader("Player Portal","Inspect local JSON players/cars and run safe migrations after CMS catalog fixes.");
  app.innerHTML=`<div class="panel"><div class="toolbar"><div><h2>Players</h2><p>Use this after publishing/OEM fixes to repair already-owned cars.</p></div><button id="refreshPlayers">Refresh Players</button></div><div id="playerPortalBody"><span class="badge">Loading players...</span></div></div>`;
  $("#refreshPlayers").onclick=renderPlayerPortal;
  try{
    const r=await api("/api/admin/players");
    const players=r.players||[];
    $("#playerPortalBody").innerHTML = players.length ? `<table><thead><tr><th>Player</th><th>Money</th><th>Points</th><th>Cars</th><th>Updated</th><th></th></tr></thead><tbody>${players.map(p=>`<tr><td><strong>${esc(p.username)}</strong><br><small>ID ${esc(p.id)}</small></td><td>$${Number(p.money||0).toLocaleString()}</td><td>${esc(p.points||0)}</td><td>${esc(p.carCount||0)}</td><td><small>${esc(p.updatedAt||"")}</small></td><td><button data-view-player="${esc(p.id)}">View Cars</button><button data-repair-player="${esc(p.id)}">Repair All OEM</button></td></tr>`).join("")}</tbody></table><div class="infoBox"><strong>Migration rule:</strong> this adds missing installed OEM default parts to existing owned cars. It does not delete aftermarket parts.</div>` : `<div class="warning">No local players found in data/json-db/game_players.json.</div>`;
    document.querySelectorAll("[data-view-player]").forEach(b=>b.onclick=()=>openPlayerCars(b.dataset.viewPlayer));
    document.querySelectorAll("[data-repair-player]").forEach(b=>b.onclick=async()=>{ if(!confirm("Add missing installed OEM defaults to every car owned by this player? Backups are created.")) return; const res=await api("/api/admin/player/repair-oem",{method:"POST",body:JSON.stringify({playerId:b.dataset.repairPlayer})}); flash(`Repaired ${res.repairedCars} car(s), added ${res.addedParts} OEM part(s).`); await openPlayerCars(b.dataset.repairPlayer); });
  }catch(e){ $("#playerPortalBody").innerHTML=`<div class="warning">${esc(e.message)}</div>`; }
}
async function openPlayerCars(playerId){
  const r=await api(`/api/admin/players/${encodeURIComponent(playerId)}`);
  const p=r.player, cars=r.cars||[];
  app.innerHTML=`<div class="panel"><div class="toolbar"><div><h2>${esc(p.username)}'s Cars</h2><p>Player ID ${esc(p.id)}. These are local JSON garage records.</p></div><div class="actions"><button id="backPlayers">Back to Players</button><button id="repairPlayerAll" class="primary">Repair All OEM</button></div></div><table><thead><tr><th>Car</th><th>Game Car ID</th><th>Installed Parts</th><th>OEM Status</th><th>Color/Plate</th><th></th></tr></thead><tbody>${cars.map(c=>`<tr><td><strong>${esc(c.displayName)}</strong>${c.selected?` <span class="badge good">Selected</span>`:""}<br><small>Catalog ${esc(c.catalogCarId)} / Engine ${esc(c.engineId||"-")}</small></td><td>${esc(c.gameCarId)}</td><td>${esc(c.installedPartCount)} installed<br><small>${esc(c.partsXmlLength)} XML chars</small></td><td>${c.missingOemCount?`<span class="badge bad">${esc(c.missingOemCount)} missing OEM</span><br><small>${esc((c.missingOemNames||[]).join(", "))}</small>`:`<span class="badge good">OEM defaults OK</span><br><small>${esc(c.defaultOemCount)} expected</small>`}</td><td>#${esc(c.colorCode||"")}<br><small>${esc(c.plateName||"")}</small></td><td><button data-repair-car="${esc(c.gameCarId)}">Repair OEM</button></td></tr>`).join("")}</tbody></table><div class="infoBox"><strong>Safe repair:</strong> appends missing installed OEM defaults from CMS content. It does not remove player upgrades or reset cars.</div></div>`;
  $("#backPlayers").onclick=renderPlayerPortal;
  $("#repairPlayerAll").onclick=async()=>{ if(!confirm("Repair missing OEM defaults for all cars owned by this player?")) return; const res=await api("/api/admin/player/repair-oem",{method:"POST",body:JSON.stringify({playerId})}); flash(`Repaired ${res.repairedCars} car(s), added ${res.addedParts} OEM part(s).`); await openPlayerCars(playerId); };
  document.querySelectorAll("[data-repair-car]").forEach(b=>b.onclick=async()=>{ const res=await api("/api/admin/player-car/repair-oem",{method:"POST",body:JSON.stringify({gameCarId:b.dataset.repairCar})}); flash(`Added ${res.added} missing OEM part(s).`); await openPlayerCars(playerId); });
}

function bootCms(){
  document.querySelectorAll("nav a").forEach(a=>a.onclick=()=>setPage(a.dataset.page));
  $("#refreshBtn").onclick=load;
  $("#publishBtn").onclick=publish;
  window.addEventListener("hashchange",()=>setPage(location.hash.replace("#","")||"dashboard"));
  setPage(location.hash.replace("#","")||"dashboard");
  load().catch(e=>flash(e.message,"bad"));
}
bootCms();
