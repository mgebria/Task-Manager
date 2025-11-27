const STORAGE_KEY = "roof_tasks_web_v2";

const PRIORITY_DISPLAY = {
  low: "დაბალი",
  normal: "საშუალო",
  high: "მაღალი",
};

const REPEAT_DISPLAY = {
  none: "არა",
  daily: "ყოველდღე",
  weekly: "ყოველ კვირა",
  monthly: "ყოველ თვე",
};

const THEME_KEY = "task_manager_theme";

let tasks = [];
let selectedId = null;

/* === ფოტო ფაილების წაკითხვა base64-ად === */
function readFilesAsBase64(files) {
  return Promise.all(
    [...files].map(file => {
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
    })
  );
}

/* === თემა === */

function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.textContent = theme === "dark" ? "Light" : "Dark";
  }
}

function initTheme() {
  let saved = localStorage.getItem(THEME_KEY);
  if (saved !== "dark" && saved !== "light") {
    saved = "light";
  }
  applyTheme(saved);

  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "light" ? "dark" : "light";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }
}

/* === Helpers === */

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function byId(id) {
  return document.getElementById(id);
}

function formatDate(dateStr) {
  return dateStr || "-";
}

function updateProjectFilterOptions() {
  const projectFilter = byId("project-filter");
  const projects = [...new Set(tasks.filter(t => !t.deleted && t.project)
    .map(t => t.project))].sort();
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
}

/* === ფილტრები === */

function getFilteredTasks() {
  const onlyActive = byId("only-active").checked;
  const showDeleted = byId("show-deleted").checked;
  const search = byId("search").value.trim().toLowerCase();
  const dateFilter = byId("date-filter").value;
  const projectFilter = byId("project-filter").value;
  const sortMode = byId("sort").value;

  let result = tasks.slice();

  // ნაგავი / არა ნაგავი
  if (showDeleted) {
    result = result.filter(t => t.deleted);
  } else {
    result = result.filter(t => !t.deleted);
    if (onlyActive) result = result.filter(t => !t.done);
  }

  // პროექტი
  if (projectFilter !== "all") {
    result = result.filter(t => (t.project || "") === projectFilter);
  }

  // ძებნა
  if (search) {
    result = result.filter(t =>
      (t.title || "").toLowerCase().includes(search) ||
      (t.description || "").toLowerCase().includes(search)
    );
  }

  // დროის ფილტრი (დედლაინით)
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekEnd = new Date(todayDate);
  weekEnd.setDate(weekEnd.getDate() + 7);

  if (!showDeleted && (dateFilter === "today" || dateFilter === "week")) {
    result = result.filter(t => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate + "T00:00:00");
      if (isNaN(d.getTime())) return false;
      if (dateFilter === "today") {
        return d.getTime() === todayDate.getTime();
      } else {
        return d >= todayDate && d <= weekEnd;
      }
    });
  }

  // სორტირება
  if (sortMode === "ვადით (ჯერ ადრე)") {
    result.sort((a, b) => {
      const da = a.dueDate ? new Date(a.dueDate) : new Date(8640000000000000);
      const db = b.dueDate ? new Date(b.dueDate) : new Date(8640000000000000);
      return da - db;
    });
  } else if (sortMode === "სტატუსით (აქტიური ზემოთ)") {
    result.sort((a, b) => Number(a.done) - Number(b.done));
  } else if (sortMode === "პრიორიტეტით") {
    const order = { high: 0, normal: 1, low: 2 };
    result.sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1));
  } else {
    // დამატების რიგით
    result.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  return result;
}

/* === სია === */

function renderList() {
  const list = byId("task-list");
  list.innerHTML = "";
  const filtered = getFilteredTasks();
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  filtered.forEach(t => {
    const item = document.createElement("div");
    item.className = "task-item";

    // PRIORITY border color
    if (t.priority === "high") item.classList.add("priority-high");
    else if (t.priority === "normal") item.classList.add("priority-normal");
    else if (t.priority === "low") item.classList.add("priority-low");

    // Done/deleted
    if (t.done) item.classList.add("done");
    if (t.deleted) item.classList.add("deleted");

    // If newly added → animate
    if (t.justAdded) {
      item.classList.add("task-animate");
      t.justAdded = false; // one-time animation
    }

    if (selectedId === t.id) {
      item.classList.add("selected");
    }

    const main = document.createElement("div");
    main.className = "task-main";

    const title = document.createElement("div");
    title.className = "task-title";
    title.textContent = t.title || "(უსათაურო)";
    if (t.done) {
      title.style.textDecoration = "line-through";
      title.style.color = "#9ca3af";
    }
    main.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "task-meta";
    const parts = [];
    if (t.startDate) parts.push("საწყისი: " + t.startDate);
    if (t.dueDate) parts.push("დედლაინი: " + t.dueDate);
    if (t.responsibleName) parts.push("პასუხ.: " + t.responsibleName);
    if (t.project) parts.push("პროექტი: " + t.project);

    if (!t.deleted && !t.done && t.dueDate) {
      const d = new Date(t.dueDate + "T00:00:00");
      if (!isNaN(d.getTime()) && d < todayDate) {
        parts.push("ვადაგადაცილებული");
      }
    }

    meta.textContent = parts.join(" | ");
    main.appendChild(meta);

    const badge = document.createElement("div");
    badge.className = "badge";
    if (t.deleted) {
      badge.classList.add("deleted");
      badge.textContent = "ნაგავში";
    } else if (t.done) {
      badge.classList.add("done");
      badge.textContent = "დასრულებული";
    } else {
      badge.textContent = PRIORITY_DISPLAY[t.priority] || "საშუალო";
      if (t.priority === "high") badge.classList.add("high");
      if (t.priority === "low") badge.classList.add("low");
    }

    if (!t.deleted && !t.done && t.dueDate) {
      const d = new Date(t.dueDate + "T00:00:00");
      if (!isNaN(d.getTime()) && d < todayDate) {
        badge.classList.add("overdue");
        badge.textContent = "ვადაგადაცილებული";
      }
    }

    item.appendChild(main);
    item.appendChild(badge);

    item.addEventListener("click", () => {
      selectedId = t.id;
      renderList();      // თავიდან ვხატავთ, რომ selected კლასიც განახლდეს
      fillDetails(t);
      fillFormForEdit(t);
    });

    list.appendChild(item);
  });

  if (selectedId) {
    const stillExists = tasks.some(t => t.id === selectedId);
    if (!stillExists) {
      selectedId = null;
      clearDetails();
    }
  }

  updateStatusBar();
  updateProjectFilterOptions();
  updateDashboard();
}

/* === დეტალები === */

/* === დეტალები === */

function clearDetails() {
  byId("d-title").textContent  = "-";
  byId("d-start").textContent  = "-";
  byId("d-due").textContent    = "-";
  byId("d-status").textContent = "-";
  byId("d-project").textContent= "-";
  byId("d-resp").textContent   = "-";
  byId("d-repeat").textContent = "-";
  byId("d-desc").textContent   = "-";

  const photosBlock = document.getElementById("details-photos");
  if (photosBlock) photosBlock.remove();
}

function fillDetails(t) {
  byId("d-title").textContent  = t.title || "-";
  byId("d-start").textContent  = formatDate(t.startDate);
  byId("d-due").textContent    = formatDate(t.dueDate);
  const status = t.deleted ? "ნაგავში" : t.done ? "დასრულებული" : "აქტიური";
  byId("d-status").textContent = status;
  byId("d-project").textContent = t.project || "-";
  byId("d-resp").textContent =
    (t.responsibleName || "") +
    (t.responsiblePhone ? " (" + t.responsiblePhone + ")" : "") || "-";
  byId("d-repeat").textContent = REPEAT_DISPLAY[t.repeat] || "არა";
  byId("d-desc").textContent   = t.description || "-";

  // ძველი ფოტოების ბლოკის წაშლა
  const detailsBox = document.getElementById("details-box");
  const old = document.getElementById("details-photos");
  if (old) old.remove();

  // თუ ფოტო არ აქვს საერთოდ
  if (!t.photos || !t.photos.length) {
    return;
  }

  // ახალი ბლოკი ფოტოებისათვის
  const wrap = document.createElement("div");
  wrap.id = "details-photos";
  wrap.style.marginTop = "8px";

  const titleEl = document.createElement("p");
  titleEl.innerHTML = "<strong>ფოტოები (" + t.photos.length + "):</strong>";
  wrap.appendChild(titleEl);

  const row = document.createElement("div");
  row.className = "details-photos-row";

  t.photos.forEach(src => {
    const img = document.createElement("img");
    img.src = src;
    img.className = "details-photo-thumb";
    img.addEventListener("click", () => showLargePhoto(src));
    row.appendChild(img);
  });

  wrap.appendChild(row);
  detailsBox.appendChild(wrap);
}


/* === ფორმა === */

function fillFormForEdit(t) {
  byId("task-id").value = t.id;
  byId("title").value = t.title || "";
  byId("start-date").value = t.startDate || "";
  byId("due").value = t.dueDate || "";
  byId("priority").value = t.priority || "normal";
  byId("project").value = t.project || "";
  byId("responsible-name").value = t.responsibleName || "";
  byId("responsible-phone").value = t.responsiblePhone || "";
  byId("repeat").value = t.repeat || "none";
  byId("description").value = t.description || "";
  byId("save-btn").textContent = "დავალების განახლება";
}

function clearForm() {
  byId("task-id").value = "";
  byId("title").value = "";
  byId("start-date").value = "";
  byId("due").value = "";
  byId("priority").value = "normal";
  byId("project").value = "";
  byId("responsible-name").value = "";
  byId("responsible-phone").value = "";
  byId("repeat").value = "none";
  byId("description").value = "";
  byId("photos").value = "";
  byId("save-btn").textContent = "დავალების შენახვა";
}

/* === სტატუსი / Dashboard === */

function updateStatusBar() {
  const total = tasks.filter(t => !t.deleted).length;
  const active = tasks.filter(t => !t.deleted && !t.done).length;
  const done = tasks.filter(t => !t.deleted && t.done).length;
  byId("status-bar").textContent =
    `დავალებები: ${active} აქტიური / ${done} დასრულებული / ${total} სულ`;
}

function updateDashboard() {
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekEnd = new Date(todayDate);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const all = tasks.filter(t => !t.deleted);
  const total = all.length;
  const active = all.filter(t => !t.done);
  const done = all.filter(t => t.done);

  let overdue = 0;
  let dueToday = 0;
  let dueWeek = 0;
  let high = 0, normal = 0, low = 0;

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

  byId("dash-total").textContent =
    `სულ: ${total} (აქტიური: ${active.length}, დასრულებული: ${done.length})`;
  byId("dash-overdue").textContent = `ვადაგადაცილებული აქტიური: ${overdue}`;
  byId("dash-today").textContent = `დღეს გასაკეთებელი (აქტიური): ${dueToday}`;
  byId("dash-week").textContent = `ამ კვირაში გასაკეთებელი (აქტიური): ${dueWeek}`;
  byId("dash-priority").textContent =
    `პრიორიტეტები (აქტიური) – მაღალი: ${high}, საშუალო: ${normal}, დაბალი: ${low}`;
}

/* === WhatsApp === */

function createWhatsAppMessage(task) {
  const parts = [];
  parts.push(`გამარჯობა${task.responsibleName ? " " + task.responsibleName : ""}!`);
  parts.push("");
  parts.push("შენთვის ახალი დავალებაა:");
  parts.push(`დასახელება: ${task.title}`);
  if (task.project) parts.push(`პროექტი: ${task.project}`);
  if (task.startDate) parts.push(`საწყისი ვადა: ${task.startDate}`);
  if (task.dueDate) parts.push(`დედლაინი: ${task.dueDate}`);
  parts.push(`პრიორიტეტი: ${PRIORITY_DISPLAY[task.priority] || "საშუალო"}`);
  if (task.description) {
    parts.push("");
    parts.push("აღწერა:");
    parts.push(task.description);
  }
  parts.push("");
  parts.push("Task Manager-დან 🔧");
  return parts.join("\n");
}

function sendWhatsApp(task) {
  if (!task.responsiblePhone) return;
  const digits = task.responsiblePhone.replace(/\D/g, "");
  if (!digits) return;
  const text = createWhatsAppMessage(task);
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

/* === Form submit === */

async function onFormSubmit(event) {
  event.preventDefault();

  const form = byId("task-form");

  // ბრაუზერს ვთხოვთ required ველების შემოწმებას
  if (!form.reportValidity()) {
    return;
  }

  const idValue = byId("task-id").value;

  const title = byId("title").value.trim();
  const startDate = byId("start-date").value.trim();
  const dueDate = byId("due").value.trim();
  const priority = byId("priority").value;
  const project = byId("project").value.trim();
  const repeat = byId("repeat").value;
  const responsibleName = byId("responsible-name").value.trim();
  const responsiblePhone = byId("responsible-phone").value.trim(); // OPTIONAL
  const description = byId("description").value.trim();
  const photoFiles = byId("photos").files;

  // ლოგიკური შემოწმება: საწყისი ვადა <= დედლაინი
  if (new Date(startDate) > new Date(dueDate)) {
    alert("დედლაინი უნდა იყოს საწყის ვადაზე მოგვიანო.");
    return;
  }

  // --- რედაქტირება ---
  if (idValue) {
    const id = Number(idValue);
    const t = tasks.find(x => x.id === id);
    if (!t) return;

    t.title = title;
    t.startDate = startDate;
    t.dueDate = dueDate;
    t.priority = priority;
    t.project = project;
    t.repeat = repeat;
    t.description = description;
    t.responsibleName = responsibleName;
    t.responsiblePhone = responsiblePhone;

    // თუ ახალ ფოტოებს ავირჩევთ, ძველს მივუმატოთ
    if (photoFiles && photoFiles.length > 0) {
      const newImages = await readFilesAsBase64(photoFiles);
      t.photos = (t.photos || []).concat(newImages);
    }

    saveTasks();
    renderList();
    fillDetails(t);
    return;
  }

  // --- ახალი დავალება ---
  const imagesBase64 = await readFilesAsBase64(photoFiles);

  const newTask = {
    id: Date.now(),
    createdAt: Date.now(),
    title,
    startDate,
    dueDate,
    priority,
    project,
    repeat,
    description,
    responsibleName,
    responsiblePhone,
    photos: imagesBase64,
    done: false,
    deleted: false,
    justAdded: true,
  };

  tasks.push(newTask);
  saveTasks();

  clearForm();
  clearDetails();
  selectedId = null;

  renderList();

  if (responsiblePhone) {
    sendWhatsApp(newTask);
  }
}

/* === გამეორებადი დავალებები === */

function computeNextRepeatDate(t) {
  let baseDate;
  if (t.dueDate) {
    baseDate = new Date(t.dueDate + "T00:00:00");
    if (isNaN(baseDate.getTime())) baseDate = null;
  }
  if (!baseDate) {
    const now = new Date();
    baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  const d = new Date(baseDate);
  if (t.repeat === "daily") d.setDate(d.getDate() + 1);
  else if (t.repeat === "weekly") d.setDate(d.getDate() + 7);
  else if (t.repeat === "monthly") d.setMonth(d.getMonth() + 1);
  else return null;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toggleDone() {
  const idValue = byId("task-id").value;
  if (!idValue) {
    alert("ჯერ აირჩიე დავალება სიიდან.");
    return;
  }
  const id = Number(idValue);
  const t = tasks.find(x => x.id === id);
  if (!t) return;

  const prevDone = t.done;
  t.done = !t.done;

  if (!prevDone && t.done && t.repeat !== "none") {
    const nextDate = computeNextRepeatDate(t);
    const clone = {
      ...t,
      id: Date.now(),
      createdAt: Date.now(),
      done: false,
      deleted: false,
      dueDate: nextDate,
    };
    tasks.push(clone);
  }

  saveTasks();
  renderList();
  fillDetails(t);
}

/* === წაშლა === */

function deleteTask() {
  const idValue = byId("task-id").value;
  if (!idValue) {
    alert("ჯერ აირჩიე დავალება სიიდან.");
    return;
  }
  const id = Number(idValue);
  const t = tasks.find(x => x.id === id);
  if (!t) return;

  const showDeleted = byId("show-deleted").checked;

  if (showDeleted) {
    if (!confirm("ეს დავალება საბოლოოდ წაიშლება. გინდა გაგრძელება?")) return;
    tasks = tasks.filter(x => x.id !== id);
    clearForm();
    clearDetails();
  } else {
    if (!confirm("დავალება ნაგავში გადავიდეს?")) return;
    t.deleted = true;
  }
  saveTasks();
  renderList();
}

/* === Foto დიდი ზომით === */

function showLargePhoto(src) {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.8)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "9999";
  overlay.style.cursor = "pointer";

  const img = document.createElement("img");
  img.src = src;
  img.style.maxWidth = "90%";
  img.style.maxHeight = "90%";
  img.style.borderRadius = "10px";
  img.style.boxShadow = "0 0 20px #000";

  overlay.appendChild(img);

  overlay.addEventListener("click", () => overlay.remove());
  document.body.appendChild(overlay);
}

/* === Init === */

document.addEventListener("DOMContentLoaded", () => {
  tasks = loadTasks();

  // თემა
  initTheme();

  byId("task-form").addEventListener("submit", onFormSubmit);
  byId("clear-btn").addEventListener("click", () => {
    clearForm();
    selectedId = null;
    clearDetails();
  });
  byId("toggle-done-btn").addEventListener("click", toggleDone);
  byId("delete-btn").addEventListener("click", deleteTask);

  const titleInput = byId("title");
  titleInput.addEventListener("input", () => {
    const idField = byId("task-id");
    if (idField.value && !titleInput.value.trim()) {
      idField.value = "";
      selectedId = null;
      clearDetails();
      byId("save-btn").textContent = "დავალების შენახვა";
    }
  });

  // თარიღის ველებზე კალენდარი ავტომატურად გაიხსნას (Chrome/Edge)
  ["start-date", "due"].forEach(id => {
    const el = byId(id);
    if (el && typeof el.showPicker === "function") {
      el.addEventListener("click", () => el.showPicker());
      el.addEventListener("focus", () => el.showPicker());
    }
  });

  ["search", "sort", "date-filter"].forEach(id => {
    byId(id).addEventListener("input", renderList);
    byId(id).addEventListener("change", renderList);
  });
  ["only-active", "show-deleted", "project-filter"].forEach(id => {
    byId(id).addEventListener("change", renderList);
  });

  renderList();
});

// Custom error messages ქართულად
document.querySelectorAll("input[required], textarea[required], select[required]").forEach(el => {
  el.addEventListener("invalid", function () {
    if (!el.value.trim()) {
      el.setCustomValidity("გთხოვთ შეავსოთ ეს ველი.");
    }
  });

  el.addEventListener("input", function () {
    el.setCustomValidity("");
  });
});
