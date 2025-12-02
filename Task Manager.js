/* Task-Manager.js — წმენდი და პროექტთან შეწყობილი ვერსია
   Consolidated and fixed:
   - single updateDashboard()
   - stopPropagation on item click to prevent outside clear
   - task-status option values use keys (pending, assembled...)
   - include-done / include-deleted controls support
*/

const STORAGE_KEY = "roof_tasks_web_v2";

const PRIORITY_DISPLAY = {
  low: "დაბალი",
  normal: "საშუალო",
  high: "მაღალი",
};

const STATUS_NAMES = {
  pending: "ასაწყობია",
  assembled: "აწყობილია",
  sent: "გაგზავნილია",
  signed: "ხელმოწერილია",
  uploaded: "ატვირთულია"
};

let tasks = [];
let selectedId = null;
let searchTimer = null;

/* === Utils === */
function byId(id) { return document.getElementById(id); }

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("loadTasks error", e);
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (e) {
    console.error("saveTasks error", e);
  }
}

function formatDate(dateStr) {
  return dateStr || "-";
}

/* normalize booleans (in case older data stored strings) and ensure status exists */
function normalizeTasks() {
  tasks = (tasks || []).map(t => {
    const done = t.done === true || t.done === "true" ? true : false;
    const deleted = t.deleted === true || t.deleted === "true" ? true : false;
    const status = t.status || "pending";
    let amount = "";
    if (t.amount !== undefined && t.amount !== null && t.amount !== "") {
      const parsed = Number(t.amount);
      amount = isNaN(parsed) ? "" : parsed;
    }
    return {
      ...t,
      done,
      deleted,
      status,
      amount
    };
  });
}

/* read files -> base64 */
function readFilesAsBase64(files) {
  return Promise.all(
    [...(files || [])].map(file => new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsDataURL(file);
    }))
  );
}

/* === Theme === */
function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  const btn = byId("theme-toggle");
  if (btn) {
    if (theme === "dark") btn.innerHTML = `<i class="ri-sun-line"></i> Light`;
    else btn.innerHTML = `<i class="ri-moon-line"></i> Dark`;
  }
}

function initTheme() {
  const THEME_KEY = "task_manager_theme";
  let saved = localStorage.getItem(THEME_KEY);
  if (saved !== "dark" && saved !== "light") saved = "light";
  applyTheme(saved);
  const btn = byId("theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "light" ? "dark" : "light";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }
}

/* === Project filter options === */
function updateProjectFilterOptions() {
  const projectFilter = byId("project-filter");
  if (!projectFilter) return;
  const projects = [...new Set(tasks.filter(t => !t.deleted && t.project).map(t => t.project))].sort();
  const prev = projectFilter.value || "all";
  projectFilter.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "all";
  optAll.textContent = "ყველა";
  projectFilter.appendChild(optAll);
  projects.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    projectFilter.appendChild(opt);
  });
  if ([ "all", ...projects ].includes(prev)) projectFilter.value = prev;
}

/* === Filters === */
function getFilteredTasks() {
  const statusFilter = byId("status-filter") ? byId("status-filter").value : "all";
  const search = byId("search") ? byId("search").value.trim().toLowerCase() : "";
  const dateFilter = byId("date-filter") ? byId("date-filter").value : "all";
  const projectFilter = byId("project-filter") ? byId("project-filter").value : "all";
  const sortMode = byId("sort") ? byId("sort").value : "დამატების რიგით";

  let result = tasks.slice();

  // status
  if (statusFilter === "deleted") result = result.filter(t => t.deleted);
  else if (statusFilter === "current") result = result.filter(t => !t.deleted && !t.done);
  else if (statusFilter === "done") result = result.filter(t => !t.deleted && t.done);
  else result = result.filter(t => !t.deleted);

  // project
  if (projectFilter !== "all") result = result.filter(t => (t.project || "") === projectFilter);

  // search
  if (search) {
    result = result.filter(t =>
      (t.title || "").toLowerCase().includes(search) ||
      (t.description || "").toLowerCase().includes(search) ||
      (t.project || "").toLowerCase().includes(search)
    );
  }

  // date filter (today / week)
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekEnd = new Date(todayDate);
  weekEnd.setDate(weekEnd.getDate() + 7);

  if ((dateFilter === "today" || dateFilter === "week") && result.length) {
    result = result.filter(t => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate + "T00:00:00");
      if (isNaN(d.getTime())) return false;
      if (dateFilter === "today") return d.getTime() === todayDate.getTime();
      return d >= todayDate && d <= weekEnd;
    });
  }

  // sorting
  if (sortMode === "ვადით (ჯერ ადრე)") {
    result.sort((a,b) => {
      const da = a.dueDate ? new Date(a.dueDate) : new Date(8640000000000000);
      const db = b.dueDate ? new Date(b.dueDate) : new Date(8640000000000000);
      return da - db;
    });
  } else if (sortMode === "სტატუსით (აქტიური ზემოთ)") {
    result.sort((a,b) => Number(a.done) - Number(b.done));
  } else if (sortMode === "პრიორიტეტით") {
    const order = { high: 0, normal: 1, low: 2 };
    result.sort((a,b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1));
  } else {
    result.sort((a,b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  return result;
}

/* === Render list === */
function renderList() {
  const list = byId("task-list");
  if (!list) return;
  list.innerHTML = "";

  const filtered = getFilteredTasks();

  // empty state
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.style.padding = "14px";
    empty.style.textAlign = "center";
    empty.style.color = getComputedStyle(document.documentElement).getPropertyValue("--text-muted") || "#6b7280";
    empty.innerHTML = `<p style="margin:0 0 8px;">ვერ მოიძებნა დავალება.</p>
      <div><button id="add-first" class="btn-primary" style="padding:8px 12px;">ახალი დავალება</button></div>`;
    list.appendChild(empty);
    const addBtn = byId("add-first");
    if (addBtn) addBtn.addEventListener("click", () => { byId("title")?.focus(); });
    updateStatusBar();
    updateProjectFilterOptions();
    updateDashboard();
    return;
  }

  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  filtered.forEach(t => {
    const item = document.createElement("div");
    item.className = "task-item";
    item.tabIndex = 0;
    item.setAttribute("role", "listitem");

    // priority border
    if (t.priority === "high") item.classList.add("priority-high");
    else if (t.priority === "normal") item.classList.add("priority-normal");
    else if (t.priority === "low") item.classList.add("priority-low");

    if (t.done) item.classList.add("done");
    if (t.deleted) item.classList.add("deleted");
    if (t.justAdded) { item.classList.add("task-animate"); t.justAdded = false; }
    if (selectedId === t.id) item.classList.add("selected");

    const main = document.createElement("div");
    main.className = "task-main";

    const title = document.createElement("div");
    title.className = "task-title";
    title.textContent = t.title || "(უსათაურო)";
    if (t.done) { title.style.textDecoration = "line-through"; title.style.color = "var(--text-muted)"; }
    main.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "task-meta";
    const parts = [];
    if (t.startDate) parts.push("საწყისი: " + t.startDate);
    if (t.dueDate) parts.push("დედლაინი: " + t.dueDate);
    if (t.project) parts.push("პროექტი: " + t.project);

    // ADD amount if present
    if (t.amount !== undefined && t.amount !== null && t.amount !== "") {
      parts.push("თანხა: " + formatCurrency(t.amount));
    }

    // add status to meta (if set and not default visual overrides)
    if (t.status) {
      const sn = STATUS_NAMES[t.status] || t.status;
      parts.push("სტატუსი: " + sn);
    }

    if (!t.deleted && !t.done && t.dueDate) {
      const d = new Date(t.dueDate + "T00:00:00");
      if (!isNaN(d.getTime()) && d < todayDate) parts.push("ვადაგადაცილებული");
    }

    meta.textContent = parts.join(" | ");
    main.appendChild(meta);

    const badge = document.createElement("div");
    badge.className = "badge";
    if (t.deleted) { badge.classList.add("deleted"); badge.textContent = "ნაგავში"; }
    else if (t.done) { badge.classList.add("done"); badge.textContent = "დასრულებული"; }
    else {
      badge.textContent = PRIORITY_DISPLAY[t.priority] || "საშუალო";
      if (t.priority === "high") badge.classList.add("high");
      if (t.priority === "low") badge.classList.add("low");
    }

    if (!t.deleted && !t.done && t.dueDate) {
      const d = new Date(t.dueDate + "T00:00:00");
      if (!isNaN(d.getTime()) && d < todayDate) { badge.classList.add("overdue"); badge.textContent = "ვადაგადაცილებული"; }
    }

    item.appendChild(main);
    item.appendChild(badge);

    item.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedId = t.id;
      renderList();
      fillDetails(t);
      fillFormForEdit(t);
    });

    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); item.click(); }
    });

    list.appendChild(item);
  });

  // selected validation
  if (selectedId && !tasks.some(x => x.id === selectedId)) {
    selectedId = null;
    clearDetails();
  }

  updateStatusBar();
  updateProjectFilterOptions();
  updateDashboard();
}

/* === Details & Form === */
function clearDetails() {
  const ids = ["d-title","d-start","d-due","d-status","d-project","d-desc","d-amount"];
  ids.forEach(id => { const el = byId(id); if (el) el.textContent = "-"; });
  const photosBlock = byId("details-photos"); if (photosBlock) photosBlock.remove();
}

function fillDetails(t) {
  if (!t) return clearDetails();
  byId("d-title") && (byId("d-title").textContent = t.title || "-");
  byId("d-start") && (byId("d-start").textContent = formatDate(t.startDate));
  byId("d-due") && (byId("d-due").textContent = formatDate(t.dueDate));

  // status precedence: deleted / done / explicit status
  let statusText = "";
  if (t.deleted) statusText = "ნაგავში";
  else if (t.done) statusText = "დასრულებული";
  else statusText = STATUS_NAMES[t.status] || t.status || "სტატუსი მითითებული არაა";

  byId("d-status") && (byId("d-status").textContent = statusText);
  byId("d-project") && (byId("d-project").textContent = t.project || "-");
  byId("d-desc") && (byId("d-desc").textContent = t.description || "-");
  byId("d-amount") && (byId("d-amount").textContent = (t.amount !== undefined && t.amount !== null && t.amount !== "") ? formatCurrency(t.amount) : "-");

  // photos
  const old = byId("details-photos"); if (old) old.remove();
  if (!t.photos || !t.photos.length) return;
  const wrap = document.createElement("div"); wrap.id = "details-photos"; wrap.style.marginTop = "8px";
  const titleEl = document.createElement("p"); titleEl.innerHTML = `<strong>ფოტოები (${t.photos.length}):</strong>`; wrap.appendChild(titleEl);
  const row = document.createElement("div"); row.className = "details-photos-row";
  t.photos.forEach(src => {
    const img = document.createElement("img"); img.src = src; img.className = "details-photo-thumb";
    img.addEventListener("click", () => showLargePhoto(src));
    row.appendChild(img);
  });
  wrap.appendChild(row);
  const detailsBox = byId("details-box"); if (detailsBox) detailsBox.appendChild(wrap);
}

function fillFormForEdit(t) {
  if (!t) return;
  const idField = byId("task-id"); if (idField) idField.value = t.id;
  if (byId("title")) byId("title").value = t.title || "";
  if (byId("start-date")) byId("start-date").value = t.startDate || "";
  if (byId("due")) byId("due").value = t.dueDate || "";
  if (byId("priority")) byId("priority").value = t.priority || "normal";

  // new: status field (uses keys)
  if (byId("task-status")) byId("task-status").value = t.status || "pending";

  // NEW: amount field (populate form input)
  if (byId("amount")) {
    byId("amount").value = (t.amount !== undefined && t.amount !== null && t.amount !== "") ? t.amount : "";
  }

  // project select & other field
  const projectSel = byId("project");
  const projectOther = byId("project-other");
  if (projectSel && projectOther) {
    if (["A ბლოკი","B ბლოკი","C ბლოკი"].includes(t.project)) {
      projectSel.value = t.project;
      projectOther.style.display = "none";
      projectOther.value = "";
    } else {
      projectSel.value = t.project ? "other" : "";
      if (projectSel.value === "other") {
        projectOther.style.display = "block";
        projectOther.value = t.project || "";
      } else {
        projectOther.style.display = "none";
        projectOther.value = "";
      }
    }
  }

  if (byId("description")) byId("description").value = t.description || "";

  if (byId("save-btn")) byId("save-btn").textContent = "დავალების განახლება";
}

function clearForm() {
  if (byId("task-id")) byId("task-id").value = "";
  if (byId("title")) byId("title").value = "";
  if (byId("start-date")) byId("start-date").value = "";
  if (byId("due")) byId("due").value = "";
  if (byId("priority")) byId("priority").value = "normal";
  if (byId("project")) byId("project").value = "";
  if (byId("project-other")) { byId("project-other").value = ""; byId("project-other").style.display = "none"; }
  if (byId("description")) byId("description").value = "";
  if (byId("photos")) byId("photos").value = "";
  // reset status to default
  if (byId("task-status")) byId("task-status").value = "pending";
  if (byId("save-btn")) byId("save-btn").textContent = "დავალების შენახვა";
  // RESET amount
  if (byId("amount")) byId("amount").value = "";
}

/* === Status / Dashboard === */
function updateStatusBar() {
  const includeDone = byId("include-done") ? byId("include-done").checked : false;
  const includeDeleted = byId("include-deleted") ? byId("include-deleted").checked : false;

  const total = tasks.filter(t => !t.deleted).length;
  const active = tasks.filter(t => !t.deleted && !t.done).length;
  const done = tasks.filter(t => !t.deleted && t.done).length;

  // activeAmount respects deleted filter (only active tasks)
  const activeCandidates = tasks.filter(t => {
    if (t.done) return false;
    if (!includeDeleted && t.deleted) return false;
    return true;
  });

  const sum = (arr) => arr.reduce((acc, x) => {
    const v = x.amount;
    if (v !== undefined && v !== null && v !== "" && !isNaN(Number(v))) return acc + Number(v);
    return acc;
  }, 0);

  const activeAmount = sum(activeCandidates);

  // totalAmount respects includeDone/includeDeleted
  const totalCandidates = tasks.filter(t => {
    if (!includeDeleted && t.deleted) return false;
    if (!includeDone && t.done) return false;
    return true;
  });
  const totalAmount = sum(totalCandidates);

  const sb = byId("status-bar");
  if (sb) {
    sb.innerHTML = `დავალებები: ${active} აქტიური / ${done} დასრულებული / ${total} სულ` +
      ` &nbsp; | &nbsp; აქტიური თანხა: ${formatCurrency(activeAmount)}` +
      ` &nbsp; | &nbsp; ჯამში: ${formatCurrency(totalAmount)}`;
  }
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "-";
  const num = Number(value);
  if (isNaN(num)) return String(value);
  try {
    return new Intl.NumberFormat('ka-GE', { style: 'currency', currency: 'GEL' }).format(num);
  } catch (e) {
    return "₾ " + num.toFixed(2);
  }
}

function updateDashboard() {
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekEnd = new Date(todayDate); weekEnd.setDate(weekEnd.getDate() + 7);

  // Controls state
  const includeDone = byId("include-done") ? byId("include-done").checked : false;
  const includeDeleted = byId("include-deleted") ? byId("include-deleted").checked : false;

  // Filtered set for "all" (respecting includeDeleted / includeDone)
  const all = tasks.filter(t => {
    if (!includeDeleted && t.deleted) return false;
    if (!includeDone && t.done) return false;
    return true;
  });

  const total = all.length;
  const active = all.filter(t => !t.done);
  const done = all.filter(t => t.done);

  let overdue = 0, dueToday = 0, dueWeek = 0, high = 0, normal = 0, low = 0;
  active.forEach(t => {
    if (t.priority === "high") high++;
    if (t.priority === "normal") normal++;
    if (t.priority === "low") low++;
    if (t.dueDate) {
      const d = new Date(t.dueDate + "T00:00:00");
      if (isNaN(d.getTime())) return;
      if (d < todayDate) overdue++;
      if (d.getTime() === todayDate.getTime()) dueToday++;
      if (d >= todayDate && d <= weekEnd) dueWeek++;
    }
  });

  // Amount sums (respect same include flags)
  const sumAmount = (arr) => {
    let s = 0;
    arr.forEach(t => {
      if (t.amount !== undefined && t.amount !== null && t.amount !== "" && !isNaN(Number(t.amount))) {
        s += Number(t.amount);
      }
    });
    return s;
  };

  // active amount = only active tasks (not done) and respecting includeDeleted
  const activeCandidates = tasks.filter(t => {
    if (t.done) return false;
    if (!includeDeleted && t.deleted) return false;
    return true;
  });
  const activeAmount = sumAmount(activeCandidates);

  // total amount = respect includeDone/includeDeleted
  const totalCandidates = tasks.filter(t => {
    if (!includeDeleted && t.deleted) return false;
    if (!includeDone && t.done) return false;
    return true;
  });
  const totalAmount = sumAmount(totalCandidates);

  if (byId("dash-total")) byId("dash-total").textContent = `სულ: ${total} (აქტიური: ${active.length}, დასრულებული: ${done.length})`;
  if (byId("dash-overdue")) byId("dash-overdue").textContent = `ვადაგადაცილებული აქტიური: ${overdue}`;
  if (byId("dash-today")) byId("dash-today").textContent = `დღეს გასაკეთებელი (აქტივი): ${dueToday}`;
  if (byId("dash-week")) byId("dash-week").textContent = `ამ კვირაში გასაკეთებელი (აქტივი): ${dueWeek}`;
  if (byId("dash-priority")) byId("dash-priority").textContent = `პრიორიტეტები (აქტიური) – მაღალი: ${high}, საშუალო: ${normal}, დაბალი: ${low}`;

  if (byId("dash-amounts")) {
    byId("dash-amounts").innerHTML =
      `ფული — აქტიური ჯამი: ${formatCurrency(activeAmount)} &nbsp; | &nbsp; ჯამური: ${formatCurrency(totalAmount)}` +
      ` <span style="font-weight:400; color:var(--text-muted); margin-left:8px;">(ფილტრები: ${includeDone ? "დასრულებული ჩართული" : "დასრულებული გამორთული"}, ${includeDeleted ? "ნაგავი ჩართული" : "ნაგავი გამორთული"})</span>`;
  }

  // update status bar as well (keeps amounts in sync)
  updateStatusBar();
}

/* === Form submit === */
async function onFormSubmit(e) {
  e.preventDefault();
  const form = byId("task-form");
  if (!form) return;
  if (!form.reportValidity()) return;

  const idValue = byId("task-id")?.value || "";
  const title = (byId("title")?.value || "").trim();
  const startDate = (byId("start-date")?.value || "").trim();
  const dueDate = (byId("due")?.value || "").trim();
  const priority = (byId("priority")?.value || "normal");
  const amountRaw = byId("amount") ? (byId("amount").value || "").toString().trim() : "";
  const amount = amountRaw === "" ? "" : Number(amountRaw);

  // project handling: select + other
  let project = "";
  const projectSel = byId("project");
  const projectOther = byId("project-other");
  if (projectSel) {
    project = projectSel.value || "";
    if (project === "other" && projectOther) project = (projectOther.value || "").trim();
  }

  const description = (byId("description")?.value || "").trim();
  const photoFiles = byId("photos")?.files || [];
  const statusValue = byId("task-status") ? byId("task-status").value : "pending";

  // validation: if both set, start <= due
  if (startDate && dueDate) {
    if (new Date(startDate) > new Date(dueDate)) {
      alert("დედლაინი უნდა იყოს საწყის ვადაზე მოგვიანო.");
      return;
    }
  }

  // edit
  if (idValue) {
    const id = Number(idValue);
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    t.title = title;
    t.startDate = startDate;
    t.dueDate = dueDate;
    t.priority = priority;
    t.project = project;
    t.description = description;
    t.status = statusValue;
    t.amount = amount;

    if (photoFiles && photoFiles.length > 0) {
      const newImgs = await readFilesAsBase64(photoFiles);
      t.photos = (t.photos || []).concat(newImgs);
    }
    saveTasks();
    renderList();
    fillDetails(t);
    return;
  }

  // new
  const imagesBase64 = await readFilesAsBase64(photoFiles);
  const newTask = {
    id: Date.now(),
    createdAt: Date.now(),
    title,
    startDate,
    dueDate,
    priority,
    project,
    description,
    status: statusValue,
    photos: imagesBase64,
    done: false,
    deleted: false,
    justAdded: true,
    amount: amount
  };

  tasks.push(newTask);
  saveTasks();

  clearForm(); clearDetails(); selectedId = null;
  renderList();
}

/* === toggleDone (no cloning) === */
function toggleDone() {
  const idValue = byId("task-id")?.value;
  if (!idValue) { alert("ჯერ აირჩიე დავალება სიიდან."); return; }
  const id = Number(idValue);
  const t = tasks.find(x => x.id === id);
  if (!t) { alert("არჩეული დავალება ვერ მოიძებნა."); return; }
  t.done = !t.done;
  saveTasks();
  renderList();
  fillDetails(t);
}

/* === deleteTask (soft by default; permanent when viewing deleted status) === */
function deleteTask() {
  const idValue = byId("task-id")?.value;
  if (!idValue) { alert("ჯერ აირჩიე დავალება სიიდან."); return; }
  const id = Number(idValue);
  const idx = tasks.findIndex(x => x.id === id);
  if (idx === -1) return;
  const t = tasks[idx];

  // if currently viewing deleted tasks -> permanent delete
  const statusFilterVal = byId("status-filter") ? byId("status-filter").value : "all";
  if (statusFilterVal === "deleted") {
    if (!confirm("ეს დავალება საბოლოოდ წაიშლება. გინდა გაგრძელება?")) return;
    tasks.splice(idx, 1);
    saveTasks();
    selectedId = null; clearForm(); clearDetails(); renderList();
    return;
  }

  // else soft-delete
  if (!confirm("დავალება ნაგავში გადავიდეს?")) return;
  t.deleted = true;
  saveTasks();
  selectedId = null; clearForm(); clearDetails(); renderList();
}

/* === photo big view === */
function showLargePhoto(src) {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed"; overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.8)"; overlay.style.display = "flex";
  overlay.style.alignItems = "center"; overlay.style.justifyContent = "center";
  overlay.style.zIndex = "9999"; overlay.style.cursor = "pointer";
  const img = document.createElement("img");
  img.src = src; img.style.maxWidth = "90%"; img.style.maxHeight = "90%";
  img.style.borderRadius = "10px"; img.style.boxShadow = "0 0 20px #000";
  overlay.appendChild(img);
  overlay.addEventListener("click", () => overlay.remove());
  document.body.appendChild(overlay);
}

/* === click outside to clear selection === */
function setupClickOutsideClear() {
  const taskListEl = byId("task-list");
  if (taskListEl) {
    taskListEl.addEventListener("click", (e) => {
      if (e.target.closest(".task-item")) return;
      selectedId = null; clearForm(); clearDetails(); renderList();
    });
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest(".card")) return;
    if (e.target.closest(".task-item")) return;
    selectedId = null; clearForm(); clearDetails(); renderList();
  });
}

/* === init === */
document.addEventListener("DOMContentLoaded", () => {
  // load tasks and normalize
  tasks = loadTasks() || [];
  normalizeTasks();

  // theme
  initTheme();

  // form listeners
  const formEl = byId("task-form");
  if (formEl) formEl.addEventListener("submit", onFormSubmit);

  const clearBtn = byId("clear-btn");
  if (clearBtn) clearBtn.addEventListener("click", () => { clearForm(); selectedId = null; clearDetails(); });

  const toggleDoneBtn = byId("toggle-done-btn");
  if (toggleDoneBtn) toggleDoneBtn.addEventListener("click", toggleDone);

  const deleteBtn = byId("delete-btn");
  if (deleteBtn) deleteBtn.addEventListener("click", deleteTask);

  // title input -> if cleared, drop edit mode
  const titleInput = byId("title");
  if (titleInput) titleInput.addEventListener("input", () => {
    const idField = byId("task-id");
    if (idField && idField.value && !titleInput.value.trim()) {
      idField.value = ""; selectedId = null; clearDetails();
      const saveBtn = byId("save-btn"); if (saveBtn) saveBtn.textContent = "დავალების შენახვა";
    }
  });

  // project select: show "other"
  const projectSelect = byId("project");
  const projectOther = byId("project-other");
  if (projectSelect && projectOther) {
    projectSelect.addEventListener("change", () => {
      if (projectSelect.value === "other") { projectOther.style.display = "block"; projectOther.focus(); }
      else { projectOther.style.display = "none"; projectOther.value = ""; }
    });
  }

  // date pickers (showPicker if available)
  ["start-date","due"].forEach(id => {
    const el = byId(id);
    if (el && typeof el.showPicker === "function") {
      el.addEventListener("click", () => el.showPicker());
      el.addEventListener("focus", () => el.showPicker());
    }
  });

  // filter listeners (search with debounce)
  const searchEl = byId("search");
  if (searchEl) {
    searchEl.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderList, 220);
    });
  }

  ["sort","date-filter","project-filter","status-filter"].forEach(id => {
    const el = byId(id);
    if (el) el.addEventListener("change", renderList);
  });

  // include toggles (add once)
  const includeDoneEl = byId("include-done");
  const includeDeletedEl = byId("include-deleted");
  if (includeDoneEl) includeDoneEl.addEventListener("change", () => { renderList(); updateDashboard(); });
  if (includeDeletedEl) includeDeletedEl.addEventListener("change", () => { renderList(); updateDashboard(); });

  // keyboard accessibility: make task items selectable after render
  setupClickOutsideClear();

  // custom validity messages (keep behavior)
  document.querySelectorAll("input[required], textarea[required], select[required]").forEach(el => {
    el.addEventListener("invalid", function () {
      if (!el.value.trim()) el.setCustomValidity("გთხოვთ შეავსოთ ეს ველი.");
    });
    el.addEventListener("input", function () { el.setCustomValidity(""); });
  });

  // initial render
  renderList();
  updateDashboard();
});

/* expose helpful functions for console */
window.TaskManager = {
  renderList, saveTasks, loadTasks, clearForm, clearDetails
};
