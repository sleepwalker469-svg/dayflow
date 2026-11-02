/* DAYFLOW — no backend, LocalStorage, PWA */
(() => {
    const STORE_KEY = "dayflow_v1";
    const now = () => new Date();
  
    const $ = (sel, root=document) => root.querySelector(sel);
    const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  
    const state = {
      data: null,
      ui: {
        route: "today",
        toastTimer: null,
        ioMode: "export",
        selectedNoteId: null,
        lastRenderSignature: ""
      }
    };
  
    // ---------- Date helpers (local timezone safe) ----------
    function pad2(n){ return String(n).padStart(2,"0"); }
  
    function dateToYMD(d){
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const day = d.getDate();
      return `${y}-${pad2(m)}-${pad2(day)}`;
    }
  
    function ymdToDate(ymd){
      // local date: parse manually
      const [y,m,d] = ymd.split("-").map(Number);
      return new Date(y, m-1, d, 12, 0, 0, 0); // midday avoids DST edges
    }
  
    function startOfWeek(d, monday=true){
      const dd = new Date(d);
      dd.setHours(12,0,0,0);
      const day = dd.getDay(); // 0 Sun ... 6 Sat
      const shift = monday ? (day === 0 ? -6 : (1 - day)) : -day;
      dd.setDate(dd.getDate() + shift);
      return dd;
    }
  
    function addDays(d, n){
      const dd = new Date(d);
      dd.setDate(dd.getDate() + n);
      return dd;
    }
  
    function formatYMDRu(ymd){
      const d = ymdToDate(ymd);
      return d.toLocaleDateString("ru-RU", { day:"2-digit", month:"long", year:"numeric" });
    }
  
    function formatDowRu(ymd){
      const d = ymdToDate(ymd);
      return d.toLocaleDateString("ru-RU", { weekday:"long" });
    }
  
    function msFromTimeStringLocal(t){
      if (!t) return null;
      const [hh, mm] = t.split(":").map(Number);
      return hh*60*60*1000 + mm*60*1000;
    }
  
    function timeStringFromMsLocal(ms){
      const totalMinutes = Math.round(ms/60000);
      const hh = Math.floor(totalMinutes/60);
      const mm = totalMinutes % 60;
      return `${pad2(hh)}:${pad2(mm)}`;
    }
  
    // ---------- Storage ----------
    function defaultData(){
      const todayYMD = dateToYMD(now());
      const tomorrowYMD = dateToYMD(addDays(now(), 1));
      const in2YMD = dateToYMD(addDays(now(), 2));
  
      const sampleTasks = [
        {
          id: uid(),
          title: "План на день: 3 главных дела",
          desc: "Выберите задачи, которые реально сдвинут прогресс.",
          date: todayYMD,
          start: "09:00",
          end: "09:20",
          priority: "high",
          category: "фокус",
          status: "todo"
        },
        {
          id: uid(),
          title: "Работа над задачей №1",
          desc: "Глубокая работа: 45–60 минут. Без переключений.",
          date: todayYMD,
          start: "10:00",
          end: "11:00",
          priority: "high",
          category: "работа",
          status: "todo"
        },
        {
          id: uid(),
          title: "Прогулка / разминка",
          desc: "Свежий воздух и легкая разминка.",
          date: todayYMD,
          start: "18:30",
          end: "19:10",
          priority: "medium",
          category: "здоровье",
          status: "todo"
        },
        {
          id: uid(),
          title: "Подвести итоги дня",
          desc: "Коротко: что получилось, что мешало, что улучшить завтра.",
          date: tomorrowYMD,
          start: "19:50",
          end: "20:10",
          priority: "low",
          category: "рефлексия",
          status: "todo"
        }
      ];
  
      const sampleHabits = [
        {
          id: uid(),
          title: "чтение",
          category: "обучение",
          goal: 1,
          color: "#60A5FA"
        },
        {
          id: uid(),
          title: "тренировка",
          category: "здоровье",
          goal: 1,
          color: "#22C55E"
        },
        {
          id: uid(),
          title: "учёба",
          category: "обучение",
          goal: 2,
          color: "#7C3AED"
        }
      ];
  
      // History: last 6 days random-ish but deterministic-free:
      // We'll set empty history by default to ensure "не фиктивная статистика" after install.
      // Пользовательские данные начнут формироваться после отметок.
      const habitHistory = {};
  
      // For better UX: add one or two done entries only if user has interacted? We'll keep empty.
      // Это не "фиктивная статистика", потому что она будет 0, пока пользователь не отметил.
      return {
        version: 1,
        createdAt: new Date().toISOString(),
        tasks: sampleTasks,
        habits: sampleHabits,
        habitHistory, // habitId -> { ymd: count }
        notes: [], // {id,title,body,updatedAt,createdAt}
        categories: ["фокус","работа","здоровье","рефлексия","общие"]
      };
    }
  
    function load(){
      try{
        const raw = localStorage.getItem(STORE_KEY);
        if (!raw) return (state.data = defaultData());
        const parsed = JSON.parse(raw);
        // minimal migration
        if (!parsed || typeof parsed !== "object") return (state.data = defaultData());
        if (!parsed.version) parsed.version = 1;
        if (!parsed.tasks) parsed.tasks = [];
        if (!parsed.habits) parsed.habits = [];
        if (!parsed.habitHistory) parsed.habitHistory = {};
        if (!parsed.notes) parsed.notes = [];
        if (!parsed.categories) parsed.categories = ["фокус","работа","здоровье","рефлексия","общие"];
        state.data = parsed;
        return state.data;
      } catch {
        state.data = defaultData();
        return state.data;
      }
    }
  
    function save(){
      localStorage.setItem(STORE_KEY, JSON.stringify(state.data));
    }
  
    function uid(){
      return "id_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
    }
  
    // ---------- UI helpers ----------
    function toast(text){
      let el = $("#toast");
      if (!el){
        el = document.createElement("div");
        el.id = "toast";
        document.body.appendChild(el);
        el.className = "toast";
      }
      el.textContent = text;
      el.style.opacity = "1";
      el.style.transform = "translate(-50%, 0)";
      clearTimeout(state.ui.toastTimer);
      state.ui.toastTimer = setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translate(-50%, -6px)";
      }, 1800);
    }
  
    // Add toast style dynamically (keeps CSS minimal)
    (function ensureToastStyle(){
      const id = "toast-style";
      if (document.getElementById(id)) return;
      const st = document.createElement("style");
      st.id = id;
      st.textContent = `
        .toast{
          position: fixed;
          left:50%; bottom: 92px;
          padding: 10px 14px;
          border-radius: 16px;
          background: rgba(0,0,0,0.55);
          border: 1px solid rgba(255,255,255,0.14);
          color: rgba(234,240,255,0.95);
          font-weight: 760;
          font-size: 13px;
          z-index: 999;
          opacity: 0;
          transition: opacity .2s ease, transform .2s ease;
          transform: translate(-50%, -6px);
          pointer-events:none;
        }
      `;
      document.head.appendChild(st);
    })();
  
    function openModal(modalEl){
      $("#modalBackdrop").hidden = false;
      modalEl.hidden = false;
      document.body.style.overflow = "hidden";
    }
    function closeModal(modalEl){
      $("#modalBackdrop").hidden = true;
      modalEl.hidden = true;
      document.body.style.overflow = "";
    }
  
    // ---------- Tasks ----------
    function getSelectedYMD(){
      // for TODAY: route uses local today
      return dateToYMD(now());
    }
  
    function getTasksForDay(ymd){
      return state.data.tasks
        .filter(t => t.date === ymd)
        .sort((a,b) => {
          const sa = msFromTimeStringLocal(a.start ?? "");
          const sb = msFromTimeStringLocal(b.start ?? "");
          if (sa == null && sb == null) return a.title.localeCompare(b.title,"ru");
          if (sa == null) return 1;
          if (sb == null) return -1;
          return sa - sb;
        });
    }
  
    function priorityLabel(p){
      if (p === "high") return "Высокий";
      if (p === "medium") return "Средний";
      return "Низкий";
    }
  
    function priorityBadgeClass(p){
      if (p === "high") return "high";
      if (p === "medium") return "medium";
      return "low";
    }
  
    function computeDayProgress(ymd){
      const tasks = getTasksForDay(ymd);
      const done = tasks.filter(t => t.status === "done").length;
      const total = tasks.length;
      const pct = total === 0 ? 0 : Math.round(done/total*100);
      return { done, total, pct };
    }
  
    function toggleTaskDone(taskId){
      const t = state.data.tasks.find(x => x.id === taskId);
      if (!t) return;
      t.status = t.status === "done" ? "todo" : "done";
      save();
      renderAll();
      toast(t.status === "done" ? "Отмечено выполненным" : "Возвращено в задачи");
    }
  
    function upsertTask(task){
      const idx = state.data.tasks.findIndex(t => t.id === task.id);
      if (idx >= 0) state.data.tasks[idx] = task;
      else state.data.tasks.push(task);
      save();
    }
  
    function deleteTask(taskId){
      state.data.tasks = state.data.tasks.filter(t => t.id !== taskId);
      save();
    }
  
    function categoriesFromTasksAndData(){
      const set = new Set(state.data.categories || []);
      for (const t of state.data.tasks){
        if (t.category && t.category.trim()) set.add(t.category.trim());
      }
      for (const h of state.data.habits){
        if (h.category && h.category.trim()) set.add(h.category.trim());
      }
      // Prefer stable ordering: existing categories first, then alphabetical.
      const base = Array.isArray(state.data.categories) ? state.data.categories.slice() : [];
      const rest = Array.from(set).filter(x => !base.includes(x)).sort((a,b)=>a.localeCompare(b,"ru"));
      return [...base, ...rest].slice(0, 60);
    }
  
    // ---------- Calendar helpers ----------
    const TIMELINE_START_HOUR = 7;
    const TIMELINE_END_HOUR = 22;
  
    function renderTimeline(container, tasks, selectedYMD){
      // grid by hours: each hour 44px
      const hourCount = (TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1);
      const pxPerHour = 44;
  
      const y = selectedYMD;
      const timeline = document.createElement("div");
      timeline.className = "timeline-grid";
  
      const leftCol = document.createElement("div");
      leftCol.className = "timeline-hours-col";
  
      const rightCol = document.createElement("div");
      rightCol.className = "timeline-track-col";
  
      timeline.appendChild(leftCol);
      timeline.appendChild(rightCol);
  
      const track = document.createElement("div");
      track.className = "timeline-track";
      track.style.height = `${hourCount * pxPerHour}px`;
  
      const itemsWrap = document.createElement("div");
      itemsWrap.className = "timeline-items";
      itemsWrap.style.height = `${hourCount * pxPerHour}px`;
  
      leftCol.style.height = `${hourCount * pxPerHour}px`;
  
      for (let h=TIMELINE_START_HOUR; h<=TIMELINE_END_HOUR; h++){
        const label = document.createElement("div");
        label.className = "timeline-hour";
        label.textContent = `${pad2(h)}:00`;
        leftCol.appendChild(label);
      }
  
      const slots = tasks
        .filter(t => t.start && t.end && t.date === y)
        .map(t => {
          const startMs = msFromTimeStringLocal(t.start);
          const endMs = msFromTimeStringLocal(t.end);
          if (startMs == null || endMs == null) return null;
          if (endMs <= startMs) return null;
          // convert to hour offsets
          const startHour = startMs/(3600000);
          const endHour = endMs/(3600000);
  
          const startPx = (startHour - TIMELINE_START_HOUR) * pxPerHour;
          const endPx = (endHour - TIMELINE_START_HOUR) * pxPerHour;
  
          // clamp to timeline
          const clStart = Math.max(0, Math.min(hourCount*pxPerHour - 6, startPx));
          const clEnd = Math.max(clStart + 14, Math.min(hourCount*pxPerHour, endPx));
  
          return { t, top: clStart, height: (clEnd - clStart) };
        })
        .filter(Boolean);
  
      // If many overlap, we still keep it minimal: no complex collision, but try to stagger by priority.
      const sorted = slots.sort((a,b) => a.top - b.top);
  
      for (const s of sorted){
        const pri = s.t.priority || "medium";
        const slot = document.createElement("div");
        slot.className = "slot";
        slot.style.top = `${s.top}px`;
        slot.style.height = `${Math.max(26, s.height)}px`;
  
        const accent = pri === "high" ? "rgba(239,68,68,0.95)"
                      : pri === "medium" ? "rgba(245,158,11,0.95)"
                      : "rgba(96,165,250,0.95)";
  
        slot.style.borderColor = accent.replace("0.95","0.35").replace("0.95","0.35");
        slot.style.background = "rgba(255,255,255,0.04)";
  
        slot.innerHTML = `
          <div style="display:flex; align-items:flex-start; gap:10px;">
            <div class="slot-pri" style="background:${accent}; box-shadow:0 0 0 3px rgba(255,255,255,0.06)"></div>
            <div style="min-width:0; flex:1;">
              <div class="slot-title">${escapeHtml(s.t.title)}</div>
              <div class="slot-time">
                <span>${escapeHtml(s.t.start)}—${escapeHtml(s.t.end)}</span>
                <span class="kbd">${escapeHtml(priorityLabel(pri))}</span>
              </div>
            </div>
          </div>
        `;
  
        slot.addEventListener("click", (e) => {
          e.stopPropagation();
          openTaskModalForEdit(s.t.id);
        });
  
        itemsWrap.appendChild(slot);
      }
  
      track.appendChild(itemsWrap);
      rightCol.appendChild(track);
  
      container.innerHTML = "";
      container.appendChild(timeline);
    }
  
    // ---------- Notes ----------
    function findNote(id){ return state.data.notes.find(n => n.id === id) || null; }
  
    function upsertNote(note){
      const idx = state.data.notes.findIndex(n => n.id === note.id);
      if (idx >= 0) state.data.notes[idx] = note;
      else state.data.notes.push(note);
      // Keep newest first
      state.data.notes.sort((a,b)=> (b.updatedAt||b.createdAt).localeCompare(a.updatedAt||a.createdAt));
      save();
    }
  
    function deleteNote(id){
      state.data.notes = state.data.notes.filter(n => n.id !== id);
      if (state.ui.selectedNoteId === id) state.ui.selectedNoteId = null;
      save();
    }
  
    function autoSaveNote(){
      const id = state.ui.selectedNoteId;
      if (!id) return;
      const note = findNote(id);
      if (!note) return;
      note.title = ($("#noteTitleInput").value || "").trim() || "Без заголовка";
      note.body = ($("#noteBodyInput").value || "");
      note.updatedAt = new Date().toISOString();
      upsertNote(note);
      $("#notesSaveStatus").textContent = "Сохранено • сейчас";
      clearTimeout(state.ui.noteSaveTimer);
      state.ui.noteSaveTimer = setTimeout(() => {
        $("#notesSaveStatus").textContent = "Сохранено";
      }, 900);
    }
  
    // ---------- Habits ----------
    function getHabitCountForDay(habitId, ymd){
      const hist = state.data.habitHistory?.[habitId];
      return hist?.[ymd] ?? 0;
    }
  
    function toggleHabitForToday(habit){
      const ymd = dateToYMD(now());
      if (!state.data.habitHistory) state.data.habitHistory = {};
      if (!state.data.habitHistory[habit.id]) state.data.habitHistory[habit.id] = {};
      const current = getHabitCountForDay(habit.id, ymd);
      const goal = habit.goal || 1;
      // If already met -> reset to 0 else set to goal
      const next = current >= goal ? 0 : goal;
      state.data.habitHistory[habit.id][ymd] = next;
      // clean zeros
      if (state.data.habitHistory[habit.id][ymd] === 0) delete state.data.habitHistory[habit.id][ymd];
      save();
      renderAll();
    }
  
    function bestStreakForHabit(habit){
      // last 60 days streak based on done>=goal per day
      const goal = habit.goal || 1;
      const end = ymdToDate(dateToYMD(now()));
      const start = addDays(end, -59);
      let best = 0;
      let cur = 0;
      for (let d = start; d <= end; d = addDays(d, 1)){
        const ymd = dateToYMD(d);
        const v = getHabitCountForDay(habit.id, ymd);
        if (v >= goal){
          cur++;
          best = Math.max(best, cur);
        } else {
          cur = 0;
        }
      }
      return best;
    }
  
    // ---------- Stats (real, computed) ----------
    function getTasksByDayRange(daysBack=7){
      const end = ymdToDate(dateToYMD(now()));
      const arr = [];
      for (let i=daysBack-1; i>=0; i--){
        const d = addDays(end, -i);
        arr.push(dateToYMD(d));
      }
      return arr;
    }
  
    function calcStats(){
      const days = getTasksByDayRange(7);
  
      let totalTasks = 0;
      let doneTasks = 0;
  
      const dayCompletion = days.map(ymd => {
        const tasks = state.data.tasks.filter(t => t.date === ymd);
        const total = tasks.length;
        const done = tasks.filter(t => t.status === "done").length;
        totalTasks += total;
        doneTasks += done;
        const pct = total === 0 ? 0 : (done/total);
        return { ymd, total, done, pct };
      });
  
      const completedTasks = doneTasks;
      const completionPct = totalTasks === 0 ? 0 : Math.round(doneTasks/totalTasks * 100);
  
      // habits in 7 days
      let habitsDone = 0;
      let habitsTotal = state.data.habits.length;
      const habitDays = days;
      for (const h of state.data.habits){
        for (const ymd of habitDays){
          const v = getHabitCountForDay(h.id, ymd);
          habitsDone += v > 0 ? 1 : 0; // count as day completed (binary) for more meaningful card
        }
      }
  
      // productivity line: number of done tasks per day
      const productivity = days.map(d => {
        const tasks = state.data.tasks.filter(t => t.date === d && t.status === "done").length;
        return tasks;
      });
  
      return { dayCompletion, totalTasks, doneTasks, completionPct, completedTasks, habitsDone, habitsTotal, productivity };
    }
  
    // ---------- Rendering ----------
    function escapeHtml(s){
      return String(s ?? "").replace(/[&<>"']/g, m => ({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
      }[m]));
    }
  
    function renderNavActive(){
      const route = state.ui.route;
      $$(".nav-item").forEach(a => a.classList.toggle("active", a.dataset.nav === route));
    }
  
    function renderCategories(){
      const cats = categoriesFromTasksAndData();
      const filterCat = $("#filterCategory");
      if (filterCat){
        const keep = new Set(cats);
        // clear then re-add
        const cur = filterCat.value;
        filterCat.innerHTML = `<option value="all">Все</option>` + cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
        if (keep.has(cur)) filterCat.value = cur;
      }
  
      const taskCat = $("#taskCategory");
      if (taskCat){
        taskCat.innerHTML = cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
        if (!taskCat.value) taskCat.value = cats[0] || "общие";
      }
  
      const quickCat = $("#quickCategory");
      if (quickCat){
        // Ensure option exists
        const base = cats.length ? cats : ["общие"];
        quickCat.innerHTML = base.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
        if (!quickCat.value) quickCat.value = base[0];
      }
    }
  
    function renderToday(){
      const ymd = getSelectedYMD();
      $("#todayDate").textContent = formatYMDRu(ymd);
      $("#todayDow").textContent = formatDowRu(ymd);
  
      const { done, total, pct } = computeDayProgress(ymd);
      $("#todayProgressValue").textContent = `${pct}%`;
      $("#todayProgressPill").textContent = `${done}/${total} задач`;
      // ring
      const ring = $(".ring-fg");
      const dash = 302;
      const offset = dash * (1 - pct/100);
      if (ring) ring.style.strokeDashoffset = offset;
  
      const counts = $("#todayCounts");
      counts.textContent = `${done} выполнено • ${Math.max(0,total-done)} осталось`;
  
      // greeting
      const h = now().getHours();
      const greeting = h < 6 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
      $("#todayGreeting").textContent = greeting;
  
      // Filter/search
      const cat = $("#filterCategory").value || "all";
      const pri = $("#filterPriority").value || "all";
      const q = ($("#taskSearch").value || "").trim().toLowerCase();
  
      const tasks = getTasksForDay(ymd).filter(t => {
        if (cat !== "all" && t.category !== cat) return false;
        if (pri !== "all" && t.priority !== pri) return false;
        if (q){
          const hay = `${t.title}\n${t.desc||""}\n${t.category||""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  
      const list = $("#todayTaskList");
      list.innerHTML = "";
  
      if (tasks.length === 0){
        $("#todayEmpty").hidden = false;
      } else {
        $("#todayEmpty").hidden = true;
      }
  
      for (const t of tasks){
        const item = document.createElement("div");
        item.className = "task-item" + (t.status === "done" ? " done" : "");
        item.setAttribute("role","listitem");
        item.innerHTML = `
          <div class="check" role="button" aria-label="Отметить выполненным">
            <div class="tick">✓</div>
          </div>
          <div class="task-main">
            <div class="task-title">${escapeHtml(t.title)}</div>
            <div class="task-sub">
              <span class="badge ${priorityBadgeClass(t.priority)}">${escapeHtml(priorityLabel(t.priority))}</span>
              <span class="badge">${escapeHtml(t.category || "—")}</span>
              ${t.start && t.end ? `<span class="badge">${escapeHtml(t.start)}—${escapeHtml(t.end)}</span>` : `<span class="badge">без времени</span>`}
            </div>
            ${t.desc ? `<div class="small-muted" style="margin-top:8px; font-size:12px; line-height:1.35;">${escapeHtml(t.desc)}</div>` : ``}
          </div>
          <div class="task-meta-right">
            <div class="kbd">${t.status === "done" ? "готово" : "в работе"}</div>
          </div>
        `;
  
        item.addEventListener("click", () => openTaskModalForEdit(t.id));
        const checkBtn = item.querySelector(".check");
        checkBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleTaskDone(t.id);
        });
  
        list.appendChild(item);
      }
  
      // Timeline
      const timeline = $("#timelineToday");
      renderTimeline(timeline, getTasksForDay(ymd), ymd);
  
      // Priorities block: top 4 by priority then not done
      const all = getTasksForDay(ymd);
      const priWeight = { high: 3, medium: 2, low: 1 };
      const priSorted = all.slice().sort((a,b)=>{
        const sa = (a.status==="done") ? 0 : 1;
        const sb = (b.status==="done") ? 0 : 1;
        if (sa !== sb) return sb - sa;
        return (priWeight[b.priority]||1)-(priWeight[a.priority]||1);
      });
  
      const top = priSorted.slice(0,4);
      const grid = $("#priorityGrid");
      grid.innerHTML = "";
  
      for (const t of top){
        const div = document.createElement("div");
        div.className = "priority-card";
        div.innerHTML = `
          <div class="priority-top">
            <div style="min-width:0;">
              <div class="priority-title">${escapeHtml(t.title)}</div>
              <div class="priority-meta">
                <span class="badge ${priorityBadgeClass(t.priority)}">${escapeHtml(priorityLabel(t.priority))}</span>
                <span class="badge">${escapeHtml(t.category || "—")}</span>
                ${t.start && t.end ? `<span class="badge">${escapeHtml(t.start)}—${escapeHtml(t.end)}</span>` : ``}
              </div>
            </div>
          </div>
          <div class="priority-actions">
            <button class="mini-btn ${t.status==="done" ? "done" : ""}" data-action="toggle">
              ${t.status==="done" ? "Отмечено" : "Отметить"}
            </button>
            <button class="mini-btn" data-action="edit">Открыть</button>
          </div>
        `;
        div.querySelector('[data-action="toggle"]').addEventListener("click", (e)=>{
          e.stopPropagation();
          toggleTaskDone(t.id);
        });
        div.querySelector('[data-action="edit"]').addEventListener("click", (e)=>{
          e.stopPropagation();
          openTaskModalForEdit(t.id);
        });
        grid.appendChild(div);
      }
    }
  
    function renderCalendar(){
      const selectedYMD = state.ui.calSelectedYMD || dateToYMD(now());
      const base = ymdToDate(selectedYMD);
      const weekStart = startOfWeek(base, true);
      const weekDays = Array.from({length:7}, (_,i)=> dateToYMD(addDays(weekStart,i)));
  
      $("#calWeekRange").textContent = `${formatYMDRu(weekDays[0])} — ${formatYMDRu(weekDays[6])}`;
      $("#calSelectedDate").textContent = formatYMDRu(selectedYMD);
      $("#calSelectedDow").textContent = formatDowRu(selectedYMD);
  
      const grid = $("#weekGrid");
      grid.innerHTML = "";
      for (const ymd of weekDays){
        const d = ymdToDate(ymd);
        const isSel = ymd === selectedYMD;
        const item = document.createElement("div");
        item.className = "note-item" + (isSel ? " active" : "");
        item.style.padding = "12px";
        item.innerHTML = `
          <div class="note-item-title" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <span>${d.toLocaleDateString("ru-RU",{day:"2-digit"})}</span>
            <span class="small-muted">${d.toLocaleDateString("ru-RU",{weekday:"short"})}</span>
          </div>
          <div class="note-item-sub" style="margin-top:8px;">
            ${getTasksForDay(ymd).filter(t=>t.status==="done").length}/${getTasksForDay(ymd).length} выполнено
          </div>
        `;
        item.addEventListener("click", ()=>{
          state.ui.calSelectedYMD = ymd;
          renderAll();
        });
        grid.appendChild(item);
      }
  
      // Timeline
      renderTimeline($("#timelineCalendar"), state.data.tasks, selectedYMD);
    }
  
    function ensureWeekGridStyles(){
      const grid = $("#weekGrid");
      if (!grid) return;
      grid.style.display = "grid";
      grid.style.gridTemplateColumns = "repeat(7, 1fr)";
      grid.style.gap = "10px";
      grid.style.padding = "12px 14px";
      grid.style.alignItems = "stretch";
    }
  
    function renderHabits(){
      const ymd = dateToYMD(now());
      $("#habitsTodayMeta").textContent = `Сегодня • ${formatDowRu(ymd)}`;
  
      const habits = (state.data.habits || []).slice();
      $("#habitsTotal").textContent = habits.length;
  
      let doneCountDaysBinary = 0;
      for (const h of habits){
        const v = getHabitCountForDay(h.id, ymd);
        if ((v || 0) >= (h.goal || 1)) doneCountDaysBinary++;
      }
      $("#habitsCountsToday").textContent = `${doneCountDaysBinary}/${habits.length} выполнено`;
  
      const list = $("#habitListToday");
      list.innerHTML = "";
  
      for (const h of habits){
        const goal = h.goal || 1;
        const v = getHabitCountForDay(h.id, ymd);
        const done = v >= goal;
  
        const el = document.createElement("div");
        el.className = "habit-item";
        el.innerHTML = `
          <div class="habit-left">
            <div class="habit-title">
              <span class="dotcolor" style="background:${escapeHtml(h.color)}"></span>
              <span>${escapeHtml(h.title)}</span>
            </div>
            <div class="habit-meta">
              <span class="badge">${escapeHtml(h.category || "без категории")}</span>
              <span class="badge">цель: ${escapeHtml(String(goal))}×</span>
            </div>
          </div>
          <div class="habit-right">
            <button class="habit-check ${done ? "done" : ""}" data-toggle="${escapeHtml(h.id)}" aria-label="Отметить">
              <span>✓</span>
            </button>
            <button class="ghost-btn" style="padding:10px 12px; border-radius:16px;" data-edit="${escapeHtml(h.id)}" type="button">Изменить</button>
          </div>
        `;
        el.querySelector("[data-toggle]").addEventListener("click", ()=>{
          toggleHabitForToday(h);
        });
        el.querySelector("[data-edit]").addEventListener("click", ()=>{
          openHabitModalForEdit(h.id);
        });
        list.appendChild(el);
      }
  
      // history last 14 days
      const days = 14;
      const end = ymdToDate(ymd);
      const dates = [];
      for (let i=days-1;i>=0;i--) dates.push(dateToYMD(addDays(end, -i)));
  
      // total done (binary by day)
      let totalDoneBinary = 0;
      for (const h of habits){
        for (const d of dates){
          const v = getHabitCountForDay(h.id, d);
          if ((v||0) >= (h.goal||1)) totalDoneBinary++;
        }
      }
      $("#habitsTotalDone").textContent = totalDoneBinary;
  
      const hist = $("#habitHistory");
      hist.innerHTML = "";
  
      for (const h of habits){
        const row = document.createElement("div");
        row.className = "history-row";
        row.innerHTML = `
          <div class="history-title">
            <span class="dotcolor" style="background:${escapeHtml(h.color)}"></span>
            <span>${escapeHtml(h.title)}</span>
          </div>
          <div class="chips"></div>
        `;
        const chips = row.querySelector(".chips");
        for (const d of dates){
          const v = getHabitCountForDay(h.id, d);
          const done = (v||0) >= (h.goal||1);
          const chip = document.createElement("div");
          chip.className = "chip" + (done ? " done" : "");
          chip.textContent = done ? "✓" : "";
          chips.appendChild(chip);
        }
        hist.appendChild(row);
      }
  
      // best streak bars
      const leaders = habits
        .map(h => ({ id:h.id, title:h.title, color:h.color, best: bestStreakForHabit(h) }))
        .sort((a,b)=>b.best-a.best)
        .slice(0,6);
  
      const bars = $("#habitStreakBars");
      bars.innerHTML = "";
      if (leaders.length === 0){
        bars.innerHTML = `<div class="small-muted" style="padding:14px;">Отметьте привычки — появится история и серии.</div>`;
      } else {
        const max = Math.max(1, ...leaders.map(x=>x.best));
        for (const l of leaders){
          const bar = document.createElement("div");
          bar.className = "bar";
          const pct = l.best / max;
          bar.innerHTML = `
            <div class="bar-rect" style="height:${Math.max(10, pct*100)}%; background: linear-gradient(180deg, ${l.color}, rgba(255,255,255,0.06)); border-color: ${l.color}66;"></div>
            <div class="bar-label">${escapeHtml(l.title)}</div>
          `;
          bars.appendChild(bar);
        }
      }
    }
  
    function renderNotes(){
      const q = ($("#notesSearch").value || "").trim().toLowerCase();
      const list = $("#notesList");
      list.innerHTML = "";
  
      const notes = (state.data.notes || []).slice()
        .sort((a,b)=> (b.updatedAt||b.createdAt).localeCompare(a.updatedAt||a.createdAt))
        .filter(n=>{
          if (!q) return true;
          const hay = `${n.title}\n${n.body}`.toLowerCase();
          return hay.includes(q);
        });
  
      $("#notesCount").textContent = `${notes.length} заметок`;
      $("#notesEmpty").hidden = notes.length !== 0;
  
      for (const n of notes){
        const el = document.createElement("div");
        el.className = "note-item" + (n.id === state.ui.selectedNoteId ? " active" : "");
        el.innerHTML = `
          <div class="note-item-title">${escapeHtml(n.title || "Без заголовка")}</div>
          <div class="note-item-sub">${escapeHtml((n.body||"").slice(0, 80) || "—")}</div>
        `;
        el.addEventListener("click", ()=>{
          state.ui.selectedNoteId = n.id;
          renderNotes();
          renderSelectedNote();
        });
        list.appendChild(el);
      }
  
      if (!state.ui.selectedNoteId && notes[0]) state.ui.selectedNoteId = notes[0].id;
      renderSelectedNote();
    }
  
    function renderSelectedNote(){
      const id = state.ui.selectedNoteId;
      const note = id ? findNote(id) : null;
  
      const titleH = $("#noteTitleHeading");
      const titleI = $("#noteTitleInput");
      const bodyI = $("#noteBodyInput");
      const delBtn = $("#btnDeleteNote");
  
      if (!note){
        titleH.textContent = "Выберите заметку";
        titleI.value = "";
        bodyI.value = "";
        titleI.disabled = true;
        bodyI.disabled = true;
        delBtn.disabled = true;
        $("#notesSaveStatus").textContent = "—";
        return;
      }
  
      delBtn.disabled = false;
      titleH.textContent = note.title || "Без заголовка";
      titleI.disabled = false;
      bodyI.disabled = false;
  
      titleI.value = note.title || "";
      bodyI.value = note.body || "";
      $("#notesSaveStatus").textContent = "Сохранено";
    }
  
    function renderStats(){
      const s = calcStats();
      $("#statsTaskCounts").textContent = `${s.doneTasks} из ${s.totalTasks} задач выполнено`;
  
      $("#statsCompletionPct").textContent = `${s.completionPct}%`;
      $("#statsCompletedTasks").textContent = `${s.completedTasks}`;
  
      $("#statsHabitsDone").textContent = `${s.habitsDone}`;
      $("#statsHabitsTotal").textContent = `${s.habitsTotal}`;
  
      // bars progress by day
      const bars = $("#statsWeekBars");
      bars.innerHTML = "";
  
      const maxPct = Math.max(0.1, ...s.dayCompletion.map(d=>d.pct));
      for (const d of s.dayCompletion){
        const bar = document.createElement("div");
        bar.className = "bar";
        const pct = d.pct;
        const h = Math.max(6, Math.round((pct / maxPct)*100));
        const label = ymdToDate(d.ymd).toLocaleDateString("ru-RU", { weekday:"short" });
        bar.innerHTML = `
          <div class="bar-rect" style="height:${h}%; background: linear-gradient(180deg, rgba(124,58,237,0.95), rgba(124,58,237,0.25));"></div>
          <div class="bar-label">${escapeHtml(label)}</div>
        `;
        bars.appendChild(bar);
      }
  
      // linechart productivity
      const chart = $("#statsProductivityChart");
      chart.innerHTML = `
        <div class="tooltip" id="chartTip"></div>
      `;
      const tip = $("#chartTip");
  
      const values = s.productivity;
      const maxV = Math.max(1, ...values);
      const w = chart.clientWidth;
      const h = 200;
  
      const padX = 22;
      const padY = 22;
      const innerW = w - padX*2;
      const innerH = h - padY*2;
  
      const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  
      // grid
      for (let i=0;i<4;i++){
        const y = padY + (innerH*(i/3));
        const line = document.createElementNS("http://www.w3.org/2000/svg","line");
        line.setAttribute("x1", padX);
        line.setAttribute("x2", w-padX);
        line.setAttribute("y1", y);
        line.setAttribute("y2", y);
        line.setAttribute("stroke", "rgba(255,255,255,0.08)");
        line.setAttribute("stroke-width", "1");
        svg.appendChild(line);
      }
  
      function xAt(i){
        return padX + innerW*(i/(values.length-1 || 1));
      }
      function yAt(v){
        return padY + innerH*(1 - v/maxV);
      }
  
      const points = values.map((v,i)=>({ x:xAt(i), y:yAt(v), v }));
      const poly = document.createElementNS("http://www.w3.org/2000/svg","polyline");
      poly.setAttribute("points", points.map(p=>`${p.x},${p.y}`).join(" "));
      poly.setAttribute("fill","none");
      poly.setAttribute("stroke","rgba(124,58,237,0.95)");
      poly.setAttribute("stroke-width","3");
      poly.setAttribute("stroke-linecap","round");
      poly.setAttribute("stroke-linejoin","round");
      svg.appendChild(poly);
  
      // area
      const area = document.createElementNS("http://www.w3.org/2000/svg","path");
      const d = `M ${points[0].x} ${h-padY} ` +
                points.map(p=>`L ${p.x} ${p.y}`).join(" ") +
                ` L ${points[points.length-1].x} ${h-padY} Z`;
      area.setAttribute("d", d);
      area.setAttribute("fill","rgba(124,58,237,0.18)");
      area.setAttribute("stroke","none");
      svg.insertBefore(area, poly);
  
      for (const p of points){
        const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
        c.setAttribute("cx", p.x);
        c.setAttribute("cy", p.y);
        c.setAttribute("r", "5");
        c.setAttribute("fill","rgba(124,58,237,0.95)");
        c.setAttribute("stroke","rgba(255,255,255,0.22)");
        c.setAttribute("stroke-width","2");
        c.style.cursor = "pointer";
  
        c.addEventListener("mousemove", (e)=>{
          const idx = points.findIndex(pp=>pp===p);
          const dayLabel = ymdToDate(getTasksByDayRange(7)[idx]).toLocaleDateString("ru-RU", { day:"2-digit", month:"numeric" });
          tip.textContent = `${dayLabel}: ${p.v} выполнено`;
          tip.style.left = `${(p.x/w)*100}%`;
          tip.style.top = `${(p.y/h)*100}%`;
          tip.style.opacity = "1";
        });
        c.addEventListener("mouseleave", ()=>{
          tip.style.opacity = "0";
        });
  
        svg.appendChild(c);
      }
  
      chart.appendChild(svg);
  
      // habit leaders by best streak
      const leaders = (state.data.habits || [])
        .map(hb => ({ id: hb.id, title: hb.title, color: hb.color, best: bestStreakForHabit(hb) }))
        .sort((a,b)=>b.best-a.best)
        .slice(0,6);
  
      const bars2 = $("#statsHabitLeaders");
      bars2.innerHTML = "";
      if (leaders.length === 0){
        bars2.innerHTML = `<div class="small-muted" style="padding:14px;">Создайте привычки и отмечайте их — появятся серии.</div>`;
      } else {
        const max = Math.max(1, ...leaders.map(x=>x.best));
        for (const l of leaders){
          const bar = document.createElement("div");
          bar.className = "bar";
          const pct = l.best / max;
          bar.innerHTML = `
            <div class="bar-rect" style="height:${Math.max(12, pct*100)}%; background: linear-gradient(180deg, ${l.color}, rgba(255,255,255,0.06)); border-color: ${l.color}66;"></div>
            <div class="bar-label">${escapeHtml(l.title)} · ${l.best}</div>
          `;
          bars2.appendChild(bar);
        }
      }
    }
  
    function renderAll(){
      renderNavActive();
      renderCategories();
  
      // Pages
      if (state.ui.route === "today") renderToday();
      if (state.ui.route === "calendar"){ ensureWeekGridStyles(); renderCalendar(); }
      if (state.ui.route === "habits") renderHabits();
      if (state.ui.route === "notes") { renderNotes(); }
      if (state.ui.route === "stats") renderStats();
    }
  
    // ---------- Task modal ----------
    const taskModal = $("#taskModal");
    const taskForm = $("#taskForm");
  
    function openTaskModalForEdit(taskId){
      const t = state.data.tasks.find(x => x.id === taskId);
      if (!t) return;
  
      $("#taskModalTitle").textContent = "Редактирование задачи";
      $("#taskModalSub").textContent = "Измените детали и сохраните";
  
      $("#taskId").value = t.id;
      $("#taskTitle").value = t.title || "";
      $("#taskDesc").value = t.desc || "";
      $("#taskDate").value = t.date || dateToYMD(now());
      $("#taskPriority").value = t.priority || "medium";
      $("#taskStatus").value = t.status || "todo";
      $("#taskCategory").value = t.category || (categoriesFromTasksAndData()[0] || "общие");
      $("#taskStart").value = t.start || "";
      $("#taskEnd").value = t.end || "";
  
      $("#taskDeleteBtn").style.display = "";
      $("#taskDeleteBtn").dataset.id = t.id;
  
      openModal(taskModal);
    }
  
    function openTaskModalForCreate(pref){
      $("#taskModalTitle").textContent = "Новая задача";
      $("#taskModalSub").textContent = "Создайте задачу и добавьте её в план";
  
      $("#taskId").value = "";
      $("#taskTitle").value = pref?.title || "";
      $("#taskDesc").value = pref?.desc || "";
      $("#taskDate").value = pref?.date || dateToYMD(now());
      $("#taskPriority").value = pref?.priority || "medium";
      $("#taskStatus").value = "todo";
      $("#taskCategory").value = pref?.category || (categoriesFromTasksAndData()[0] || "общие");
      $("#taskStart").value = pref?.start || "";
      $("#taskEnd").value = pref?.end || "";
  
      $("#taskDeleteBtn").style.display = "none";
  
      openModal(taskModal);
    }
  
    $("#taskModalClose").addEventListener("click", ()=> closeModal(taskModal));
    $("#modalBackdrop").addEventListener("click", ()=>{
      if (!taskModal.hidden) closeModal(taskModal);
      if (!$("#habitModal").hidden) closeModal($("#habitModal"));
      if (!$("#ioModal").hidden) closeModal($("#ioModal"));
    });
  
    taskForm.addEventListener("submit", (e)=>{
      e.preventDefault();
      const id = $("#taskId").value || uid();
      const task = {
        id,
        title: $("#taskTitle").value.trim(),
        desc: ($("#taskDesc").value || "").trim(),
        date: $("#taskDate").value,
        start: ($("#taskStart").value || "").trim(),
        end: ($("#taskEnd").value || "").trim(),
        priority: $("#taskPriority").value,
        category: $("#taskCategory").value,
        status: $("#taskStatus").value
      };
  
      // basic validation for time
      const st = task.start ? msFromTimeStringLocal(task.start) : null;
      const en = task.end ? msFromTimeStringLocal(task.end) : null;
      if ((task.start && !task.end) || (!task.start && task.end)){
        toast("Укажите и начало, и окончание времени (или оставьте оба пустыми).");
        return;
      }
      if (st != null && en != null && en <= st){
        toast("Время окончания должно быть позже времени начала.");
        return;
      }
  
      upsertTask(task);
  
      // keep categories list
      if (!state.data.categories) state.data.categories = [];
      if (task.category && !state.data.categories.includes(task.category)){
        state.data.categories.push(task.category);
        save();
      }
  
      closeModal(taskModal);
      renderAll();
      toast("Задача сохранена");
    });
  
    $("#taskDeleteBtn").addEventListener("click", ()=>{
      const id = $("#taskDeleteBtn").dataset.id;
      if (!id) return;
      if (!confirm("Удалить задачу?")) return;
      deleteTask(id);
      closeModal(taskModal);
      renderAll();
      toast("Задача удалена");
    });
  
    $("#btnMoveTaskNextDay").addEventListener("click", ()=>{
      const id = $("#taskId").value;
      if (!id) return;
      const t = state.data.tasks.find(x=>x.id===id);
      if (!t) return;
      const next = dateToYMD(addDays(ymdToDate(t.date), 1));
      t.date = next;
      // keep times
      upsertTask(t);
      toast("Задача перенесена на следующий день");
      closeModal(taskModal);
      renderAll();
    });
  
    // ---------- Quick add ----------
    $("#btnQuickAdd").addEventListener("click", ()=>{
      openTaskModalForCreate({ date: getSelectedYMD() });
    });
  
    $("#quickStart").value = "";
    $("#quickEnd").value = "";
    $("#quickAddForm").addEventListener("submit", (e)=>{
      e.preventDefault();
      const title = $("#quickTitle").value.trim();
      const category = $("#quickCategory").value;
      const priority = $("#quickPriority").value;
      const start = ($("#quickStart").value||"").trim();
      const end = ($("#quickEnd").value||"").trim();
      const date = getSelectedYMD();
  
      if (!title){
        toast("Введите название задачи");
        return;
      }
  
      if ((start && !end) || (!start && end)){
        toast("Укажите оба времени: начало и окончание (или оставьте оба пустыми).");
        return;
      }
      if (start && end){
        const st = msFromTimeStringLocal(start);
        const en = msFromTimeStringLocal(end);
        if (en <= st){
          toast("Окончание должно быть позже начала.");
          return;
        }
      }
  
      const task = {
        id: uid(),
        title,
        desc: "",
        date,
        start: start || "",
        end: end || "",
        priority,
        category: category || "общие",
        status: "todo"
      };
  
      upsertTask(task);
      if (task.category && !state.data.categories.includes(task.category)){
        state.data.categories.push(task.category);
        save();
      }
  
      $("#quickTitle").value = "";
      $("#quickStart").value = "";
      $("#quickEnd").value = "";
      toast("Задача добавлена");
      renderAll();
    });
  
    $("#btnAddPriorityTask").addEventListener("click", ()=>{
      openTaskModalForCreate({ date: getSelectedYMD(), priority: "high", category: $("#quickCategory").value || "общие" });
    });
  
    $("#btnJumpToNow").addEventListener("click", ()=>{
      // small UX: just re-render timeline (no scroll since static)
      renderToday();
      toast("Сейчас отмечено в расписании (обновление)");
    });
  
    // Filters events
    ["filterCategory","filterPriority"].forEach(id=>{
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", ()=> renderToday());
    });
    $("#taskSearch").addEventListener("input", ()=>{
      renderToday();
    });
    $("#btnClearDayFilters").addEventListener("click", ()=>{
      $("#filterCategory").value = "all";
      $("#filterPriority").value = "all";
      $("#taskSearch").value = "";
      renderToday();
    });
  
    // ---------- Calendar controls ----------
    $("#calTodayBtn").addEventListener("click", ()=>{
      state.ui.calSelectedYMD = dateToYMD(now());
      renderAll();
    });
    $("#calPrevWeekBtn").addEventListener("click", ()=>{
      const cur = state.ui.calSelectedYMD || dateToYMD(now());
      const d = ymdToDate(cur);
      const next = dateToYMD(addDays(d, -7));
      state.ui.calSelectedYMD = next;
      renderAll();
    });
    $("#calNextWeekBtn").addEventListener("click", ()=>{
      const cur = state.ui.calSelectedYMD || dateToYMD(now());
      const d = ymdToDate(cur);
      const next = dateToYMD(addDays(d, 7));
      state.ui.calSelectedYMD = next;
      renderAll();
    });
  
    // ---------- Habit modal ----------
    const habitModal = $("#habitModal");
    const habitForm = $("#habitForm");
  
    function openHabitModalForEdit(habitId){
      const h = state.data.habits.find(x=>x.id === habitId);
      if (!h) return;
  
      $("#habitModalTitle").textContent = "Редактирование привычки";
      $("#habitModalSub").textContent = "Обновите цель и оформление";
  
      $("#habitId").value = h.id;
      $("#habitTitle").value = h.title || "";
      $("#habitCategory").value = h.category || "";
      $("#habitGoal").value = String(h.goal || 1);
      $("#habitColor").value = h.color || "#7C3AED";
  
      $("#habitDeleteBtn").style.display = "";
      $("#habitDeleteBtn").dataset.id = h.id;
  
      openModal(habitModal);
    }
  
    function openHabitModalCreate(pref){
      $("#habitModalTitle").textContent = "Новая привычка";
      $("#habitModalSub").textContent = "Отметьте — и получите серию";
      $("#habitId").value = "";
      $("#habitTitle").value = pref?.title || "";
      $("#habitCategory").value = pref?.category || "";
      $("#habitGoal").value = String(pref?.goal || 1);
      $("#habitColor").value = pref?.color || "#7C3AED";
  
      $("#habitDeleteBtn").style.display = "none";
  
      openModal(habitModal);
    }
  
    $("#habitModalClose").addEventListener("click", ()=> closeModal(habitModal));
    $("#btnAddHabit").addEventListener("click", ()=> openHabitModalCreate({ title:"", goal:1, color:"#7C3AED" }));
  
    $("#habitDeleteBtn").addEventListener("click", ()=>{
      const id = $("#habitDeleteBtn").dataset.id;
      if (!id) return;
      if (!confirm("Удалить привычку и всю её историю?")) return;
  
      state.data.habits = state.data.habits.filter(h=>h.id!==id);
      delete state.data.habitHistory?.[id];
      save();
      closeModal(habitModal);
      renderAll();
      toast("Привычка удалена");
    });
  
    habitForm.addEventListener("submit", (e)=>{
      e.preventDefault();
      const id = $("#habitId").value || uid();
  
      const title = $("#habitTitle").value.trim();
      if (!title){
        toast("Введите название привычки");
        return;
      }
  
      const habit = {
        id,
        title,
        category: ($("#habitCategory").value||"").trim(),
        goal: Number($("#habitGoal").value || 1),
        color: $("#habitColor").value
      };
  
      const idx = state.data.habits.findIndex(h => h.id === id);
      if (idx >= 0) state.data.habits[idx] = habit;
      else state.data.habits.push(habit);
  
      // ensure category list
      if (habit.category && habit.category.length){
        if (!state.data.categories.includes(habit.category)) state.data.categories.push(habit.category);
      }
  
      if (!state.data.habitHistory) state.data.habitHistory = {};
      // keep history if editing, else create empty container
      if (!state.data.habitHistory[habit.id]) state.data.habitHistory[habit.id] = state.data.habitHistory[habit.id] || {};
  
      save();
      closeModal(habitModal);
      renderAll();
      toast("Привычка сохранена");
    });
  
    $("#btnManageHabitsReset").addEventListener("click", ()=>{
      if (!confirm("Удалить все привычки и их историю?")) return;
      state.data.habits = [];
      state.data.habitHistory = {};
      save();
      renderAll();
      toast("Привычки очищены");
    });
  
    // ---------- IO modal (export/import) ----------
    const ioModal = $("#ioModal");
    const ioText = $("#ioText");
  
    function openIOModal(mode, presetText=""){
      state.ui.ioMode = mode;
      $("#ioModalTitle").textContent = mode === "export" ? "Экспорт данных" : "Импорт данных";
      $("#ioModalMode").textContent = mode === "export" ? "Экспорт" : "Импорт";
      $("#ioModalSub").textContent = "Локальные данные • без сервера";
      $("#ioHelper").textContent = mode === "export"
        ? "Скопируйте JSON или загрузите файл в удобное место. Используйте для восстановления."
        : "Вставьте JSON бэкап и нажмите «Применить».";
      $("#ioApplyBtn").textContent = mode === "export" ? "Готово" : "Применить";
      ioText.value = presetText;
      openModal(ioModal);
    }
  
    $("#ioModalClose").addEventListener("click", ()=> closeModal(ioModal));
    $("#ioCopyBtn").addEventListener("click", async ()=>{
      try{
        await navigator.clipboard.writeText(ioText.value || "");
        toast("Скопировано в буфер обмена");
      } catch {
        toast("Не удалось скопировать. Скопируйте вручную.");
      }
    });
  
    $("#ioApplyBtn").addEventListener("click", ()=>{
      if (state.ui.ioMode === "export"){
        closeModal(ioModal);
        toast("Экспорт подготовлен");
        return;
      }
      // import
      let parsed;
      try{
        parsed = JSON.parse(ioText.value || "");
      } catch {
        toast("Некорректный JSON");
        return;
      }
      if (!parsed || typeof parsed !== "object"){
        toast("JSON не содержит данных");
        return;
      }
      // Merge strategy: replace current storage with imported structure (safer)
      const next = parsed;
  
      // ensure fields
      next.version = next.version || 1;
      next.tasks = Array.isArray(next.tasks) ? next.tasks : [];
      next.habits = Array.isArray(next.habits) ? next.habits : [];
      next.habitHistory = next.habitHistory && typeof next.habitHistory === "object" ? next.habitHistory : {};
      next.notes = Array.isArray(next.notes) ? next.notes : [];
      next.categories = Array.isArray(next.categories) ? next.categories : (state.data.categories || []);
  
      state.data = next;
      save();
      closeModal(ioModal);
      renderAll();
      toast("Импорт выполнен");
    });
  
    $("#btnExport").addEventListener("click", ()=>{
      openIOModal("export", JSON.stringify(state.data, null, 2));
    });
  
    $("#btnImport").addEventListener("click", ()=>{
      openIOModal("import", "");
    });
  
    // ---------- Notes actions ----------
    $("#btnNewNote").addEventListener("click", ()=>{
      const id = uid();
      const note = {
        id,
        title: "Новая заметка",
        body: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      state.data.notes.unshift(note);
      state.ui.selectedNoteId = id;
      save();
      renderAll();
      renderSelectedNote();
      toast("Заметка создана");
      setTimeout(()=> $("#noteTitleInput").focus(), 50);
    });
  
    $("#notesSearch").addEventListener("input", ()=> renderNotes());
  
    let noteAutosaveDebounce = null;
    $("#noteTitleInput").addEventListener("input", ()=>{
      clearTimeout(noteAutosaveDebounce);
      noteAutosaveDebounce = setTimeout(()=> autoSaveNote(), 450);
    });
    $("#noteBodyInput").addEventListener("input", ()=>{
      clearTimeout(noteAutosaveDebounce);
      noteAutosaveDebounce = setTimeout(()=> autoSaveNote(), 450);
    });
  
    $("#btnDeleteNote").addEventListener("click", ()=>{
      const id = state.ui.selectedNoteId;
      if (!id) return;
      if (!confirm("Удалить заметку?")) return;
      deleteNote(id);
      renderAll();
      toast("Заметка удалена");
    });
  
    $("#btnExportNotesOnly").addEventListener("click", ()=>{
      const notesOnly = { notes: state.data.notes || [], exportedAt: new Date().toISOString(), version: 1 };
      openIOModal("export", JSON.stringify(notesOnly, null, 2));
    });
  
    // ---------- Task modal quick open from top button handled above ----------
  
    // ---------- Danger reset ----------
    $("#btnDangerReset").addEventListener("click", ()=>{
      if (!confirm("Очистить все данные DAYFLOW? Это действие нельзя отменить.")) return;
      localStorage.removeItem(STORE_KEY);
      state.data = defaultData();
      state.ui.calSelectedYMD = dateToYMD(now());
      state.ui.selectedNoteId = null;
      closeModal(ioModal);
      renderAll();
      toast("Данные очищены. Пример расписания восстановлен (можете удалить).");
    });
  
    $("#btnRecalcStats").addEventListener("click", ()=> renderStats());
  
    // ---------- Route handling ----------
    function routeTo(page){
      state.ui.route = page;
      $$(".page").forEach(p => p.hidden = (p.dataset.page !== page));
      // Calendar: default selection
      if (page === "calendar" && !state.ui.calSelectedYMD) state.ui.calSelectedYMD = dateToYMD(now());
      if (page === "stats") renderStats();
      renderAll();
    }
  
    function initRoute(){
      const hash = location.hash.replace("#","");
      const page = ["today","calendar","habits","notes","stats"].includes(hash) ? hash : "today";
      state.ui.route = page;
      // set page hidden
      $$(".page").forEach(p => p.hidden = (p.dataset.page !== page));
      renderAll();
    }
  
    window.addEventListener("hashchange", ()=>{
      const hash = location.hash.replace("#","");
      const page = ["today","calendar","habits","notes","stats"].includes(hash) ? hash : "today";
      routeTo(page);
    });
  
    // ---------- Start ----------
    function init(){
      load();
  
      // If no selected note, pick first on render later
      state.ui.selectedNoteId = null;
      state.ui.calSelectedYMD = dateToYMD(now());
  
      // Init default inputs time: set to nearest hour for better UX
      const d = now();
      const nextHour = new Date(d);
      nextHour.setMinutes(0,0,0);
      const startTime = `${pad2(nextHour.getHours())}:${pad2(nextHour.getMinutes())}`;
      const endTimeDate = new Date(nextHour);
      endTimeDate.setHours(endTimeDate.getHours()+1);
      const endTime = `${pad2(endTimeDate.getHours())}:${pad2(endTimeDate.getMinutes())}`;
      $("#quickStart").value = startTime;
      $("#quickEnd").value = endTime;
  
      // Default filter selects
      $("#filterPriority").value = "all";
      $("#filterCategory").value = "all";
      $("#taskSearch").value = "";
  
      // quick add category/priority defaults will be filled in renderCategories()
      // Task delete button hidden for create
      $("#taskDeleteBtn").style.display = "none";
  
      // Ensure routes
      if (!location.hash) location.hash = "#today";
      initRoute();
  
      // Close IO modal on escape
      window.addEventListener("keydown", (e)=>{
        if (e.key === "Escape"){
          if (!taskModal.hidden) closeModal(taskModal);
          if (!habitModal.hidden) closeModal(habitModal);
          if (!ioModal.hidden) closeModal(ioModal);
          init();

          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('./sw.js').catch(()=>{});
            });
          }
          }
      });
  
      // Fix: week grid styles each render if in calendar
      window.addEventListener("resize", ()=>{
        if (state.ui.route === "calendar") renderCalendar();
        if (state.ui.route === "stats") renderStats();
      });
    }
  
    init();
  })();
  s