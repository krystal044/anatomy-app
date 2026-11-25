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
  let atlasMode = "body", atlasSel = null;

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
    $("#top").style.display = openTopic ? "none" : "";
    ({ notes: renderNotes, atlas: renderAtlas, fav: renderFav })[tab](q);
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
    // реальная иллюстрация скелета (assets/skeleton-front.svg) + прозрачные зоны нажатия поверх неё
    const area = (pts) => { const p = pts.split(" ").map((s) => s.split(",").map(Number)); let s = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; s += x1 * y2 - x2 * y1; } return Math.abs(s / 2); };
    const zones = (window.SKELETON_ZONES || []).slice().sort((u, v) => area(v[1]) - area(u[1]));   // мелкие зоны сверху
    return `<svg class="body photo" viewBox="30 12 380 828" role="img" aria-label="Скелет, вид спереди">
      <image href="assets/skeleton-front.svg" width="435.687" height="841.89"/>
      ${zones.map(([slug, pts]) => `<g class="zone" data-h="${slug}"><polygon class="zp" points="${pts}"/></g>`).join("")}
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

  // ---------- Подробные виды: кисть и стопа ----------
  const SUB = {};   // id мелкой кости -> описание (регистрируется при отрисовке)
  const subZone = (id, parent, ru, lat, where, inner) => { SUB[id] = { ru, lat, where, parent }; return `<g class="zone" data-h="${id}" data-g="${parent}">${inner}</g>`; };
  const along = (p, d, len) => [p[0] + d[0] * len, p[1] + d[1] * len];
  const unit = (d) => { const l = Math.hypot(d[0], d[1]); return [d[0] / l, d[1] / l]; };
  const ROM = ["I", "II", "III", "IV", "V"];
  const PH = [["проксимальная", "Phalanx proximalis"], ["средняя", "Phalanx media"], ["дистальная", "Phalanx distalis"]];

  // фаланги одного луча; возвращает SVG
  function digit(prefix, parent, nameOf, whereOf, start, d, lens, widths) {
    let p = along(start, d, 4), out = "";
    lens.forEach((len, k) => {
      const end = along(p, d, len);
      const ph = lens.length === 2 && k === 1 ? PH[2] : PH[k];
      out += subZone(`${prefix}${k}`, parent, `${ph[0][0].toUpperCase() + ph[0].slice(1)} фаланга ${nameOf}`, ph[1], whereOf,
        LN(p[0], p[1], end[0], end[1], widths[k]));
      p = along(end, d, 3.6);
    });
    return out;
  }

  function handSVG() {
    const finger = ["большой палец", "указательный палец", "средний палец", "безымянный палец", "мизинец"];
    const carpals = [
      ["scaphoideum", "Ладьевидная кость", "Os scaphoideum", "проксимальный ряд запястья", EL(166, 272, 13, 10)],
      ["lunatum", "Полулунная кость", "Os lunatum", "проксимальный ряд запястья", EL(139, 274, 12, 10)],
      ["triquetrum", "Трёхгранная кость", "Os triquetrum", "проксимальный ряд запястья", EL(113, 274, 11, 9.5)],
      ["pisiforme", "Гороховидная кость", "Os pisiforme", "проксимальный ряд запястья", EL(96, 262, 6.5, 6.5)],
      ["trapezium", "Кость-трапеция (большая многоугольная)", "Os trapezium", "дистальный ряд запястья", EL(180, 244, 12, 10)],
      ["trapezoideum", "Трапециевидная кость (малая многоугольная)", "Os trapezoideum", "дистальный ряд запястья", EL(158, 238, 10, 8.5)],
      ["capitatum", "Головчатая кость", "Os capitatum", "дистальный ряд запястья", EL(134, 240, 13, 11)],
      ["hamatum", "Крючковидная кость", "Os hamatum", "дистальный ряд запястья", EL(108, 244, 12, 10)]
    ];
    const rays = [
      { base: [184, 238], head: [212, 178], d: unit([0.3, -1]), lens: [30, 24], w: 9 },
      { base: [158, 230], head: [163, 148], d: unit([0.09, -1]), lens: [34, 20, 17], w: 8 },
      { base: [133, 228], head: [133, 142], d: unit([0, -1]), lens: [38, 23, 18], w: 8 },
      { base: [108, 232], head: [102, 148], d: unit([-0.09, -1]), lens: [35, 21, 17], w: 8 },
      { base: [88, 240], head: [74, 166], d: unit([-0.22, -1]), lens: [27, 15, 15], w: 7 }
    ];
    let s = Z("radius", LN(166, 338, 162, 304, 17)) + Z("ulna", LN(106, 338, 108, 308, 12));
    s += carpals.map(([id, ru, lat, where, shape]) => subZone("hand:" + id, "hand-bones", ru, lat, "Запястье · " + where, shape)).join("");
    rays.forEach((r, i) => {
      s += subZone(`hand:mc${i + 1}`, "hand-bones", `Пястная кость ${ROM[i]}`, `Os metacarpale ${ROM[i]}`, `Пясть · ${finger[i]}`,
        LN(r.base[0], r.base[1], r.head[0], r.head[1], r.w) + EL(r.head[0], r.head[1], r.w / 2 + 0.8, r.w / 2 + 0.8));
      s += digit(`hand:ph${i + 1}`, "hand-bones", `${ROM[i]} пальца`, `Фаланги · ${finger[i]}`, r.head, r.d, r.lens, [6.6, 5.8, 5.2]);
    });
    return `<svg class="body" style="max-width:300px" viewBox="40 40 200 312" role="img" aria-label="Кисть">${s}</svg>`;
  }

  function footSVG() {
    const tarsals = [
      ["calcaneus", "Пяточная кость", "Calcaneus", "проксимальный ряд предплюсны", EL(150, 300, 23, 40)],
      ["talus", "Таранная кость", "Talus", "проксимальный ряд предплюсны", EL(108, 258, 24, 18)],
      ["naviculare", "Ладьевидная кость", "Os naviculare", "предплюсна, между таранной и клиновидными", EL(98, 224, 26, 9)],
      ["cuboideum", "Кубовидная кость", "Os cuboideum", "предплюсна, латеральный край", EL(154, 224, 16, 14)],
      ["cuneiforme1", "Медиальная клиновидная кость", "Os cuneiforme mediale", "предплюсна, дистальный ряд", EL(72, 202, 11, 14)],
      ["cuneiforme2", "Промежуточная клиновидная кость", "Os cuneiforme intermedium", "предплюсна, дистальный ряд", EL(98, 200, 11, 10)],
      ["cuneiforme3", "Латеральная клиновидная кость", "Os cuneiforme laterale", "предплюсна, дистальный ряд", EL(124, 202, 12, 12)]
    ];
    const toes = ["большой палец", "II палец", "III палец", "IV палец", "мизинец"];
    const rays = [
      { base: [72, 190], head: [62, 104], d: unit([-0.05, -1]), lens: [30, 24], w: 12, pw: [10, 9] },
      { base: [98, 190], head: [92, 92], d: unit([-0.04, -1]), lens: [24, 14, 12], w: 8.6, pw: [6.4, 5.6, 5] },
      { base: [124, 192], head: [120, 96], d: unit([0, -1]), lens: [23, 13, 11], w: 8.2, pw: [6.4, 5.6, 5] },
      { base: [150, 206], head: [146, 106], d: unit([0.03, -1]), lens: [21, 12, 10], w: 7.8, pw: [6.2, 5.4, 4.8] },
      { base: [170, 222], head: [172, 126], d: unit([0.1, -1]), lens: [18, 10, 9], w: 7.8, pw: [6, 5.2, 4.6] }
    ];
    let s = tarsals.map(([id, ru, lat, where, shape]) => subZone("foot:" + id, "foot-bones", ru, lat, "Предплюсна · " + where, shape)).join("");
    rays.forEach((r, i) => {
      s += subZone(`foot:mt${i + 1}`, "foot-bones", `Плюсневая кость ${ROM[i]}`, `Os metatarsale ${ROM[i]}`, `Плюсна · ${toes[i]}`,
        LN(r.base[0], r.base[1], r.head[0], r.head[1], r.w) + EL(r.head[0], r.head[1], r.w / 2 + 0.8, r.w / 2 + 0.8));
      s += digit(`foot:ph${i + 1}`, "foot-bones", `${ROM[i]} пальца`, `Фаланги · ${toes[i]}`, r.head, r.d, r.lens, r.pw);
    });
    return `<svg class="body" style="max-width:250px" viewBox="40 30 160 330" role="img" aria-label="Стопа">${s}</svg>`;
  }

  const DETAIL = { "skull": ["skull", "💀 Показать череп подробно"], "hand-bones": ["hand", "✋ Показать кисть подробно"], "foot-bones": ["foot", "🦶 Показать стопу подробно"] };
  const viewOf = (slug) => SKULL_VIEW.has(slug) ? "skull" : slug === "hand-bones" ? "hand" : (slug === "foot-bones" || slug === "foot-arches") ? "foot" : "body";

  function applySel() {
    const set = new Set(atlasSel ? (SUB[atlasSel] ? [atlasSel] : (GROUP[atlasSel] || [atlasSel])) : []);
    view.querySelectorAll(".zone").forEach((z) => z.classList.toggle("sel", set.has(z.dataset.h) || set.has(z.dataset.g)));
  }

  function renderAtlas(q) {
    title.textContent = "Атлас";
    const seg = `<div class="seg">${[["body", "Скелет"], ["skull", "Череп"], ["hand", "Кисть"], ["foot", "Стопа"], ["list", "Список"]].map(([m, n]) => `<button data-m="${m}" class="${atlasMode === m && !q ? "on" : ""}">${n}</button>`).join("")}</div>`;
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
    } else if (atlasMode === "hand") {
      view.innerHTML = seg + `<div class="atlas-box">${handSVG()}</div><p class="hint">Правая кисть, ладонная поверхность. Нажмите на кость.</p>`;
    } else if (atlasMode === "foot") {
      view.innerHTML = seg + `<div class="atlas-box">${footSVG()}</div><p class="hint">Правая стопа, вид сверху. Нажмите на кость.</p>`;
    } else {
      view.innerHTML = seg + `<div class="atlas-box">${bodySVG()}</div><p class="hint">Нажмите на кость, чтобы узнать о ней<br>Иллюстрация: LadyofHats (Mariana Ruiz Villarreal), общественное достояние</p>`;
    }
    view.querySelectorAll("svg [data-h]").forEach((el) => el.onclick = () => showSheet(el.dataset.h));
    view.querySelectorAll(".seg button").forEach((b) => b.onclick = () => { atlasMode = b.dataset.m; search.value = ""; atlasSel = null; render(); });
    applySel();
  }
  const atlasRow = (t) => `<div class="card" data-atlas="${t.id}"><div class="em">${t.emoji}</div><div class="grow"><div class="t">${esc(t.title)}</div></div><span class="chev">›</span></div>`;

  // Показать кость из конспекта в атласе
  function goAtlas(slug) {
    tab = "atlas"; openTopic = null; search.value = "";
    atlasMode = viewOf(slug);
    atlasSel = slug;
    render();
    showSheet(slug);
  }

  function showSubSheet(id) {
    const s = SUB[id], parent = byId(s.parent); if (!parent) return;
    atlasSel = id; applySel();
    sheet.hidden = false; setBack();
    sheet.innerHTML = `<div class="box"><h2 style="margin:0">${esc(s.ru)}</h2><div class="latin">${esc(s.lat)}</div>
      <p style="margin:0 0 4px">${esc(s.where)}</p>
      <button class="btn" id="sc1">📖 Открыть конспект «${esc(parent.title)}»</button>
      <button class="btn ghost" id="sc">Закрыть</button></div>`;
    $("#sc").onclick = () => closeSheet();
    $("#sc1").onclick = () => { closeSheet(); tab = "notes"; navSystem = "osteo"; navSection = parent.section; openTopic = parent.id; search.value = ""; render(); };
    sheet.onclick = (ev) => { if (ev.target === sheet) closeSheet(); };
  }

  function showSheet(slug) {
    if (SUB[slug]) return showSubSheet(slug);
    const t = byId(slug); if (!t) return;
    atlasSel = slug; applySel();
    sheet.hidden = false; setBack();
    const openBtns = (d) => {
      const bullets = d && d.blocks && d.blocks[0] ? d.blocks[0].items.slice(0, 3) : [];
      return `<div class="box"><h2 style="margin:0">${t.emoji} ${esc(t.title)}</h2>
        <div class="latin">${esc((d && d.latin) || "")}</div>
        ${bullets.length ? `<ul class="sh">${bullets.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="hint">Загрузка…</p>`}
        <button class="btn" id="sc1">📖 Открыть конспект</button>
        ${DETAIL[slug] && atlasMode !== DETAIL[slug][0] ? `<button class="btn ghost" id="sc3">${DETAIL[slug][1]}</button>` : ""}
        <button class="btn ghost" id="sf">${favs.has("t:" + t.id) ? "★ В избранном" : "☆ В избранное"}</button>
        <button class="btn ghost" id="sc">Закрыть</button></div>`;
    };
    const draw = (d) => {
      sheet.innerHTML = openBtns(d);
      $("#sc").onclick = () => closeSheet();
      $("#sc1").onclick = () => { closeSheet(true); tab = "notes"; navSystem = "osteo"; navSection = t.section; openTopic = slug; search.value = ""; render(); };
      $("#sf").onclick = () => { toggleFav("t:" + t.id); draw(d); };
      const s3 = $("#sc3"); if (s3) s3.onclick = () => { closeSheet(); atlasMode = DETAIL[slug][0]; atlasSel = slug; render(); };
      sheet.onclick = (ev) => { if (ev.target === sheet) closeSheet(); };
    };
    draw(cache[slug] || null);
    if (!cache[slug]) loadTopic(t).then((d) => { if (!sheet.hidden && atlasSel === slug) draw(d); }).catch(() => {});
  }
  function closeSheet() {
    sheet.hidden = true;   // подсветка кости остаётся, пока не сменить вкладку или режим
    setBack();
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
