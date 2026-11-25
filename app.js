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

  let tab = "notes", openTopic = null, atlasMode = "body", quiz = null;

  // Темы из учебника: data/anatomy/index.json + data/anatomy/<slug>.json (грузятся по требованию)
  let remote = [];
  const allTopics = () => TOPICS.concat(remote);
  fetch("data/anatomy/index.json").then((r) => r.json()).then((a) => {
    remote = a.map((r) => ({ id: r.slug, emoji: r.emoji, title: r.title, system: r.system, file: r.file, remote: true }));
    render();
  }).catch(() => {});

  // ---- Telegram BackButton ----
  function setBack(on) {
    if (!tg) return;
    on ? tg.BackButton.show() : tg.BackButton.hide();
  }
  if (tg) tg.BackButton.onClick(() => { if (!sheet.hidden) closeSheet(); else { openTopic = null; render(); } });

  // ---- Tabs ----
  document.querySelectorAll("#tabs button").forEach((b) => b.onclick = () => {
    tab = b.dataset.tab; openTopic = null; search.value = ""; haptic(); render();
  });
  search.oninput = render;

  function toggleFav(key) { favs.has(key) ? favs.delete(key) : favs.add(key); saveFavs(); haptic("medium"); }

  // ---- Render ----
  function render() {
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    const q = search.value.trim().toLowerCase();
    $("#top").style.display = (tab === "quiz" || openTopic) ? "none" : "";
    setBack(!!openTopic);
    ({ notes: renderNotes, atlas: renderAtlas, quiz: renderQuiz, fav: renderFav })[tab](q);
    window.scrollTo(0, 0);
  }

  function topicCard(t) {
    return `<div class="card" data-topic="${t.id}"><div class="em">${t.emoji}</div>
      <div class="grow"><div class="t">${esc(t.title)}</div><div class="s">${esc(t.system)}</div></div>
      <button class="star ${favs.has("t:" + t.id) ? "on" : ""}" data-fav="t:${t.id}">★</button></div>`;
  }
  function atlasCard(a) {
    return `<div class="card" data-atlas="${a.id}"><div class="em">🔎</div>
      <div class="grow"><div class="t">${esc(a.name)}</div><div class="s">${esc(a.latin)}</div></div>
      <button class="star ${favs.has("a:" + a.id) ? "on" : ""}" data-fav="a:${a.id}">★</button></div>`;
  }
  function bindList() {
    view.querySelectorAll("[data-topic]").forEach((el) => el.onclick = () => { openTopic = el.dataset.topic; render(); });
    view.querySelectorAll("[data-atlas]").forEach((el) => el.onclick = () => showSheet(el.dataset.atlas));
    view.querySelectorAll("[data-fav]").forEach((el) => el.onclick = (e) => {
      e.stopPropagation(); toggleFav(el.dataset.fav); render();
    });
  }

  // ---- Конспекты ----
  function renderNotes(q) {
    if (openTopic) return renderArticle(allTopics().find((t) => t.id === openTopic));
    title.textContent = "Конспекты";
    const list = allTopics().filter((t) => !q || (t.title + t.system + (t.sections || []).map((s) => s.h + s.p).join(" ")).toLowerCase().includes(q));
    let html = "", last = "";
    list.forEach((t) => { if (t.system !== last) { html += `<div class="group">${esc(t.system)}</div>`; last = t.system; } html += topicCard(t); });
    view.innerHTML = html || `<div class="empty">Ничего не найдено</div>`;
    bindList();
  }

  function renderRemote(t) {
    const draw = (d) => {
      const note = store.get("note:" + t.id, "");
      const li = (a) => `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
      view.innerHTML = `<div class="article">
        <button class="back" id="bk">‹ Назад</button>
        <h2>${t.emoji} ${esc(d.title)}</h2><div class="s" style="color:var(--hint)">${esc(d.latin || "")} · ${esc(d.system)}</div>
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
      $("#bk").onclick = () => { openTopic = null; render(); };
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
    if (t.data) return draw(t.data);
    view.innerHTML = `<div class="empty">Загрузка…</div>`;
    fetch(t.file).then((r) => r.json()).then((d) => { t.data = d; if (openTopic === t.id) draw(d); })
      .catch(() => { view.innerHTML = `<div class="empty">Не удалось загрузить тему</div>`; });
  }

  function renderArticle(t) {
    if (t.remote) return renderRemote(t);
    const note = store.get("note:" + t.id, "");
    view.innerHTML = `<div class="article">
      <button class="back" id="bk">‹ Назад</button>
      <h2>${t.emoji} ${esc(t.title)}</h2><div class="s" style="color:var(--hint)">${esc(t.system)}</div>
      ${t.sections.map((s) => `<h3>${esc(s.h)}</h3><p>${esc(s.p)}</p>`).join("")}
      <h3>✍️ Мои заметки</h3>
      <textarea id="note" placeholder="Запишите своё: мнемоники, вопросы к экзамену…">${esc(note)}</textarea>
      <button class="btn ghost" id="fv">${favs.has("t:" + t.id) ? "★ В избранном" : "☆ В избранное"}</button></div>`;
    $("#bk").onclick = () => { openTopic = null; render(); };
    $("#note").oninput = (e) => store.set("note:" + t.id, e.target.value);
    $("#fv").onclick = () => { toggleFav("t:" + t.id); render(); };
  }

  // ---- Атлас ----
  const BODY = `<svg class="body" viewBox="0 0 200 420" role="img" aria-label="Скелет">
    <path class="hot" data-h="spine" d="M100 58 L100 205" stroke-width="12"/>
    <ellipse class="hot fill" data-h="skull" cx="100" cy="32" rx="20" ry="24" stroke-width="2"/>
    <g class="hot" data-h="ribs" stroke-width="4">
      ${[84, 96, 108, 120, 132, 144].map((y, i) => { const w = 36 - Math.abs(i - 2) * 3; return `<path d="M100 ${y} Q${100 - w - 6} ${y - 8} ${100 - w} ${y + 22}"/><path d="M100 ${y} Q${100 + w + 6} ${y - 8} ${100 + w} ${y + 22}"/>`; }).join("")}
    </g>
    <path class="hot" data-h="sternum" d="M100 78 L100 138" stroke-width="7"/>
    <g class="hot" data-h="clavicle" stroke-width="6"><path d="M100 72 L62 76"/><path d="M100 72 L138 76"/></g>
    <g class="hot" data-h="humerus" stroke-width="9"><path d="M60 80 L42 170"/><path d="M140 80 L158 170"/></g>
    <g class="hot" data-h="forearm" stroke-width="7"><path d="M40 176 L26 262"/><path d="M160 176 L174 262"/></g>
    <path class="hot fill" data-h="pelvis" d="M62 205 Q100 190 138 205 L132 240 Q100 252 68 240 Z"/>
    <g class="hot" data-h="femur" stroke-width="10"><path d="M80 246 L77 332"/><path d="M120 246 L123 332"/></g>
    <g class="hot" data-h="tibia" stroke-width="8"><path d="M77 340 L76 412"/><path d="M123 340 L124 412"/></g>
  </svg>`;

  function renderAtlas(q) {
    title.textContent = "Атлас";
    const list = ATLAS.filter((a) => !q || (a.name + a.latin + a.text).toLowerCase().includes(q));
    const seg = `<div class="seg"><button data-m="body" class="${atlasMode === "body" ? "on" : ""}">Схема</button><button data-m="list" class="${atlasMode === "list" ? "on" : ""}">Список</button></div>`;
    if (atlasMode === "body" && !q) {
      view.innerHTML = seg + BODY + `<p class="hint">Нажмите на кость, чтобы узнать о ней</p>`;
      view.querySelectorAll("[data-h]").forEach((el) => el.onclick = () => {
        const a = ATLAS.find((x) => x.hot === el.dataset.h); if (a) showSheet(a.id);
      });
    } else {
      view.innerHTML = seg + (list.map(atlasCard).join("") || `<div class="empty">Ничего не найдено</div>`);
      bindList();
    }
    view.querySelectorAll(".seg button").forEach((b) => b.onclick = () => { atlasMode = b.dataset.m; render(); });
  }

  function showSheet(id) {
    const a = ATLAS.find((x) => x.id === id);
    document.querySelectorAll("svg .hot").forEach((e) => e.classList.toggle("sel", e.dataset.h === a.hot));
    sheet.hidden = false; setBack(true);
    sheet.innerHTML = `<div class="box"><h2 style="margin:0">${esc(a.name)}</h2><div class="latin">${esc(a.latin)}</div>
      <p style="margin:0">${esc(a.text)}</p>
      <button class="btn" id="sf">${favs.has("a:" + a.id) ? "★ В избранном" : "☆ В избранное"}</button>
      <button class="btn ghost" id="sc">Закрыть</button></div>`;
    $("#sf").onclick = () => { toggleFav("a:" + a.id); showSheet(id); };
    $("#sc").onclick = closeSheet;
    sheet.onclick = (e) => { if (e.target === sheet) closeSheet(); };
  }
  function closeSheet() {
    sheet.hidden = true; document.querySelectorAll("svg .hot.sel").forEach((e) => e.classList.remove("sel"));
    setBack(!!openTopic);
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
      try { tg.HapticFeedback.notificationOccurred(ok ? "success" : "error"); } catch (e) {}
      setTimeout(() => { quiz.picked = null; quiz.i++; if (quiz.i >= QUIZ.length) quiz.done = true; render(); }, 900);
    });
  }

  // ---- Избранное ----
  function renderFav() {
    title.textContent = "Избранное";
    const ts = allTopics().filter((t) => favs.has("t:" + t.id)), as = ATLAS.filter((a) => favs.has("a:" + a.id));
    view.innerHTML = (ts.length ? `<div class="group">Конспекты</div>` + ts.map(topicCard).join("") : "") +
      (as.length ? `<div class="group">Атлас</div>` + as.map(atlasCard).join("") : "") ||
      `<div class="empty">Пока пусто.<br>Нажмите ★ у темы или структуры.</div>`;
    bindList();
    if (openTopic) renderArticle(allTopics().find((t) => t.id === openTopic));
  }

  render();
})();
