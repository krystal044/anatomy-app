(() => {
  const tg = window.Telegram && Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }
  const haptic = (t = "light") => { try { tg.HapticFeedback.impactOccurred(t); } catch (e) {} };

  const $ = (s) => document.querySelector(s);
  const view = $("#view"), title = $("#title"), search = $("#search"), sheet = $("#sheet");
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  let favs = new Set(store.get("favs", []));
  const saveFavs = () => store.set("favs", [...favs]);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let tab = "notes", openTopic = null, navSystem = null, navSection = null;
  let atlasMode = "body", atlasSel = null, quiz = null;

  // ---- Темы из учебника: data/anatomy/index.json + data/anatomy/<slug>.json (грузятся по требованию) ----
  const SEC_EMOJI = { "Общая остеология": "📘", "Позвоночный столб": "🦴", "Грудная клетка": "🫁", "Череп": "💀", "Верхняя конечность": "💪", "Нижняя конечность": "🦵" };
  let remote = [];
  const cache = {};
  const allTopics = () => TOPICS.concat(remote);
  const byId = (id) => allTopics().find((t) => t.id === id);
  const loadTopic = (t) => cache[t.id] ? Promise.resolve(cache[t.id]) : fetch(t.file).then((r) => r.json()).then((d) => (cache[t.id] = d));
  const sections = () => {
    const m = new Map();
    remote.forEach((t) => { if (!m.has(t.section)) m.set(t.section, []); m.get(t.section).push(t); });
    return [...m];
  };
  fetch("data/anatomy/index.json").then((r) => r.json()).then((a) => {
    remote = a.map((r) => ({ id: r.slug, emoji: r.emoji, title: r.title, system: r.system, section: r.section, file: r.file, remote: true }));
    render();
  }).catch(() => {});

  // ---- Telegram BackButton ----
  const canBack = () => !sheet.hidden || (tab === "notes" && (openTopic || navSection || navSystem));
  function setBack() {
    if (!tg) return;
    canBack() ? tg.BackButton.show() : tg.BackButton.hide();
  }
  function goBack() {
    if (!sheet.hidden) return closeSheet();
    if (openTopic) openTopic = null;
    else if (navSection) navSection = null;
    else if (navSystem) navSystem = null;
    render();
  }
  if (tg) tg.BackButton.onClick(goBack);

  // ---- Вкладки ----
  document.querySelectorAll("#tabs button").forEach((b) => b.onclick = () => {
    tab = b.dataset.tab; openTopic = null; search.value = ""; haptic();
    atlasSel = null;
    if (!sheet.hidden) closeSheet();
    render();
  });
  search.oninput = render;

  function toggleFav(key) { favs.has(key) ? favs.delete(key) : favs.add(key); saveFavs(); haptic("medium"); }

  // ---- Render ----
  function render() {
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    const q = search.value.trim().toLowerCase();
    $("#top").style.display = (tab === "quiz" || openTopic) ? "none" : "";
    ({ notes: renderNotes, atlas: renderAtlas, quiz: renderQuiz, fav: renderFav })[tab](q);
    setBack();
    window.scrollTo(0, 0);
  }

  // ---- Карточки списков ----
  function topicCard(t, sub = true) {
    return `<div class="card" data-topic="${t.id}"><div class="em">${t.emoji}</div>
      <div class="grow"><div class="t">${esc(t.title)}</div>${sub ? `<div class="s">${esc(t.section || t.system)}</div>` : ""}</div>
      <button class="star ${favs.has("t:" + t.id) ? "on" : ""}" data-fav="t:${t.id}">★</button></div>`;
  }
  const navCard = (attr, emoji, name, sub) => `<div class="card" ${attr}><div class="em">${emoji}</div>
      <div class="grow"><div class="t">${esc(name)}</div><div class="s">${esc(sub)}</div></div><span class="chev">›</span></div>`;
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return n + " " + (m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c); };
  const backBtn = (label) => `<button class="back" id="bk">‹ ${esc(label)}</button>`;

  function bindList() {
    view.querySelectorAll("[data-topic]").forEach((el) => el.onclick = () => {
      const t = byId(el.dataset.topic);
      if (t && t.remote) { navSystem = "osteo"; navSection = t.section; }
      openTopic = el.dataset.topic; render();
    });
    view.querySelectorAll("[data-fav]").forEach((el) => el.onclick = (e) => {
      e.stopPropagation(); toggleFav(el.dataset.fav); render();
    });
    view.querySelectorAll("[data-sys]").forEach((el) => el.onclick = () => { navSystem = el.dataset.sys; navSection = null; render(); });
    view.querySelectorAll("[data-sec]").forEach((el) => el.onclick = () => { navSection = sections()[+el.dataset.sec][0]; render(); });
    view.querySelectorAll("[data-atlas]").forEach((el) => el.onclick = () => showSheet(el.dataset.atlas));
    const bk = $("#bk"); if (bk) bk.onclick = goBack;
  }

  // ---- Конспекты: система → отдел → тема ----
  function renderNotes(q) {
    if (openTopic) return renderArticle(byId(openTopic));
    title.textContent = "Конспекты";
    if (q) {
      const list = allTopics().filter((t) => (t.title + (t.section || "") + t.system + (t.sections || []).map((s) => s.h + s.p).join(" ")).toLowerCase().includes(q));
      view.innerHTML = list.map((t) => topicCard(t)).join("") || `<div class="empty">Ничего не найдено</div>`;
      return bindList();
    }
    if (navSystem === "osteo" && navSection) {
      title.textContent = navSection;
      const items = (sections().find(([n]) => n === navSection) || [, []])[1];
      view.innerHTML = backBtn("Остеология") + items.map((t) => topicCard(t, false)).join("");
      return bindList();
    }
    if (navSystem === "osteo") {
      title.textContent = "Остеология";
      view.innerHTML = backBtn("Конспекты") + sections().map(([name, items], i) =>
        navCard(`data-sec="${i}"`, SEC_EMOJI[name] || "📁", name, plural(items.length, "тема", "темы", "тем"))).join("");
      return bindList();
    }
    // корень
    const groups = {};
    if (remote.length) groups["Опорно-двигательная"] = [navCard('data-sys="osteo"', "🦴", "Остеология", `${plural(sections().length, "отдел", "отдела", "отделов")} · ${plural(remote.length, "тема", "темы", "тем")}`)];
    TOPICS.forEach((t) => (groups[t.system] ||= []).push(topicCard(t, false)));
    view.innerHTML = Object.entries(groups).map(([g, cards]) => `<div class="group">${esc(g)}</div>${cards.join("")}`).join("");
    bindList();
  }

  function atlasBtn(t) {
    return `<button class="btn" id="toAtlas">🔎 Показать в атласе</button>`;
  }

  function renderRemote(t) {
    const draw = (d) => {
      const note = store.get("note:" + t.id, "");
      const li = (a) => `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
      view.innerHTML = `<div class="article">
        ${backBtn(t.section || "Назад")}
        <h2>${t.emoji} ${esc(d.title)}</h2><div class="s" style="color:var(--hint)">${esc(d.latin || "")}${d.latin ? " · " : ""}${esc(t.section || d.system)}</div>
        ${atlasBtn(t)}
        ${d.blocks.map((b) => `<h3>${esc(b.h)}</h3>${li(b.items)}`).join("")}
        <h3>🏷 Термины</h3><table class="terms">${d.terms.map((x) => `<tr><td>${esc(x.ru)}</td><td><i>${esc(x.lat)}</i></td></tr>`).join("")}</table>
        <div class="exam"><h3>⚠️ На зачёте / запомнить</h3>${li(d.exam)}</div>
        <h3>🃏 Карточки <span class="hint">(нажмите, чтобы открыть)</span></h3>
        ${d.cards.map((c) => `<div class="flash"><b>${esc(c.term)}</b><p hidden>${esc(c.def)}</p></div>`).join("")}
        <h3>🎯 Мини-тест</h3>
        ${d.quiz.map((q, qi) => `<div class="mq"><div class="q">${esc(q.q)}</div>${q.a.map((o, i) => `<button class="opt" data-q="${qi}" data-i="${i}">${esc(o)}</button>`).join("")}<p class="why" hidden></p></div>`).join("")}
        <h3>✍️ Мои заметки</h3>
        <textarea id="note" placeholder="Запишите своё…">${esc(note)}</textarea>
        <button class="btn ghost" id="fv">${favs.has("t:" + t.id) ? "★ В избранном" : "☆ В избранное"}</button>
        <p class="hint">Источник: ${esc(d.source.book)}${d.source.pages ? ", стр. " + esc(d.source.pages) : ""}</p></div>`;
      $("#bk").onclick = goBack;
      $("#toAtlas").onclick = () => goAtlas(t.id);
      $("#note").oninput = (e) => store.set("note:" + t.id, e.target.value);
      $("#fv").onclick = () => { toggleFav("t:" + t.id); render(); };
      view.querySelectorAll(".flash").forEach((f) => f.onclick = () => { const p = f.querySelector("p"); p.hidden = !p.hidden; });
      view.querySelectorAll(".mq").forEach((box, qi) => {
        const q = d.quiz[qi];
        box.querySelectorAll(".opt").forEach((b) => b.onclick = () => {
          if (box.dataset.done) return; box.dataset.done = 1;
          const ok = +b.dataset.i === q.c;
          b.classList.add(ok ? "ok" : "bad"); box.querySelectorAll(".opt")[q.c].classList.add("ok");
          const w = box.querySelector(".why"); w.textContent = q.why; w.hidden = false;
        });
      });
    };
    if (cache[t.id]) return draw(cache[t.id]);
    view.innerHTML = `<div class="empty">Загрузка…</div>`;
    loadTopic(t).then((d) => { if (openTopic === t.id) draw(d); })
      .catch(() => { view.innerHTML = `<div class="empty">Не удалось загрузить тему</div>`; });
  }

  function renderArticle(t) {
    if (t.remote) return renderRemote(t);
    const note = store.get("note:" + t.id, "");
    view.innerHTML = `<div class="article">
      ${backBtn("Назад")}
      <h2>${t.emoji} ${esc(t.title)}</h2><div class="s" style="color:var(--hint)">${esc(t.system)}</div>
      ${t.sections.map((s) => `<h3>${esc(s.h)}</h3><p>${esc(s.p)}</p>`).join("")}
      <h3>✍️ Мои заметки</h3>
      <textarea id="note" placeholder="Запишите своё: мнемоники, вопросы к экзамену…">${esc(note)}</textarea>
      <button class="btn ghost" id="fv">${favs.has("t:" + t.id) ? "★ В избранном" : "☆ В избранное"}</button></div>`;
    $("#bk").onclick = goBack;
    $("#note").oninput = (e) => store.set("note:" + t.id, e.target.value);
    $("#fv").onclick = () => { toggleFav("t:" + t.id); render(); };
  }

  // ======================= АТЛАС =======================
  // Какая проекция показывает кость и какие зоны подсвечивать
  const SKULL_VIEW = new Set(["skull", "frontal-bone", "parietal-bone", "temporal-bone", "sphenoid-bone", "zygomatic-bone", "nasal-bone", "maxilla",
    "mandible", "occipital-bone", "ethmoid-bone", "palatine-bone", "lacrimal-bone", "inferior-nasal-concha", "vomer", "hyoid-bone"]);
  const GROUP = {
    "vertebrae": ["cervical-vertebrae", "thoracic-vertebrae", "lumbar-vertebrae", "sacrum", "coccyx"],
    "upper-limb-skeleton": ["clavicle", "scapula", "humerus", "ulna", "radius", "hand-bones"],
    "lower-limb-skeleton": ["hip-bone", "femur", "patella", "tibia", "fibula", "foot-bones"],
    "foot-arches": ["foot-bones"], "obshchaya-osteologiya": []
  };
  const HIDDEN_IN_SKULL_FRONT = ["occipital-bone", "ethmoid-bone", "palatine-bone", "lacrimal-bone", "inferior-nasal-concha", "vomer", "hyoid-bone"];

  const e = (s) => s; // шаблонная строка: SVG пишется как есть
  // кость-фигура / кость-линия; внутри <g class="zone" data-h="slug">
  const BN = (d, x = "") => `<path class="bn" d="${d}" ${x}/>`;
  const EL = (cx, cy, rx, ry) => `<ellipse class="bn" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
  const LN = (x1, y1, x2, y2, w) => `<line class="ln-edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${w + 2.4}"/><line class="ln" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${w}"/>`;
  const PL = (d, w) => `<path class="ln-edge" d="${d}" stroke-width="${w + 2.4}"/><path class="ln" d="${d}" stroke-width="${w}"/>`;
  const HOLE = (inner) => inner;
  const Z = (slug, inner) => `<g class="zone" data-h="${slug}">${inner}</g>`;
  const mirror = (inner) => inner + `<g transform="translate(300 0) scale(-1 1)">${inner}</g>`;

  function bodySVG() {
    // позвонки: ряды скруглённых блоков
    const blocks = (n, y0, step, h, w0, w1) => Array.from({ length: n }, (_, i) => {
      const w = w0 + (w1 - w0) * (n === 1 ? 0 : i / (n - 1)); const y = y0 + i * step;
      return `<rect class="bn" x="${150 - w / 2}" y="${y}" width="${w}" height="${h}" rx="${h / 2.6}"/>`;
    }).join("");
    // рёбра (правая сторона; левая — зеркально)
    const ribs = Array.from({ length: 12 }, (_, i) => {
      const y0 = 138 + i * 7.6, W = i < 7 ? 22 + 5.2 * i : 58 - (i - 6) * 5.5;
      const end = i < 7 ? `Q${154 + W * 0.62} ${y0 + 38} ${i < 7 ? 156 : 0} ${y0 + 30 + i * 1.7}` : `L${154 + W * 0.55} ${y0 + 32}`;
      return PL(`M154 ${y0} Q${154 + W} ${y0 - 6} ${154 + W * 0.88} ${y0 + 16} ${end}`, 3);
    }).join("");
    const half = {
      scapula: Z("scapula", BN("M97 120 L78 127 C76 150 78 170 84 184 C90 192 98 186 100 176 L104 150 Z")),
      clavicle: Z("clavicle", PL("M147 128 C132 122 112 125 92 118", 4.6)),
      humerus: Z("humerus", LN(86, 130, 66, 248, 9) + EL(86, 130, 8, 8) + EL(65, 252, 8, 5)),
      radius: Z("radius", LN(58, 258, 40, 366, 5) + EL(58, 256, 5, 4) + EL(40, 369, 6, 4)),
      ulna: Z("ulna", LN(68, 256, 55, 366, 5.4) + EL(67, 254, 5.5, 5)),
      hand: Z("hand-bones",
        EL(47, 379, 11, 7) + LN(37, 382, 27, 408, 4) + LN(41, 385, 37, 421, 3.6) + LN(47, 386, 46, 428, 3.6) + LN(53, 385, 55, 423, 3.6) + LN(58, 383, 63, 415, 3.2)),
      hip: Z("hip-bone", BN("M148 268 C130 252 102 250 94 266 C88 281 94 304 106 322 C114 334 124 346 138 352 L148 355 Z") +
        `<ellipse class="hole" cx="126" cy="331" rx="6.5" ry="11"/><circle class="hole" cx="108" cy="318" r="6"/>`),
      femur: Z("femur", EL(112, 322, 8, 8) + LN(108, 331, 126, 478, 10) + LN(111, 328, 104, 340, 8) + EL(127, 484, 15, 8)),
      patella: Z("patella", EL(127, 497, 7.5, 8.5)),
      tibia: Z("tibia", EL(127, 506, 15, 5.5) + LN(128, 510, 124, 636, 8) + EL(122, 642, 5.4, 5.4)),
      fibula: Z("fibula", LN(112, 514, 110, 636, 5) + EL(112, 510, 4.8, 4.8) + EL(109, 642, 4.4, 4.4)),
      foot: Z("foot-bones", EL(118, 658, 14, 9) + [106, 112, 118, 124, 130].map((x, i) => LN(x, 666, x - 1 + (i - 2) * 0.6, 694, 4.2) + LN(x - 1, 696, x - 1 + (i - 2) * 0.6, 704, 3)).join(""))
    };
    const leftSide = half.scapula + half.humerus + half.radius + half.ulna + half.hand + half.hip + half.femur + half.tibia + half.fibula + half.foot;
    return `<svg class="body" viewBox="20 0 260 716" role="img" aria-label="Скелет">
      <g class="ribs-zone"><g class="zone" data-h="ribs">${mirror(ribs)}</g></g>
      ${mirror(leftSide)}
      ${mirror(half.patella)}
      ${Z("cervical-vertebrae", blocks(7, 90, 6.3, 4.8, 12, 15))}
      ${Z("thoracic-vertebrae", blocks(12, 134, 7.6, 5.9, 17, 22))}
      ${Z("lumbar-vertebrae", blocks(5, 226, 10.4, 8.8, 25, 28))}
      ${Z("sacrum", BN("M138 281 L162 281 L158 322 L150 337 L142 322 Z"))}
      ${Z("coccyx", BN("M147 338 L153 338 L151.4 351 L148.6 351 Z"))}
      ${mirror(half.clavicle)}
      ${Z("sternum", BN("M146 126 L154 126 L155.5 134 L154 174 L150 184 L146 174 L144.5 134 Z"))}
      ${Z("skull",
        EL(150, 37, 25, 29) + BN("M129 52 C129 76 139 88 150 88 C161 88 171 76 171 52 C165 60 157 63 150 63 C143 63 135 60 129 52 Z") + BN("M140 62 L160 62 L158 67 L142 67 Z") +
        `<ellipse class="hole" cx="141" cy="42" rx="5.2" ry="4.6"/><ellipse class="hole" cx="159" cy="42" rx="5.2" ry="4.6"/><path class="hole" d="M150 50 l-3.2 7 h6.4 z"/>`)}
    </svg>`;
  }

  function skullSVG() {
    const D = (x) => `<g class="zone" data-h="${x[0]}">${x[1]}</g>`;
    const sides = (inner) => inner + `<g transform="translate(300 0) scale(-1 1)">${inner}</g>`;
    return `<svg class="body" viewBox="40 0 220 310" role="img" aria-label="Череп, вид спереди">
      ${D(["parietal-bone", EL(150, 98, 86, 80)])}
      ${D(["frontal-bone", BN("M92 120 C90 60 114 30 150 30 C186 30 210 60 208 120 L194 130 C186 120 168 116 150 118 C132 116 114 120 106 130 Z")])}
      ${D(["sphenoid-bone", sides(EL(97, 134, 9.5, 13))])}
      ${D(["temporal-bone", sides(BN("M64 122 C52 146 56 176 72 192 L90 178 C82 162 84 140 92 126 Z"))])}
      ${D(["nasal-bone", BN("M143 130 L157 130 L161 172 L139 172 Z")])}
      <ellipse class="hole" cx="121" cy="148" rx="18" ry="15"/><ellipse class="hole" cx="179" cy="148" rx="18" ry="15"/>
      ${D(["zygomatic-bone", sides(BN("M82 168 C82 156 108 160 116 172 C118 186 108 192 96 190 C86 188 82 180 82 168 Z"))])}
      ${D(["maxilla", BN("M116 184 C116 170 132 168 140 176 L160 176 C168 168 184 170 184 184 C186 204 178 222 150 226 C122 222 114 204 116 184 Z") +
        `<path class="hole" d="M150 174 C140 178 138 194 150 200 C162 194 160 178 150 174 Z"/>` +
        Array.from({ length: 8 }, (_, i) => `<rect class="bn" x="${126 + i * 6.8}" y="212" width="5.4" height="9" rx="1.6"/>`).join("")])}
      ${D(["mandible", `<path class="bn" d="M98 190 C94 232 100 268 130 288 C140 295 160 295 170 288 C200 268 206 232 202 190 L190 198 C188 214 182 224 176 228 L124 228 C118 224 112 214 110 198 Z"/>` +
        Array.from({ length: 8 }, (_, i) => `<rect class="bn" x="${126 + i * 6.8}" y="230" width="5.4" height="9" rx="1.6"/>`).join("") +
        `<path class="bn" d="M138 268 C144 274 156 274 162 268 L160 262 C154 266 146 266 140 262 Z"/>`])}
    </svg>`;
  }

  function applySel() {
    const set = new Set(atlasSel ? (GROUP[atlasSel] || [atlasSel]) : []);
    view.querySelectorAll(".zone").forEach((z) => z.classList.toggle("sel", set.has(z.dataset.h)));
  }

  function renderAtlas(q) {
    title.textContent = "Атлас";
    const seg = `<div class="seg">${[["body", "Скелет"], ["skull", "Череп"], ["list", "Список"]].map(([m, n]) => `<button data-m="${m}" class="${atlasMode === m && !q ? "on" : ""}">${n}</button>`).join("")}</div>`;
    if (q || atlasMode === "list") {
      const items = remote.filter((t) => !q || (t.title + t.section).toLowerCase().includes(q));
      let html = "", last = "";
      items.forEach((t) => { if (t.section !== last) { html += `<div class="group">${esc(t.section)}</div>`; last = t.section; } html += atlasRow(t); });
      view.innerHTML = seg + (html || `<div class="empty">${remote.length ? "Ничего не найдено" : "Загрузка…"}</div>`);
      bindList();
    } else if (atlasMode === "skull") {
      view.innerHTML = seg + `<div class="atlas-box">${skullSVG()}</div><p class="hint">Череп, вид спереди. Нажмите на кость.</p>
        <div class="group">Не видны спереди</div><div class="chips">${HIDDEN_IN_SKULL_FRONT.map((s) => `<button class="chip" data-atlas="${s}">${esc(byId(s) ? byId(s).title : s)}</button>`).join("")}</div>`;
      bindList();
    } else {
      view.innerHTML = seg + `<div class="atlas-box">${bodySVG()}</div><p class="hint">Нажмите на кость, чтобы узнать о ней</p>`;
    }
    view.querySelectorAll("svg [data-h]").forEach((el) => el.onclick = () => showSheet(el.dataset.h));
    view.querySelectorAll(".seg button").forEach((b) => b.onclick = () => { atlasMode = b.dataset.m; search.value = ""; atlasSel = null; render(); });
    applySel();
  }
  const atlasRow = (t) => `<div class="card" data-atlas="${t.id}"><div class="em">${t.emoji}</div><div class="grow"><div class="t">${esc(t.title)}</div></div><span class="chev">›</span></div>`;

  // Показать кость из конспекта в атласе
  function goAtlas(slug) {
    tab = "atlas"; openTopic = null; search.value = "";
    atlasMode = SKULL_VIEW.has(slug) ? "skull" : "body";
    atlasSel = slug;
    render();
    showSheet(slug);
  }

  function showSheet(slug) {
    const t = byId(slug); if (!t) return;
    atlasSel = slug; applySel();
    sheet.hidden = false; setBack();
    const openBtns = (d) => {
      const bullets = d && d.blocks && d.blocks[0] ? d.blocks[0].items.slice(0, 3) : [];
      return `<div class="box"><h2 style="margin:0">${t.emoji} ${esc(t.title)}</h2>
        <div class="latin">${esc((d && d.latin) || "")}</div>
        ${bullets.length ? `<ul class="sh">${bullets.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="hint">Загрузка…</p>`}
        <button class="btn" id="sc1">📖 Открыть конспект</button>
        ${slug === "skull" && atlasMode !== "skull" ? `<button class="btn ghost" id="sc3">💀 Показать череп подробно</button>` : ""}
        <button class="btn ghost" id="sf">${favs.has("t:" + t.id) ? "★ В избранном" : "☆ В избранное"}</button>
        <button class="btn ghost" id="sc">Закрыть</button></div>`;
    };
    const draw = (d) => {
      sheet.innerHTML = openBtns(d);
      $("#sc").onclick = () => closeSheet();
      $("#sc1").onclick = () => { closeSheet(true); tab = "notes"; navSystem = "osteo"; navSection = t.section; openTopic = slug; search.value = ""; render(); };
      $("#sf").onclick = () => { toggleFav("t:" + t.id); draw(d); };
      const s3 = $("#sc3"); if (s3) s3.onclick = () => { closeSheet(true); atlasMode = "skull"; atlasSel = "skull"; render(); };
      sheet.onclick = (ev) => { if (ev.target === sheet) closeSheet(); };
    };
    draw(cache[slug] || null);
    if (!cache[slug]) loadTopic(t).then((d) => { if (!sheet.hidden && atlasSel === slug) draw(d); }).catch(() => {});
  }
  function closeSheet() {
    sheet.hidden = true;   // подсветка кости остаётся, пока не сменить вкладку или режим
    setBack();
  }

  // ---- Тест ----
  function renderQuiz() {
    if (!quiz) quiz = { order: [...QUIZ.keys()].sort(() => Math.random() - 0.5), i: 0, score: 0, done: false, picked: null };
    if (quiz.done) {
      view.innerHTML = `<div class="score">${quiz.score}/${QUIZ.length}</div>
        <p class="hint">${quiz.score >= QUIZ.length * 0.8 ? "Отлично! 🎉" : "Есть что повторить 📚"}</p>
        <button class="btn" id="again">Ещё раз</button>`;
      $("#again").onclick = () => { quiz = null; render(); };
      return;
    }
    const q = QUIZ[quiz.order[quiz.i]];
    view.innerHTML = `<div style="margin-top:16px" class="bar"><i style="width:${(quiz.i / QUIZ.length) * 100}%"></i></div>
      <div class="q">${esc(q.q)}</div>
      ${q.a.map((t, i) => `<button class="opt" data-i="${i}">${esc(t)}</button>`).join("")}`;
    view.querySelectorAll(".opt").forEach((b) => b.onclick = () => {
      if (quiz.picked !== null) return;
      const i = +b.dataset.i; quiz.picked = i;
      const ok = i === q.c; if (ok) quiz.score++;
      b.classList.add(ok ? "ok" : "bad");
      view.querySelectorAll(".opt")[q.c].classList.add("ok");
      try { tg.HapticFeedback.notificationOccurred(ok ? "success" : "error"); } catch (er) {}
      setTimeout(() => { quiz.picked = null; quiz.i++; if (quiz.i >= QUIZ.length) quiz.done = true; render(); }, 900);
    });
  }

  // ---- Избранное ----
  function renderFav() {
    title.textContent = "Избранное";
    const ts = allTopics().filter((t) => favs.has("t:" + t.id));
    view.innerHTML = ts.map((t) => topicCard(t)).join("") || `<div class="empty">Пока пусто.<br>Нажмите ★ у темы.</div>`;
    bindList();
  }

  render();
})();
