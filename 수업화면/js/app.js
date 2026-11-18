(function () {
  const STUDENTS = [
    "김민준", "이서연", "박도윤", "최하은", "정시우", "한지호",
    "윤서아", "강예준", "조하린", "신유나", "장민서", "임지안",
    "오지훈", "배수아", "송하준", "권서윤", "황도현", "안채원",
    "문지후", "백소율", "남하람", "홍은우", "양서진", "고민재"
  ];
  const LOBBY_CONNECTED = ["1번 박도윤"];
  const LOBBY_WAITING = ["2번 이서연", "3번 김민준"];

  const TOC = [
    { page: 1, title: "이번 시간에 공부할 내용" },
    { page: 2, title: "알맞은 말을 고르세요" },
    { page: 3, title: "각 부분의 이름을 놓으세요" },
    { page: 4, title: "평행한 면을 고르세요" },
    { page: 5, title: "전개도를 그려 보세요" },
    { page: 6, title: "옳게 말한 사람을 고르세요" },
    { page: 7, title: "잘못 그린 부분을 찾아보세요" },
    { page: 8, title: "해당하는 표정에 색칠하세요" }
  ];
  const PAGE_COUNT = TOC.length;
  const IDLE_RESET_MS = 2 * 60 * 1000;
  const LEVEL_META = {
    green: { label: "성취 상" },
    yellow: { label: "성취 중" },
    red: { label: "성취 하" }
  };
  (function assignLevels() {
    const colors = ["green", "yellow", "red", "green", "yellow", "red", "green", "yellow"];
    for (let i = colors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colors[i], colors[j]] = [colors[j], colors[i]];
    }
    TOC.forEach((item, i) => { item.level = colors[i]; });
  })();

  const state = {
    page: 1,
    zoom: 100,
    classSeconds: 11,
    locked: false,
    sharing: false,
    annotating: false,
    drawTool: "polygon",
    timerTotal: 300,
    timerLeft: 300,
    timerRunning: false,
    pickedOut: new Set()
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const toastEl = $("#toast");
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  const resultPop = $("#resultPop");
  const resultPopMsg = $("#resultPopMsg");
  let resultTimer;
  function showResult(msg) {
    if (!resultPop) return;
    if (resultPopMsg) resultPopMsg.textContent = msg;
    resultPop.classList.add("show");
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => resultPop.classList.remove("show"), 1800);
  }

  const backdrop = $("#backdrop");
  const panels = {
    toc: $("#panelToc"),
    ai: $("#panelAi"),
    monitor: $("#panelMonitor"),
    toolkit: $("#panelToolkit"),
    scoreboard: $("#panelScoreboard"),
    seats: $("#panelSeats"),
    sfx: $("#panelSfx"),
    boardwrite: $("#panelBoardwrite"),
    game: $("#panelGame"),
    report: $("#panelReport"),
    end: $("#panelEnd"),
    logout: $("#panelLogout"),
    back: $("#panelBack"),
    supplies: $("#panelSupplies")
  };

  function closeStudentZoom() {
    $("#studentZoom")?.classList.remove("show");
  }

  function closeToolFrame() {
    const frame = $("#toolFrame");
    if (!frame?.classList.contains("show")) return;
    frame.classList.remove("show");
    const iframe = $("#toolFrameIframe");
    if (iframe) iframe.src = "about:blank";
  }
  function openToolFrame(title, url) {
    $("#toolFrameTitle").textContent = title;
    const iframe = $("#toolFrameIframe");
    iframe.title = title;
    iframe.src = url;
    $("#toolFrame").classList.add("show");
  }

  function closeAll() {
    closeStudentZoom();
    closeToolFrame();
    Object.values(panels).forEach((el) => el.classList.remove("show"));
    backdrop.classList.remove("show");
    document.body.classList.remove("ai-open");
    closeGameMenu();
    $$(".foot-btn").forEach((b) => b.classList.remove("on"));
    document.querySelector('[data-feature="monitor"]')?.classList.remove("active");
    const svgEl = document.getElementById("shapeSvg");
    if (svgEl) svgEl.style.pointerEvents = "none";
    document.getElementById("drawCanvas")?.classList.remove("drawing");
  }

  function setGameSwitch(on, silent) {
    const sw = $("#gameSwitch");
    if (!sw) return;
    sw.classList.toggle("on", on);
    $("#gameToggleWrap")?.classList.toggle("is-on", on);
    sw.setAttribute("aria-pressed", String(on));
    sw.setAttribute("aria-label", on ? "수학 게임 활성" : "수학 게임 비활성");
    if (!silent) {
      toast(on ? "학생에게 수학 게임이 활성화되었습니다." : "수학 게임을 비활성화했습니다.");
    }
  }

  function openPanel(key) {
    closeAll();
    const el = panels[key];
    if (!el) return;
    el.classList.add("show");
    if (key !== "toc" && key !== "monitor") backdrop.classList.add("show");
    if (key === "monitor") document.querySelector('[data-feature="monitor"]')?.classList.add("active");
    if (key === "game") setGameSwitch(false, true);
    const kitKeys = ["scoreboard", "seats", "sfx", "boardwrite", "toolkit"];
    const btn = document.querySelector(`.foot-btn[data-feature="${kitKeys.includes(key) ? "toolkit" : key}"]`);
    if (btn) btn.classList.add("on");
    if (key === "toolkit") {
      requestAnimationFrame(() => requestAnimationFrame(placeToolkitTip));
    }
    if (key === "ai") {
      requestAnimationFrame(() => requestAnimationFrame(placeAiMathTip));
    }
    if (key === "report") resetReportForm();
  }

  function placeToolkitTip() {
    const modal = panels.toolkit;
    const tip = $("#toolkitTip");
    if (!modal?.classList.contains("show") || !tip) return;
    const badge = modal.querySelector(".toolkit-tile.new.seats .new-badge")
      || modal.querySelector(".toolkit-tile.new .new-badge");
    if (!badge) return;
    const modalBox = modal.getBoundingClientRect();
    const badgeBox = badge.getBoundingClientRect();
    tip.style.left = `${Math.round(modalBox.right + 16)}px`;
    const tipH = tip.offsetHeight || 96;
    let top = Math.round(badgeBox.top + badgeBox.height / 2 - 28);
    top = Math.max(12, Math.min(top, window.innerHeight - tipH - 12));
    tip.style.top = `${top}px`;
    tip.style.transform = "none";
  }
  function placeAiMathTip() {
    const modal = panels.ai;
    const tip = $("#aiMathTip");
    const row = modal?.querySelector('[data-math-tool="매쓰 보드"]');
    if (!modal?.classList.contains("show") || !tip || !row) return;
    const modalBox = modal.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    tip.style.left = `${Math.round(modalBox.right + 14)}px`;
    const tipH = tip.offsetHeight || 96;
    let top = Math.round(rowBox.top + rowBox.height / 2 - 28);
    top = Math.max(12, Math.min(top, window.innerHeight - tipH - 12));
    tip.style.top = `${top}px`;
    tip.style.transform = "none";
  }
  window.addEventListener("resize", () => {
    placeToolkitTip();
    placeAiMathTip();
    placeMenuTip();
  });

  const KIT_SUB = ["scoreboard", "seats", "sfx", "boardwrite"];
  function kitSubOpen() {
    return KIT_SUB.find((k) => panels[k]?.classList.contains("show"));
  }
  function backToToolkit() {
    openPanel("toolkit");
  }

  backdrop.addEventListener("click", () => {
    if (kitSubOpen()) backToToolkit();
    else closeAll();
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-kit-back]")) {
      backToToolkit();
      return;
    }
    if (e.target.closest("[data-close]")) closeAll();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if ($("#toolFrame")?.classList.contains("show")) {
      closeToolFrame();
      return;
    }
    if ($("#studentZoom")?.classList.contains("show")) {
      closeStudentZoom();
      return;
    }
    if (kitSubOpen()) {
      backToToolkit();
      return;
    }
    closeAll();
  });

  /* Class timer */
  function fmt(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }
  setInterval(() => {
    state.classSeconds += 1;
    $("#classTimer").textContent = fmt(state.classSeconds);
    const rep = $("#repTime");
    if (rep) rep.textContent = fmt(state.classSeconds);
  }, 1000);

  /* Pages */
  function renderPage() {
    $$(".page").forEach((p) => p.classList.toggle("active", Number(p.dataset.page) === state.page));
    $("#pageNow").textContent = state.page;
    $("#prevPage").disabled = state.page <= 1;
    $("#nextPage").disabled = state.page >= PAGE_COUNT;
    renderToc();
  }
  function goToPage(n) {
    const next = Math.max(1, Math.min(PAGE_COUNT, Number(n)));
    if (next === state.page) return;
    const from = state.page;
    state.page = next;
    try { resetSlide(from); } catch (err) { console.warn(err); }
    renderPage();
  }
  $("#prevPage").addEventListener("click", () => {
    if (state.page > 1) goToPage(state.page - 1);
  });
  $("#nextPage").addEventListener("click", () => {
    if (state.page < PAGE_COUNT) goToPage(state.page + 1);
  });
  document.getElementById("slide2Next")?.addEventListener("click", () => {
    goToPage(3);
  });
  document.getElementById("composeReset")?.addEventListener("click", () => {
    const ta = document.getElementById("composeText");
    if (ta) ta.value = "";
    toast("입력을 지웠습니다.");
  });
  document.getElementById("composeSend")?.addEventListener("click", () => {
    toast("친구들에게 설명을 보냈습니다.");
  });

  function slideSrc(page) {
    const img = document.querySelector(`.page[data-page="${page}"] .slide-fit > img:not(.q3-bg-alt)`);
    return (img && img.getAttribute("src")) || `slides/slide${page}.png`;
  }
  function tocThumb(page) {
    return `<div class="toc-thumb"><img src="${slideSrc(page)}" alt="${page}쪽"></div>`;
  }

  function tocCard(page) {
    const item = TOC.find((t) => t.page === page);
    const showLevel = page !== 1 && page !== PAGE_COUNT;
    const tag = showLevel && item.level
      ? `<span class="toc-level ${item.level}" title="${LEVEL_META[item.level].label}"></span>`
      : "";
    return `<div class="toc-row">
      ${tag}
      <button class="toc-card ${page === state.page ? "current" : ""}" data-go="${page}">
        ${tocThumb(page)}
        <span class="toc-caption">${item.title}</span>
      </button>
    </div>`;
  }

  function renderToc() {
    const sections = [
      { name: "들어가기", pages: [1] },
      { name: "학습하기", pages: [2, 3, 4, 5, 6] },
      { name: "정리하기", pages: [7, 8] }
    ];
    $("#tocList").innerHTML = sections.map((sec) => `
      <section class="toc-section">
        <div class="toc-section-title"><i></i>${sec.name}</div>
        ${sec.pages.map(tocCard).join("")}
      </section>
    `).join("");
  }
  $("#tocList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-go]");
    if (!btn) return;
    goToPage(Number(btn.dataset.go));
  });

  /* Zoom */
  function applyZoom() {
    $("#zoomValue").textContent = `${state.zoom} %`;
    const stage = $("#slideZoom");
    if (stage) stage.style.transform = `scale(${state.zoom / 100})`;
  }
  $("#zoomIn").addEventListener("click", () => {
    state.zoom = Math.min(150, state.zoom + 10);
    applyZoom();
  });
  $("#zoomOut").addEventListener("click", () => {
    state.zoom = Math.max(70, state.zoom - 10);
    applyZoom();
  });

  /* Feature buttons */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-feature]");
    if (!btn) return;
    const f = btn.dataset.feature;
    if (f === "lock") toggleLock();
    else if (f === "share") toggleShare();
    else if (f === "annotate") toggleAnno();
    else if (f === "monitor") {
      if (panels.monitor.classList.contains("show")) closeAll();
      else { renderStudents(); openPanel("monitor"); }
    }
    else if (f === "toolkit") openPanel("toolkit");
    else if (f === "game") openPanel("game");
    else if (f === "ai") openPanel("ai");
    else if (f === "toc") {
      if (panels.toc.classList.contains("show")) closeAll();
      else openPanel("toc");
    }
    else if (f === "report") openPanel("report");
    else if (f === "end") openPanel("end");
    else if (f === "logout") openPanel("logout");
    else if (f === "back") openPanel("back");
  });

  function toggleLock() {
    state.locked = !state.locked;
    $("#btnLock").classList.toggle("active", state.locked);
    toast(state.locked
      ? "학생이 화면을 넘길 수 없도록 잠금 처리되었습니다."
      : "화면 잠금이 해제되었습니다.");
  }
  function toggleShare() {
    state.sharing = !state.sharing;
    $("#btnShare").classList.toggle("active", state.sharing);
    $("#btnShare")?.setAttribute("aria-pressed", String(state.sharing));
    $("#shareBanner").classList.toggle("on", state.sharing);
    const pop = $("#sharePop");
    if (pop) {
      pop.classList.toggle("on", state.sharing);
      pop.hidden = !state.sharing;
    }
  }
  function toggleAnno() {
    state.annotating = !state.annotating;
    $("#btnAnno").classList.toggle("active", state.annotating);
    $("#annoCanvas").classList.toggle("drawing", state.annotating);
    $("#annoDock")?.classList.toggle("show", state.annotating);
    $("#annoBar").classList.toggle("show", state.annotating);
    document.body.classList.toggle("is-annotating", state.annotating);
    if (state.annotating) {
      setAnnoTool("pen");
      requestAnimationFrame(() => {
        resizeAnno();
        annoApply();
      });
    } else {
      hideAnnoColors();
      clearAnnoDrawings();
    }
  }

  /* Students */
  const MONITOR_STUDENTS = [
    { name: "김민준", wait: false, help: false, slide: 5 },
    { name: "이서연", wait: false, help: false, slide: 3 },
    { name: "최하은", wait: false, help: true, slide: 7, handNote: "가려진 모서리는 점선으로 그려야 해요." },
    { name: "박도윤", wait: true, help: false },
    { name: "정시우", wait: true, help: false }
  ];
  const WAIT_MARK = `<div class="wait-mark">
    <svg viewBox="0 0 24 24" fill="none"><path d="M6 4h12M6 20h12M8 4l3.5 7.5L8 20M16 4l-3.5 7.5L16 20" stroke="#b0b0b0" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span>수업 입장 전</span>
  </div>`;
  const SPK = `<span class="spk" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 10v4h3l4 3V7L7 10H4zM16 9a4 4 0 010 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;

  function slideMarkup(s) {
    const note = s.handNote ? `<p class="hand-note">${s.handNote}</p>` : "";
    return `<div class="mini-slide-wrap">
      <img class="mini-slide" src="${slideSrc(s.slide)}" alt="${s.slide}번 슬라이드">
      ${note}
    </div>`;
  }

  function renderStudents() {
    $("#studentGrid").innerHTML = MONITOR_STUDENTS.map((s) => {
      const inner = s.wait
        ? WAIT_MARK
        : `${slideMarkup(s)}${s.help ? '<span class="dot"></span>' : ""}${SPK}`;
      const status = s.wait ? "미접속" : s.help ? `도움 · ${s.slide}쪽` : `${s.slide}쪽`;
      return `<figure class="student-card ${s.wait ? "wait" : ""} ${s.help ? "help" : ""}" data-name="${s.name}">
        <div class="mini-screen${s.wait ? "" : " live"}">${inner}</div>
        <figcaption>${s.name}<em>${status}</em></figcaption>
      </figure>`;
    }).join("");
  }

  function openStudentZoom(s) {
    if (s.wait) {
      toast(`${s.name} 님은 아직 수업 입장 전입니다.`);
      return;
    }
    $("#zoomStudentName").textContent = `${s.name} · ${s.slide}쪽`;
    const note = s.handNote ? `<p class="hand-note">${s.handNote}</p>` : "";
    $("#zoomSlideFit").innerHTML = `
      <img src="${slideSrc(s.slide)}" alt="${s.slide}번 슬라이드">
      ${note}`;
    $("#studentZoom").classList.add("show");
  }

  $("#muteAll")?.addEventListener("click", () => toast("모든 학생 소리를 껐습니다."));
  $("#openMonitorWin")?.addEventListener("click", () => toast("새 창에서 모니터링을 열었습니다. (데모)"));
  $("#studentGrid").addEventListener("click", (e) => {
    const card = e.target.closest(".student-card");
    if (!card) return;
    const s = MONITOR_STUDENTS.find((x) => x.name === card.dataset.name);
    if (s) openStudentZoom(s);
  });
  $("#studentZoom")?.addEventListener("click", (e) => {
    if (e.target.id === "studentZoom" || e.target.closest("[data-zoom-close]")) closeStudentZoom();
  });

  /* Toolkit */
  $$("[data-kit]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.kitPanel) openPanel(b.dataset.kitPanel);
    else toast(`${b.dataset.kit}를 열었습니다. (데모)`);
  }));
  $("#toolkitPopout")?.addEventListener("click", () => toast("새 창에서 툴킷을 열었습니다. (데모)"));
  $("#toolkitMaximize")?.addEventListener("click", () => toast("툴킷 창을 크게 펼쳤습니다. (데모)"));
  document.addEventListener("click", (e) => {
    const op = e.target.closest("[data-kit-msg]");
    if (op) toast(op.dataset.kitMsg);
    const sw = e.target.closest("[data-switch]");
    if (sw) sw.classList.toggle("on");
    const tab = e.target.closest("[data-tabs] button");
    if (tab) {
      tab.parentElement.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
      tab.classList.add("on");
    }
  });
  const scoreInit = [1, 1, 1, 0];
  $$("[data-score]").forEach((cell, i) => {
    cell.dataset.init = String(scoreInit[i]);
    cell.addEventListener("click", () => {
      cell.textContent = String(Number(cell.textContent) + 1);
    });
  });
  $("#scoreReset")?.addEventListener("click", () => {
    $$("[data-score]").forEach((cell) => { cell.textContent = cell.dataset.init; });
    toast("점수판을 초기화했습니다.");
  });
  $("#seatLayouts")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    $$("#seatLayouts button").forEach((x) => x.classList.remove("on"));
    btn.classList.add("on");
  });
  $("#seatSave")?.addEventListener("click", () => {
    toast("자리바꾸기 설정을 저장했습니다.");
    backToToolkit();
  });

  const BGM = [
    { name: "비제: 아를르의 여인 모음곡 2번 - 3악장", dur: "4:05" },
    { name: "생상스: 동물의 사육제 - 백조", dur: "3:12" },
    { name: "모차르트: 아이네 클라이네 나흐트뮤직", dur: "5:40" },
    { name: "비발디: 사계 - 봄", dur: "3:28" },
    { name: "교실 정리 음악", dur: "2:15" }
  ];
  const SFX = [
    { name: "집중용 띵!", dur: "0:02" },
    { name: "방귀 뿡뿡", dur: "0:03" },
    { name: "학교 종소리", dur: "0:04" },
    { name: "띵동~", dur: "0:02" },
    { name: "박수", dur: "0:03" },
    { name: "정답!", dur: "0:02" }
  ];
  const bgmList = $("#bgmList");
  if (bgmList) {
    bgmList.innerHTML = BGM.map((t) => `<li>
      <button type="button" class="sfx-play" data-play="${t.name}">▶</button>
      <span>${t.name}</span>
      <span class="dur">${t.dur}</span>
      <span>☆</span>
    </li>`).join("");
  }
  const sfxCards = $("#sfxCards");
  if (sfxCards) {
    sfxCards.innerHTML = SFX.map((t) => `<button type="button" class="sfx-card" data-play="${t.name}">
      <b>${t.name}</b><span>☆</span>
      <span class="sfx-play">▶</span>
      <span class="dur">${t.dur}</span>
    </button>`).join("");
  }
  document.addEventListener("click", (e) => {
    const play = e.target.closest("[data-play]");
    if (play) toast(`${play.dataset.play} 재생 (데모)`);
    const sfxTab = e.target.closest("[data-sfx-tab]");
    if (sfxTab) {
      $$("[data-sfx-tab]").forEach((x) => x.classList.remove("on"));
      sfxTab.classList.add("on");
      const box = $("#panelSfx");
      box.classList.remove("is-bgm", "is-fx");
      if (sfxTab.dataset.sfxTab === "bgm") box.classList.add("is-bgm");
      if (sfxTab.dataset.sfxTab === "fx") box.classList.add("is-fx");
    }
  });
  const boardWrite = $("#boardWrite");
  const boardCount = $("#boardCount");
  function updateBoardCount() {
    if (!boardWrite || !boardCount) return;
    const n = (boardWrite.innerText || "").replace(/\n/g, "").length;
    boardCount.textContent = `${Math.min(n, 10000)}/10000`;
  }
  boardWrite?.addEventListener("input", updateBoardCount);
  $("#boardFontSize")?.addEventListener("change", (e) => {
    if (boardWrite) boardWrite.style.fontSize = e.target.value;
  });
  $$(".board-toolbar [data-cmd]").forEach((b) => b.addEventListener("click", () => {
    document.execCommand(b.dataset.cmd, false, null);
    boardWrite?.focus();
  }));

  /* Game */
  const gameMenu = $("#gameUnitMenu");
  const DEMO_UNIT = "5. 직육면체";
  const unitBubble = $("#gameUnitBubble");
  let unitBubbleTimer;
  function closeGameMenu() {
    if (!gameMenu) return;
    gameMenu.hidden = true;
    $("#gameUnit")?.setAttribute("aria-expanded", "false");
  }
  function hideUnitBubble() {
    clearTimeout(unitBubbleTimer);
    unitBubble?.classList.remove("show");
    unitBubble?.setAttribute("hidden", "");
  }
  function setUnitBubble(unit) {
    const isDemo = unit === DEMO_UNIT || unit.startsWith("1.");
    if (isDemo) {
      hideUnitBubble();
      return;
    }
    unitBubble?.classList.add("show");
    unitBubble?.removeAttribute("hidden");
    clearTimeout(unitBubbleTimer);
    unitBubbleTimer = setTimeout(hideUnitBubble, 2800);
  }
  $("#gameSwitch")?.addEventListener("click", () => {
    setGameSwitch(!$("#gameSwitch").classList.contains("on"));
  });
  $("#gameUnit")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = gameMenu.hidden;
    gameMenu.hidden = !open;
    $("#gameUnit").setAttribute("aria-expanded", String(open));
  });
  gameMenu?.addEventListener("click", (e) => {
    e.stopPropagation();
    const item = e.target.closest("[data-unit]");
    if (!item) return;
    $$("[data-unit]", gameMenu).forEach((b) => b.classList.toggle("on", b === item));
    $("#gameUnitLabel").textContent = item.dataset.unit;
    $$(".game-card > span").forEach((s) => { s.textContent = item.dataset.unit; });
    setUnitBubble(item.dataset.unit);
    closeGameMenu();
  });
  document.addEventListener("click", closeGameMenu);
  $$("[data-game]").forEach((b) => b.addEventListener("click", () => {
    hideUnitBubble();
    const href = b.dataset.href;
    if (href) {
      closeAll();
      openToolFrame(b.dataset.game, href);
      return;
    }
    toast(`${b.dataset.game}을 실행합니다. (데모)`);
  }));

  /* Report / end / logout */
  function updateReportCount(input, el, max) {
    if (el) el.textContent = `${(input?.value || "").length}/${max}`;
  }
  function resetReportForm() {
    if ($("#reportTitle")) $("#reportTitle").value = "";
    if ($("#reportText")) $("#reportText").value = "";
    if ($("#reportType")) $("#reportType").selectedIndex = 0;
    if ($("#reportDetail")) $("#reportDetail").selectedIndex = 0;
    const file = $("#reportFile");
    if (file) file.value = "";
    $("#reportFileName").textContent = "";
    $("#reportFile")?.closest(".report-upload")?.classList.remove("has-file");
    updateReportCount($("#reportTitle"), $("#reportTitleCount"), 50);
    updateReportCount($("#reportText"), $("#reportTextCount"), 300);
  }
  $("#reportTitle")?.addEventListener("input", () => {
    updateReportCount($("#reportTitle"), $("#reportTitleCount"), 50);
  });
  $("#reportText")?.addEventListener("input", () => {
    updateReportCount($("#reportText"), $("#reportTextCount"), 300);
  });
  $("#reportFile")?.addEventListener("change", () => {
    const file = $("#reportFile")?.files?.[0];
    const name = $("#reportFileName");
    const wrap = $("#reportFile")?.closest(".report-upload");
    if (file && name) {
      name.textContent = file.name;
      wrap?.classList.add("has-file");
    } else if (name) {
      name.textContent = "";
      wrap?.classList.remove("has-file");
    }
  });
  $("#reportSend").addEventListener("click", () => {
    closeAll();
    toast("오류 신고가 접수되었습니다. 감사합니다.");
  });
  function returnToLobby() {
    location.reload();
  }
  $("#endConfirm").addEventListener("click", returnToLobby);
  $("#logoutConfirm").addEventListener("click", returnToLobby);
  $("#backLeave")?.addEventListener("click", returnToLobby);

  /* Annotation canvas */
  const annoCanvas = $("#annoCanvas");
  const annoCtx = annoCanvas.getContext("2d");
  const annoState = {
    tool: "pen",
    color: "#222222",
    sizes: [4, 8, 16],
    sizeIdx: 1,
    drawing: false,
    pointerId: null,
    last: null,
    undo: [],
    redo: []
  };
  function annoIgnoreTarget(target) {
    return !!target?.closest?.(".anno-dock, .anno-bar, .anno-note, .header, .footer, .modal, .backdrop, .toast, .result-pop, .toolkit-tip");
  }
  function annoPos(e) {
    const r = annoCanvas.getBoundingClientRect();
    if (!r.width || !r.height) return { x: 0, y: 0 };
    return {
      x: (e.clientX - r.left) * (annoCanvas.width / r.width),
      y: (e.clientY - r.top) * (annoCanvas.height / r.height)
    };
  }
  function resizeAnno() {
    const r = annoCanvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    let prev = null;
    try { prev = annoCtx.getImageData(0, 0, annoCanvas.width || 1, annoCanvas.height || 1); } catch (_) {}
    const w = Math.max(1, Math.floor(r.width));
    const h = Math.max(1, Math.floor(r.height));
    if (annoCanvas.width === w && annoCanvas.height === h) return;
    annoCanvas.width = w;
    annoCanvas.height = h;
    if (prev) { try { annoCtx.putImageData(prev, 0, 0); } catch (_) {} }
  }
  function clearAnnoDrawings() {
    annoState.drawing = false;
    annoState.pointerId = null;
    annoState.undo.length = 0;
    annoState.redo.length = 0;
    try { annoCtx.clearRect(0, 0, annoCanvas.width, annoCanvas.height); } catch (_) {}
    const notes = $("#annoTexts");
    if (notes) notes.innerHTML = "";
  }
  function annoSnap() {
    try {
      annoState.undo.push(annoCtx.getImageData(0, 0, annoCanvas.width, annoCanvas.height));
      if (annoState.undo.length > 40) annoState.undo.shift();
      annoState.redo.length = 0;
    } catch (_) {}
  }
  function hexToRgba(hex, a) {
    const n = (hex || "#222222").replace("#", "");
    const r = parseInt(n.slice(0, 2), 16);
    const g = parseInt(n.slice(2, 4), 16);
    const b = parseInt(n.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  function setAnnoColor(color) {
    annoState.color = color;
    const dot = $("#annoColorDot");
    if (dot) dot.style.background = color;
    $$(".anno-swatch").forEach((b) => b.classList.toggle("on", b.dataset.color === color));
    annoApply();
  }
  function hideAnnoColors() {
    $("#annoDock")?.classList.remove("show-colors");
    $("#annoColorBtn")?.classList.remove("on");
    $("#annoColorBtn")?.setAttribute("aria-expanded", "false");
  }
  function annoApply() {
    const s = annoState.sizes[annoState.sizeIdx];
    const color = annoState.color || "#222222";
    annoCtx.lineCap = "round";
    annoCtx.lineJoin = "round";
    annoCtx.globalAlpha = 1;
    if (annoState.tool === "eraser") {
      annoCtx.globalCompositeOperation = "destination-out";
      annoCtx.strokeStyle = "#000";
      annoCtx.lineWidth = s * 5;
    } else if (annoState.tool === "highlighter") {
      annoCtx.globalCompositeOperation = "source-over";
      annoCtx.strokeStyle = hexToRgba(color, 0.38);
      annoCtx.lineWidth = s * 5;
    } else {
      annoCtx.globalCompositeOperation = "source-over";
      annoCtx.strokeStyle = color;
      annoCtx.lineWidth = s;
    }
  }
  function setAnnoTool(tool) {
    if (["undo", "redo", "clear", "color"].includes(tool)) return;
    annoState.tool = tool;
    $$(".anno-tool[data-anno]").forEach((b) => {
      if (["undo", "redo", "clear", "color"].includes(b.dataset.anno)) return;
      b.classList.toggle("on", b.dataset.anno === tool);
    });
    annoCanvas.classList.toggle("tool-eraser", tool === "eraser");
    annoCanvas.classList.toggle("tool-text", tool === "text");
  }
  window.addEventListener("resize", resizeAnno);
  function onAnnoPointerDown(e) {
    if (!state.annotating) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (annoIgnoreTarget(e.target)) return;
    e.preventDefault();
    if (annoState.tool === "text") {
      const r = annoCanvas.getBoundingClientRect();
      const note = document.createElement("div");
      note.className = "anno-note";
      note.contentEditable = "true";
      note.textContent = "텍스트";
      note.style.left = `${e.clientX - r.left}px`;
      note.style.top = `${e.clientY - r.top}px`;
      $("#annoTexts").appendChild(note);
      note.focus();
      document.execCommand("selectAll", false, null);
      return;
    }
    resizeAnno();
    annoSnap();
    annoState.drawing = true;
    annoState.pointerId = e.pointerId;
    const p = annoPos(e);
    annoState.last = p;
    annoApply();
    annoCtx.beginPath();
    annoCtx.arc(p.x, p.y, Math.max(0.5, annoCtx.lineWidth / 2), 0, Math.PI * 2);
    annoCtx.fillStyle = annoCtx.strokeStyle;
    annoCtx.fill();
    annoCtx.beginPath();
    annoCtx.moveTo(p.x, p.y);
    try { annoCanvas.setPointerCapture?.(e.pointerId); } catch (_) {}
  }
  function onAnnoPointerMove(e) {
    if (!annoState.drawing) return;
    if (annoState.pointerId != null && e.pointerId !== annoState.pointerId) return;
    e.preventDefault();
    const extra = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : null;
    const pts = extra && extra.length ? extra : [e];
    for (const ev of pts) {
      const p = annoPos(ev);
      annoCtx.lineTo(p.x, p.y);
      annoCtx.stroke();
      annoCtx.beginPath();
      annoCtx.moveTo(p.x, p.y);
    }
  }
  function endAnnoDraw(e) {
    if (e && annoState.pointerId != null && e.pointerId !== annoState.pointerId) return;
    annoState.drawing = false;
    annoState.pointerId = null;
  }
  document.addEventListener("pointerdown", onAnnoPointerDown);
  document.addEventListener("pointermove", onAnnoPointerMove);
  document.addEventListener("pointerup", endAnnoDraw);
  document.addEventListener("pointercancel", endAnnoDraw);

  $("#annoBar").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-anno]");
    if (!btn) return;
    const t = btn.dataset.anno;
    if (t === "undo") {
      if (!annoState.undo.length) return;
      try {
        annoState.redo.push(annoCtx.getImageData(0, 0, annoCanvas.width, annoCanvas.height));
        annoCtx.putImageData(annoState.undo.pop(), 0, 0);
      } catch (_) {}
      return;
    }
    if (t === "redo") {
      if (!annoState.redo.length) return;
      try {
        annoState.undo.push(annoCtx.getImageData(0, 0, annoCanvas.width, annoCanvas.height));
        annoCtx.putImageData(annoState.redo.pop(), 0, 0);
      } catch (_) {}
      return;
    }
    if (t === "clear") {
      annoSnap();
      annoCtx.clearRect(0, 0, annoCanvas.width, annoCanvas.height);
      $("#annoTexts").innerHTML = "";
      return;
    }
    if (t === "color") {
      const dock = $("#annoDock");
      const open = !dock?.classList.contains("show-colors");
      dock?.classList.toggle("show-colors", open);
      $("#annoColorBtn")?.classList.toggle("on", open);
      $("#annoColorBtn")?.setAttribute("aria-expanded", String(open));
      return;
    }
    hideAnnoColors();
    setAnnoTool(t);
  });
  $$(".anno-swatch").forEach((btn) => {
    btn.style.setProperty("--swatch", btn.dataset.color);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setAnnoColor(btn.dataset.color);
    });
  });
  setAnnoColor("#222222");
  const anno = { resize: resizeAnno };

  /* AI drawing on SVG */
  const svg = $("#shapeSvg");
  const drawPts = [];
  let extraId = 0;
  if (svg) {

  function svgPoint(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function enableDraw(on) {
    $("#drawCanvas").classList.toggle("drawing", on);
    svg.style.pointerEvents = on ? "auto" : "none";
  }
  svg.style.pointerEvents = "none";

  $$("[data-tool]").forEach((b) => b.addEventListener("click", () => {
    $$("[data-tool]").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    state.drawTool = b.dataset.tool;
    enableDraw(state.drawTool !== "select" && state.drawTool !== "measure");
    if (state.drawTool === "measure") toast("도형을 누르면 변의 수와 이름을 알려 줍니다.");
  }));

  svg.addEventListener("click", (e) => {
    const poly = e.target.closest(".poly");
    if (state.drawTool === "measure" && poly) {
      toast(`${poly.dataset.name} · 꼭짓점 ${poly.querySelectorAll(".vertex").length}개`);
      return;
    }
    if (!panels.ai.classList.contains("show")) return;
    if (state.drawTool !== "polygon" && state.drawTool !== "point") return;
    const p = svgPoint(e);
    if (drawPts.length > 2) {
      const first = drawPts[0];
      const dx = p.x - first.x;
      const dy = p.y - first.y;
      if (Math.hypot(dx, dy) < 18) {
        commitPolygon(drawPts.slice(), "#b39ddb", "#7e57c2", "내가 그린 다각형");
        drawPts.length = 0;
        clearPreview();
        return;
      }
    }
    drawPts.push({ x: p.x, y: p.y });
    previewPoints();
    if (state.drawTool === "point") {
      commitPolygon(drawPts.slice(), "#90caf9", "#1e88e5", "점");
      drawPts.length = 0;
      clearPreview();
    }
  });

  let previewG = null;
  function clearPreview() {
    if (previewG) previewG.remove();
    previewG = null;
  }
  function previewPoints() {
    clearPreview();
    previewG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    drawPts.forEach((p) => {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", p.x); c.setAttribute("cy", p.y); c.setAttribute("r", "5");
      c.setAttribute("fill", "#1a1a1a");
      previewG.appendChild(c);
    });
    if (drawPts.length > 1) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      line.setAttribute("points", drawPts.map((p) => `${p.x},${p.y}`).join(" "));
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", "#7e57c2");
      line.setAttribute("stroke-width", "2");
      previewG.insertBefore(line, previewG.firstChild);
    }
    svg.appendChild(previewG);
  }

  function commitPolygon(points, fill, stroke, name) {
    extraId += 1;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("poly", "extra");
    g.dataset.name = name;
    if (points.length === 1) {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", points[0].x); c.setAttribute("cy", points[0].y);
      c.setAttribute("r", "6"); c.setAttribute("fill", "#1a1a1a");
      g.appendChild(c);
    } else {
      const pg = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      pg.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
      pg.setAttribute("fill", fill);
      pg.setAttribute("fill-opacity", "0.85");
      pg.setAttribute("stroke", stroke);
      pg.setAttribute("stroke-width", "2.5");
      g.appendChild(pg);
      points.forEach((p) => {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", p.x); c.setAttribute("cy", p.y);
        c.setAttribute("r", "5"); c.classList.add("vertex");
        g.appendChild(c);
      });
    }
    svg.appendChild(g);
  }

  function regularPolygon(n, cx, cy, r, fill, stroke, name) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    commitPolygon(pts, fill, stroke, name);
  }

  function rhombusAt(cx, cy) {
    commitPolygon([
      { x: cx, y: cy - 70 }, { x: cx + 90, y: cy }, { x: cx, y: cy + 70 }, { x: cx - 90, y: cy }
    ], "#cfd6dc", "#90a4ae", "마름모");
  }

  function handleAi(text) {
    const t = text.replace(/\s/g, "");
    const cx = 560 + (extraId % 3) * 20;
    const cy = 250 + (extraId % 2) * 16;
    if (t.includes("정삼각형") || t.includes("삼각형")) regularPolygon(3, cx, cy, 90, "#c6e97a", "#7cb342", "정삼각형");
    else if (t.includes("정오각형") || t.includes("오각형")) regularPolygon(5, cx, cy, 90, "#ce93d8", "#8e24aa", "정오각형");
    else if (t.includes("정육각형") || t.includes("육각형")) regularPolygon(6, cx, cy, 90, "#ffe082", "#f9a825", "정육각형");
    else if (t.includes("정팔각형") || t.includes("팔각형")) regularPolygon(8, cx, cy, 88, "#80cbc4", "#00897b", "정팔각형");
    else if (t.includes("정사각형") || t.includes("사각형")) regularPolygon(4, cx, cy, 80, "#ffb14a", "#f57c00", "정사각형");
    else if (t.includes("마름모")) rhombusAt(cx, cy);
    else {
      toast("아직 그 도형은 데모에 없어요. 정오각형처럼 말해 보세요.");
      return;
    }
    toast(`AI가 ${text.replace("그려줘", "").trim()}을(를) 그렸습니다.`);
  }

  $("#aiGo")?.addEventListener("click", () => {
    const v = $("#aiPrompt").value.trim() || "정오각형 그려줘";
    handleAi(v);
  });
  $("#aiPrompt")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("#aiGo")?.click();
  });
  $$("[data-prompt]").forEach((b) => b.addEventListener("click", () => {
    $("#aiPrompt").value = b.dataset.prompt;
    handleAi(b.dataset.prompt);
  }));
  $("#clearDraw")?.addEventListener("click", () => {
    $$(".extra", svg).forEach((n) => n.remove());
    drawPts.length = 0;
    clearPreview();
    toast("내가 그린 도형을 지웠습니다.");
  });
  }

  $$("[data-math-tool]").forEach((b) => b.addEventListener("click", () => {
    const url = b.dataset.mathUrl;
    if (url) {
      openToolFrame(b.dataset.mathTool, url);
      return;
    }
    toast(`${b.dataset.mathTool}를 열었습니다. (데모)`);
  }));
  $("#toolFrameClose")?.addEventListener("click", closeToolFrame);
  $("#aiPopout")?.addEventListener("click", () => toast("새 창에서 수학교구를 열었습니다. (데모)"));
  $("#aiMaximize")?.addEventListener("click", () => toast("수학교구 창을 크게 펼쳤습니다. (데모)"));

  /* Lesson slide interactions */
  $$(".sel-wrap").forEach((wrap) => {
    const btn = wrap.querySelector(".sel-btn");
    const list = wrap.querySelector(".sel-list");
    btn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = !wrap.classList.contains("open");
      $$(".sel-wrap").forEach((w) => w.classList.remove("open"));
      wrap.classList.toggle("open", willOpen);
    });
    list?.addEventListener("click", (e) => {
      const item = e.target.closest("[data-value]");
      if (!item) return;
      wrap.dataset.value = item.dataset.value;
      if (btn) btn.textContent = item.dataset.value;
      $$("li", list).forEach((li) => li.setAttribute("aria-selected", li === item ? "true" : "false"));
      wrap.classList.remove("open");
    });
  });
  document.addEventListener("click", () => {
    $$(".sel-wrap").forEach((w) => w.classList.remove("open"));
  });

  const lesson = {
    q3step: 0,
    pickedFaces: new Set(),
    people: new Set(),
    reflect: { 1: "good", 2: "bad", 3: "ok", 4: "good" },
    netErase: false,
    isoErase: false,
    kbMath: false
  };

  function clearZone(zone) {
    const label = zone.dataset.placed;
    if (label) $("#labelBank")?.querySelector(`.drag-chip[data-label="${label}"]`)?.classList.remove("used");
    zone.textContent = "";
    delete zone.dataset.placed;
    zone.classList.remove("filled", "on");
    zone.removeAttribute("draggable");
  }

  function returnChips() {
    $$(".drop-zone").forEach(clearZone);
    $$("#labelBank .drag-chip").forEach((c) => c.classList.remove("used"));
  }

  function placeChip(zone, label) {
    const bank = $("#labelBank");
    const orig = bank?.querySelector(`.drag-chip[data-label="${label}"]`);
    if (!orig) return;
    if (zone.dataset.placed === label) return;
    if (zone.dataset.placed) clearZone(zone);
    $$(".drop-zone").forEach((z) => {
      if (z !== zone && z.dataset.placed === label) clearZone(z);
    });
    orig.classList.add("used");
    zone.dataset.placed = label;
    zone.textContent = label;
    zone.classList.add("filled");
    zone.setAttribute("draggable", "true");
  }

  document.addEventListener("dragstart", (e) => {
    const chip = e.target.closest(".drag-chip");
    const zone = e.target.closest(".drop-zone");
    if (chip) {
      if (chip.classList.contains("used")) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("text/plain", chip.dataset.label);
      return;
    }
    if (zone?.dataset.placed) e.dataTransfer.setData("text/plain", zone.dataset.placed);
  });
  $$(".drop-zone").forEach((zone) => {
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("on"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("on"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("on");
      const label = e.dataTransfer.getData("text/plain");
      if (label) placeChip(zone, label);
    });
  });

  $$("#faceSvg .face-poly").forEach((poly) => {
    poly.addEventListener("click", () => {
      const id = poly.dataset.face;
      if (lesson.q3step === 0) {
        $$("#faceSvg .face-poly").forEach((p) => p.classList.remove("picked"));
        lesson.pickedFaces = new Set([id]);
        poly.classList.add("picked");
      } else {
        poly.classList.toggle("picked");
        if (poly.classList.contains("picked")) lesson.pickedFaces.add(id);
        else lesson.pickedFaces.delete(id);
      }
    });
  });
  function setQ3Step(step) {
    lesson.q3step = step;
    $("#q3fit")?.classList.toggle("q3-step1", step === 1);
    $$("#faceSvg .face-poly").forEach((p) => p.classList.remove("picked"));
    $$("#q3fit .face-name").forEach((p) => p.classList.remove("picked"));
    lesson.pickedFaces.clear();
  }
  $("#q3next")?.addEventListener("click", () => setQ3Step(1));
  $("#q3prev")?.addEventListener("click", () => setQ3Step(0));
  $$("#q3fit .face-name").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("picked");
      const id = btn.dataset.face;
      if (btn.classList.contains("picked")) lesson.pickedFaces.add(id);
      else lesson.pickedFaces.delete(id);
    });
  });

  $$(".talk-card").forEach((card) => {
    card.addEventListener("click", () => {
      card.classList.toggle("on");
      const name = card.dataset.person;
      if (card.classList.contains("on")) lesson.people.add(name);
      else lesson.people.delete(name);
    });
  });

  function netLineBoard(canvas) {
    const ctx = canvas.getContext("2d");
    const COLS = 21;
    const ROWS = 15;
    const bar = $("#netStyleBar");
    const fit = canvas.closest(".slide-fit");
    const segments = [];
    const verts = new Set();
    let active = null;
    let lineMode = "solid";
    let lastSeg = null;

    function metrics() {
      const ox = canvas.width * 0.316;
      const oy = canvas.height * 0.012;
      const cellW = canvas.width * 0.03255;
      const cellH = canvas.height * 0.0661;
      return { ox, oy, cellW, cellH };
    }
    function pt(c, r) {
      const { ox, oy, cellW, cellH } = metrics();
      return { x: ox + c * cellW, y: oy + r * cellH };
    }
    function key(c, r) { return `${c},${r}`; }
    function sameEdge(a, b) {
      return (a.c === b.c && a.r === b.r);
    }
    function segKey(a, b) {
      const k1 = key(a.c, a.r);
      const k2 = key(b.c, b.r);
      return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
    }
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111";
      ctx.fillStyle = "#111";
      segments.forEach((s) => {
        const a = pt(s.a.c, s.a.r);
        const b = pt(s.b.c, s.b.r);
        ctx.setLineDash(s.dashed ? [7, 6] : []);
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      verts.forEach((k) => {
        const [c, r] = k.split(",").map(Number);
        const p = pt(c, r);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2);
        ctx.fill();
      });
      if (active) {
        const p = pt(active.c, active.r);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5.2, 0, Math.PI * 2);
        ctx.fillStyle = "#3d7eff";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = "#111";
        ctx.fill();
      }
    }
    function placeBar() {
      if (!active || !bar || !fit) {
        bar?.classList.remove("show");
        return;
      }
      const p = pt(active.c, active.r);
      const cr = canvas.getBoundingClientRect();
      const fr = fit.getBoundingClientRect();
      const sx = cr.left + (p.x / canvas.width) * cr.width;
      const sy = cr.top + (p.y / canvas.height) * cr.height;
      bar.style.left = `${((sx - fr.left) / fr.width) * 100}%`;
      bar.style.top = `${((sy - fr.top) / fr.height) * 100}%`;
      bar.classList.add("show");
      $$(".net-style-btn", bar).forEach((b) => b.classList.toggle("on", b.dataset.style === lineMode));
    }
    function snap(e) {
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * canvas.width;
      const y = (e.clientY - r.top) / r.height * canvas.height;
      const { ox, oy, cellW, cellH } = metrics();
      const c = Math.round((x - ox) / cellW);
      const row = Math.round((y - oy) / cellH);
      if (c < 0 || row < 0 || c > COLS || row > ROWS) return null;
      const p = pt(c, row);
      if (Math.hypot(x - p.x, y - p.y) > Math.min(cellW, cellH) * 0.45) return null;
      return { c, r: row };
    }
    function distToSeg(x, y, s) {
      const a = pt(s.a.c, s.a.r);
      const b = pt(s.b.c, s.b.r);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((x - a.x) * dx + (y - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
    }
    function nearestSeg(e) {
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * canvas.width;
      const y = (e.clientY - r.top) / r.height * canvas.height;
      let best = -1;
      let bestD = 14;
      segments.forEach((s, i) => {
        const d = distToSeg(x, y, s);
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    }
    function addSeg(a, b, dashed) {
      const k = segKey(a, b);
      const i = segments.findIndex((s) => segKey(s.a, s.b) === k);
      const seg = { a: { c: a.c, r: a.r }, b: { c: b.c, r: b.r }, dashed };
      if (i >= 0) segments[i] = seg;
      else segments.push(seg);
      verts.add(key(a.c, a.r));
      verts.add(key(b.c, b.r));
      lastSeg = seg;
    }
    canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (lesson.netErase) {
        const i = nearestSeg(e);
        if (i >= 0) {
          const gone = segments.splice(i, 1)[0];
          if (lastSeg === gone) lastSeg = null;
          const used = new Set();
          segments.forEach((s) => {
            used.add(key(s.a.c, s.a.r));
            used.add(key(s.b.c, s.b.r));
          });
          [...verts].forEach((k) => { if (!used.has(k)) verts.delete(k); });
          if (active && !verts.has(key(active.c, active.r))) active = null;
          draw();
          placeBar();
        }
        return;
      }
      const hit = snap(e);
      if (!hit) return;
      if (!active || sameEdge(active, hit)) {
        active = hit;
        verts.add(key(hit.c, hit.r));
      } else {
        addSeg(active, hit, lineMode === "dashed");
        active = hit;
      }
      draw();
      placeBar();
    });
    bar?.addEventListener("pointerdown", (e) => e.stopPropagation());
    bar?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-style]");
      if (!btn) return;
      lineMode = btn.dataset.style;
      $$(".net-style-btn", bar).forEach((b) => b.classList.toggle("on", b === btn));
      if (lastSeg) {
        lastSeg.dashed = lineMode === "dashed";
        draw();
      }
    });
    return {
      clear() {
        segments.length = 0;
        verts.clear();
        active = null;
        lastSeg = null;
        lineMode = "solid";
        draw();
        placeBar();
      },
      example(cells) {
        this.clear();
        const boxes = cells;
        boxes.forEach((box) => {
          const { c0, r0, c1, r1 } = box;
          const corners = [
            { c: c0, r: r0 }, { c: c1, r: r0 }, { c: c1, r: r1 }, { c: c0, r: r1 }
          ];
          corners.forEach((p, i) => addSeg(p, corners[(i + 1) % 4], false));
        });
        active = null;
        draw();
        placeBar();
      }
    };
  }
  const netCanvas = $("#netCanvas");
  const isoCanvas = $("#isoCanvas");
  const netBoard = netCanvas ? netLineBoard(netCanvas) : null;
  let isoCtx = null;
  if (isoCanvas) {
    isoCtx = isoCanvas.getContext("2d");
    const drawIsoBg = () => {
      isoCtx.clearRect(0, 0, isoCanvas.width, isoCanvas.height);
    };
    drawIsoBg();
    let drawing = false, last = null;
    function pos(e) {
      const r = isoCanvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (isoCanvas.width / r.width), y: (e.clientY - r.top) * (isoCanvas.height / r.height) };
    }
    isoCanvas.addEventListener("pointerdown", (e) => {
      drawing = true; last = pos(e);
      isoCtx.lineCap = "round"; isoCtx.lineJoin = "round";
      isoCtx.globalCompositeOperation = lesson.isoErase ? "destination-out" : "source-over";
      isoCtx.strokeStyle = "#222"; isoCtx.lineWidth = lesson.isoErase ? 18 : 3;
      isoCtx.beginPath(); isoCtx.moveTo(last.x, last.y);
    });
    isoCanvas.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      const p = pos(e);
      isoCtx.lineTo(p.x, p.y); isoCtx.stroke();
      isoCtx.beginPath(); isoCtx.moveTo(p.x, p.y);
    });
    window.addEventListener("pointerup", () => { drawing = false; });
    isoCanvas._clear = () => { isoCtx.globalCompositeOperation = "source-over"; drawIsoBg(); };
    isoCanvas._example = () => {
      drawIsoBg();
      isoCtx.strokeStyle = "#222"; isoCtx.lineWidth = 3; isoCtx.globalCompositeOperation = "source-over";
      isoCtx.beginPath();
      isoCtx.moveTo(160, 80); isoCtx.lineTo(320, 40); isoCtx.lineTo(400, 90); isoCtx.lineTo(240, 130); isoCtx.closePath();
      isoCtx.moveTo(160, 80); isoCtx.lineTo(160, 180); isoCtx.lineTo(240, 230); isoCtx.lineTo(240, 130);
      isoCtx.moveTo(240, 230); isoCtx.lineTo(400, 190); isoCtx.lineTo(400, 90);
      isoCtx.stroke();
      isoCtx.setLineDash([8, 6]);
      isoCtx.beginPath();
      isoCtx.moveTo(160, 80); isoCtx.lineTo(160, 180);
      isoCtx.moveTo(160, 180); isoCtx.lineTo(320, 140);
      isoCtx.moveTo(320, 40); isoCtx.lineTo(320, 140);
      isoCtx.stroke();
      isoCtx.setLineDash([]);
    };
  }
  $("#netEraser")?.addEventListener("click", () => {
    lesson.netErase = !lesson.netErase;
    $("#netEraser").classList.toggle("on", lesson.netErase);
    if (lesson.netErase) $("#netStyleBar")?.classList.remove("show");
    $("#netCanvas")?.classList.toggle("erasing", lesson.netErase);
  });
  $("#supplyBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = panels.supplies;
    if (panel?.classList.contains("show")) {
      closeAll();
      return;
    }
    openPanel("supplies");
  });
  $("#isoEraser")?.addEventListener("click", () => {
    lesson.isoErase = !lesson.isoErase;
    $("#isoEraser").classList.toggle("on", lesson.isoErase);
  });
  function setKbTooltip(on) {
    $("#kbHintTag")?.classList.toggle("show", on);
    $("#kbHintBtn")?.setAttribute("aria-expanded", on ? "true" : "false");
  }
  function setKbMode(on) {
    lesson.kbMath = on;
    $("#kbHintBtn")?.classList.toggle("on", on);
    $("#kbHintBtn")?.setAttribute("aria-pressed", String(on));
    $("#reasonModeIco")?.classList.toggle("show", on);
    $("#exHintTag")?.classList.toggle("is-hidden", on);
    setKbTooltip(on);
  }
  function hideKbHint() {
    setKbTooltip(false);
  }
  $("#kbHintBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    setKbMode(!lesson.kbMath);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#kbHintBtn") && !e.target.closest("#kbHintTag")) hideKbHint();
  });

  const chickPaint = $("#chickPaint");
  const chickImg = document.querySelector('[data-page="8"] img');
  let chickSrc = null;
  function loadChickSrc() {
    if (!chickPaint || !chickImg || !chickImg.naturalWidth) return;
    try {
      const off = document.createElement("canvas");
      off.width = chickPaint.width;
      off.height = chickPaint.height;
      const octx = off.getContext("2d");
      octx.drawImage(chickImg, 0, 0, off.width, off.height);
      chickSrc = octx.getImageData(0, 0, off.width, off.height);
    } catch (err) {
      console.warn(err);
    }
  }
  if (chickImg) {
    if (chickImg.complete) loadChickSrc();
    chickImg.addEventListener("load", loadChickSrc);
  }
  function chickBoundary(i) {
    if (!chickSrc) return true;
    const r = chickSrc.data[i];
    const g = chickSrc.data[i + 1];
    const b = chickSrc.data[i + 2];
    const lum = (r + g + b) / 3;
    if (lum < 150) return true;
    if (b < 90 && r < 170 && g < 170) return true;
    return false;
  }
  function findChickSeed(sx, sy) {
    const w = chickSrc.width;
    const h = chickSrc.height;
    sx = Math.round(sx);
    sy = Math.round(sy);
    if (sx >= 0 && sy >= 0 && sx < w && sy < h && !chickBoundary((sy * w + sx) * 4)) return [sx, sy];
    for (let r = 1; r <= 18; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = sx + dx;
          const y = sy + dy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          if (!chickBoundary((y * w + x) * 4)) return [x, y];
        }
      }
    }
    return [sx, sy];
  }
  function fillChick(ctx, fx, fy, rgb) {
    if (!chickSrc) return;
    const w = chickSrc.width;
    const h = chickSrc.height;
    const dest = ctx.getImageData(0, 0, w, h);
    const d = dest.data;
    const [sx, sy] = findChickSeed(fx / 100 * w, fy / 100 * h);
    const maxR2 = 34 * 34;
    const stack = [sx, sy];
    const seen = new Uint8Array(w * h);
    while (stack.length) {
      const y = stack.pop();
      const x = stack.pop();
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const p = y * w + x;
      if (seen[p]) continue;
      seen[p] = 1;
      const dx = x - sx;
      const dy = y - sy;
      if (dx * dx + dy * dy > maxR2) continue;
      const i = p * 4;
      if (chickBoundary(i)) continue;
      d[i] = rgb[0];
      d[i + 1] = rgb[1];
      d[i + 2] = rgb[2];
      d[i + 3] = 255;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
    ctx.putImageData(dest, 0, 0);
  }
  const CHICK_YELLOW = [255, 253, 0];
  const CHICK_WHITE = [255, 255, 255];
  const CHICK_DEFAULT = { 1: "good", 2: "bad", 3: "ok", 4: "good" };
  function paintChicks() {
    if (!chickPaint) return;
    if (!chickSrc) loadChickSrc();
    const ctx = chickPaint.getContext("2d");
    ctx.clearRect(0, 0, chickPaint.width, chickPaint.height);
    $$(".chicks button").forEach((btn) => {
      fillChick(ctx, Number(btn.dataset.fx), Number(btn.dataset.fy), btn.classList.contains("on") ? CHICK_YELLOW : CHICK_WHITE);
    });
  }
  function restoreChicks() {
    $$(".chicks").forEach((group) => {
      const mood = CHICK_DEFAULT[group.dataset.reflect];
      $$("button", group).forEach((b) => {
        const on = b.dataset.mood === mood;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    });
    lesson.reflect = { ...CHICK_DEFAULT };
    if (chickPaint) chickPaint.getContext("2d").clearRect(0, 0, chickPaint.width, chickPaint.height);
  }
  $$(".chicks button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.closest(".chicks");
      $$("button", group).forEach((b) => {
        b.classList.remove("on");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("on");
      btn.setAttribute("aria-pressed", "true");
      lesson.reflect[group.dataset.reflect] = btn.dataset.mood;
      paintChicks();
    });
  });

  function resetSlide(n, keepSubpage) {
    if (n === 2) {
      $$("[data-q]").forEach((s) => {
        s.dataset.value = "";
        s.classList.remove("open");
        const btn = s.querySelector(".sel-btn");
        if (btn) btn.textContent = "";
        $$("li", s).forEach((li) => li.removeAttribute("aria-selected"));
      });
    }
    if (n === 3) returnChips();
    if (n === 4) setQ3Step(keepSubpage ? lesson.q3step : 0);
    if (n === 5) {
      netBoard?.clear();
      lesson.netErase = false;
      $("#netEraser")?.classList.remove("on");
      $("#netCanvas")?.classList.remove("erasing");
      $("#netExampleBtn")?.classList.remove("is-close");
      $("#netExampleBtn")?.setAttribute("aria-pressed", "false");
      $("#netExampleBtn")?.setAttribute("title", "예시");
      $("#netSampleLabel")?.classList.remove("show");
    }
    if (n === 6) {
      lesson.people.clear();
      $$(".talk-card").forEach((c) => c.classList.remove("on"));
    }
    if (n === 7) {
      isoCanvas?._clear();
      lesson.isoErase = false;
      $("#isoEraser")?.classList.remove("on");
      if ($("#reasonInput")) $("#reasonInput").value = "";
      $("#reasonExample")?.classList.remove("show");
      $("#reasonExampleBtn")?.classList.remove("is-close");
      $("#reasonExampleBtn")?.setAttribute("aria-pressed", "false");
      $("#reasonExampleBtn")?.setAttribute("title", "예시");
      setKbMode(false);
    }
    if (n === 8) restoreChicks();
  }

  document.addEventListener("click", (e) => {
    const reset = e.target.closest("[data-reset]");
    const check = e.target.closest("[data-check]");
    const example = e.target.closest("[data-example]");
    if (reset) {
      const n = Number(reset.dataset.reset);
      resetSlide(n, n === 4);
    }
    if (check) {
      const n = Number(check.dataset.check);
      let ok = false;
      if (n === 2) {
        ok = $('[data-q="cuboid"]')?.dataset.value === "직육면체" && $('[data-q="cube"]')?.dataset.value === "정육면체";
      }
      if (n === 3) {
        const zones = $$(".drop-zone");
        ok = zones.length > 0 && zones.every((z) => z.dataset.placed === z.dataset.accept);
      }
      if (n === 4) {
        ok = lesson.q3step === 0
          ? lesson.pickedFaces.size === 1 && lesson.pickedFaces.has("right")
          : ["front", "back", "top", "bottom"].every((f) => lesson.pickedFaces.has(f)) && !lesson.pickedFaces.has("left") && !lesson.pickedFaces.has("right");
      }
      if (n === 6) {
        ok = lesson.people.has("주아") && lesson.people.has("은찬") && !lesson.people.has("윤호");
      }
      showResult(ok ? "정답입니다!" : "다시 생각해 보세요.");
    }
    if (example) {
      const n = Number(example.dataset.example);
      if (n === 5) {
        const btn = $("#netExampleBtn") || example;
        const label = $("#netSampleLabel");
        const on = !btn?.classList.contains("is-close");
        btn?.classList.toggle("is-close", on);
        btn?.setAttribute("aria-pressed", on ? "true" : "false");
        btn?.setAttribute("title", on ? "예시 닫기" : "예시");
        label?.classList.toggle("show", on);
        if (on) {
          netBoard?.example([
            { c0: 6, r0: 2, c1: 11, r1: 4 },
            { c0: 4, r0: 4, c1: 6, r1: 7 },
            { c0: 6, r0: 4, c1: 11, r1: 7 },
            { c0: 11, r0: 4, c1: 13, r1: 7 },
            { c0: 6, r0: 7, c1: 11, r1: 9 }
          ]);
        } else {
          netBoard?.clear();
        }
      }
      if (n === 7) {
        const box = $("#reasonExample");
        const btn = $("#reasonExampleBtn") || example;
        const on = !box?.classList.contains("show");
        box?.classList.toggle("show", on);
        btn?.classList.toggle("is-close", on);
        btn?.setAttribute("aria-pressed", on ? "true" : "false");
        btn?.setAttribute("title", on ? "예시 닫기" : "예시");
        if (on) isoCanvas?._example();
        else isoCanvas?._clear();
      }
    }
  });

  renderPage();
  requestAnimationFrame(() => anno.resize());

  let idleTimer;
  function isFreshHome() {
    if (document.body.classList.contains("is-lobby")) return true;
    if (state.page !== 1 || state.annotating || state.locked || state.sharing) return false;
    return !document.querySelector(".modal.show, .toc-panel.show, .stage.show, .panel.show, .drawer.show");
  }
  function armIdleReset() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (isFreshHome()) {
        armIdleReset();
        return;
      }
      location.reload();
    }, IDLE_RESET_MS);
  }
  ["pointerdown", "keydown", "touchstart", "wheel"].forEach((type) => {
    document.addEventListener(type, armIdleReset, { passive: true });
  });
  armIdleReset();

  function consumeHash() {
    const boot = location.hash.replace("#", "");
    if (boot === "ai") openPanel("ai");
    else if (boot === "game") openPanel("game");
    else if (boot === "timer" || boot === "pick" || boot === "draw" || boot === "toolkit") openPanel("toolkit");
    else if (boot === "monitor") { renderStudents(); openPanel("monitor"); }
    else if (boot && panels[boot]) openPanel(boot);
  }

  function lobbyCountText(n) {
    return n ? String(n) : "-";
  }
  function renderLobbyStudents(tab) {
    const list = $("#lobbyStudents");
    if (!list) return;
    const names = tab === "wait" ? LOBBY_WAITING : LOBBY_CONNECTED;
    const onCount = $("#lobbyModal [data-lobby-tab='on'] b");
    const waitCount = $("#lobbyModal [data-lobby-tab='wait'] b");
    if (onCount) onCount.textContent = lobbyCountText(LOBBY_CONNECTED.length);
    if (waitCount) waitCount.textContent = lobbyCountText(LOBBY_WAITING.length);
    if (!names.length) {
      list.classList.add("is-empty");
      list.innerHTML = `<p class="lobby-empty">${tab === "wait" ? "미접속 학생이 없습니다." : "접속한 학생이 없습니다."}</p>`;
    } else {
      list.classList.remove("is-empty");
      list.innerHTML = names.map((name) => `<div class="lobby-stu">${name}</div>`).join("");
    }
    $$(".lobby-stat").forEach((btn) => btn.classList.toggle("on", btn.dataset.lobbyTab === tab));
  }
  function openLobbyModal() {
    document.body.classList.add("is-lobby-modal");
    $("#lobbyDim")?.classList.add("show");
    $("#lobbyModal")?.classList.add("show");
    renderLobbyStudents("on");
  }
  function closeLobbyModal() {
    document.body.classList.remove("is-lobby-modal");
    $("#lobbyDim")?.classList.remove("show");
    $("#lobbyModal")?.classList.remove("show");
  }
  function enterLesson() {
    document.body.classList.remove("is-lobby");
    closeLobbyModal();
    requestAnimationFrame(() => anno.resize());
    consumeHash();
  }
  renderLobbyStudents("on");
  $$("[data-lobby-tab]").forEach((btn) => {
    btn.addEventListener("click", () => renderLobbyStudents(btn.dataset.lobbyTab));
  });
  $("#lobbyRefresh")?.addEventListener("click", () => {
    const btn = $("#lobbyRefresh");
    btn.classList.remove("spin");
    void btn.offsetWidth;
    btn.classList.add("spin");
    const tab = $(".lobby-stat.on")?.dataset.lobbyTab || "on";
    renderLobbyStudents(tab);
  });
  $("#lobbyStart")?.addEventListener("click", enterLesson);
  $("#lobbyCancel")?.addEventListener("click", closeLobbyModal);
  $("#lobbyQuickStart")?.addEventListener("click", openLobbyModal);
  $("#lobbyReady")?.addEventListener("click", openLobbyModal);
  $("#lobbyLessonItem")?.addEventListener("click", openLobbyModal);
  const demoSteps = { lesson: false, design: false, picked: false, dropped: false };
  function notifyDemoDone() {
    if (!demoSteps.lesson || !demoSteps.design || !demoSteps.picked || !demoSteps.dropped) return;
    window.parent?.postMessage({ type: "aidt-design-complete" }, "*");
  }
  const CLASS_GUIDES = [
    { key: "lock", title: "화면 잠금", text: "학생 화면을 지금 쪽에 고정합니다. 학생이 마음대로 넘기지 못합니다.", place: "below" },
    { key: "monitor", title: "모니터링", text: "접속한 학생 화면을 한눈에 봅니다. 누가 어느 쪽을 보고 있는지 확인할 수 있습니다.", place: "below" },
    { key: "focus", title: "주목하기", text: "학생 화면을 가리고, 선생님 화면으로 시선을 모읍니다.", place: "below" },
    { key: "pen", title: "판서", text: "수업 화면 위에 바로 쓰거나 지울 수 있습니다.", place: "below" },
    { key: "book", title: "수학익힘", text: "수업 중 진도에 맞는 수학익힘을 바로 엽니다.", place: "above" },
    { key: "tools", title: "수업 도구", text: "모둠 구성, 발표자 뽑기, 자리 바꾸기, 룰렛을 수업 안에서 켭니다.", place: "above" },
    { key: "game", title: "수학 게임", text: "학생이 게임으로 개념을 익히도록 켭니다.", place: "above" },
    { key: "ai", title: "AI 수학교구", text: "도형 교구처럼 AI 수학교구를 수업 중에 엽니다.", place: "above" }
  ];
  let guideIndex = 0;
  function lobbyToast(msg, onHide) {
    const el = $("#lobbyToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(lobbyToast._t);
    lobbyToast._t = setTimeout(() => {
      el.classList.remove("show");
      if (typeof onHide === "function") setTimeout(onHide, 220);
    }, 2200);
  }
  function placeMenuTip() {
    const swTip = document.body.classList.contains("is-eval-sw-tip");
    const roundTip = document.body.classList.contains("is-eval-tip");
    const setTip = document.body.classList.contains("is-eval-set-tip");
    const paperTip = document.body.classList.contains("is-eval-paper-tip");
    const dueTip = document.body.classList.contains("is-eval-due-tip");
    const wrongTip = document.body.classList.contains("is-eval-wrong-tip");
    const sendTip = document.body.classList.contains("is-dash-send-tip");
    const commentTip = document.body.classList.contains("is-dash-comment-tip");
    const achieveTip = document.body.classList.contains("is-dash-achieve-tip");
    const starTip = document.body.classList.contains("is-dash-star-tip");
    const reportTip = document.body.classList.contains("is-dash-report-tip");
    const pdfTip = document.body.classList.contains("is-dash-pdf-tip");
    const scoreTip = document.body.classList.contains("is-dash-score-tip");
    const selfTip = document.body.classList.contains("is-self-manage-tip");
    const rankTip = document.body.classList.contains("is-self-rank-tip");
    const cellTip = document.body.classList.contains("is-self-cell-tip");
    const taskTip = document.body.classList.contains("is-self-task-tip");
    const gameTip = document.body.classList.contains("is-self-game-tip");
    const selfDueTip = document.body.classList.contains("is-self-due-tip");
    const playTip = document.body.classList.contains("is-self-play-tip");
    const btn = swTip
      ? $("#lobbyEvalSwitch")
      : roundTip
        ? $("#lobbyEvalRound")
        : setTip
          ? $("#lobbyEvalSet")
          : paperTip
            ? $("#lobbyEvalPaper")
            : dueTip
              ? $("#lobbyEvalDue")
              : wrongTip
                ? $("#lobbyEvalWrong")
                : sendTip
                  ? $("#lobbyDashSend")
                  : commentTip
                    ? $("#lobbyDashComment")
                    : achieveTip
                      ? $("#lobbyDashAchieve")
                      : starTip
                        ? document.querySelector('#starRate button[data-star="3"]')
                        : reportTip
                          ? $("#lobbyDashReport")
                          : pdfTip
                            ? $("#lobbyDashPdf")
                            : scoreTip
                              ? $("#lobbyDashScore")
                              : selfTip
                                ? $("#lobbySelfManage")
                                : rankTip
                                  ? $("#lobbySelfRankSpot")
                                  : taskTip
                                    ? $("#lobbySelfTaskSpot")
                                    : gameTip
                                      ? $("#lobbySelfGameSpot")
                                      : selfDueTip
                                      ? $("#lobbySelfDueSpot")
                                      : document.querySelector(".lobby-hot.guide.is-on");
    const tip = $("#menuTip");
    const frame = $(".lobby-shot-fit");
    if (!tip || !frame) return;
    if (!btn && !cellTip && !playTip) return;
    if (!swTip && !roundTip && !setTip && !paperTip && !dueTip && !wrongTip && !sendTip && !commentTip && !achieveTip && !starTip && !reportTip && !pdfTip && !scoreTip && !selfTip && !rankTip && !cellTip && !taskTip && !gameTip && !selfDueTip && !playTip && !document.body.classList.contains("is-lobby-class")) return;
    const frameBox = frame.getBoundingClientRect();
    tip.classList.remove("is-parked", "is-point-left", "is-point-right", "is-below", "is-above");
    if (cellTip || playTip) {
      const tipW = tip.offsetWidth || 360;
      const tipH = tip.offsetHeight || 110;
      if (playTip) {
        const left = Math.max(12, Math.min(frameBox.width * 0.36, frameBox.width - tipW - 12));
        const top = Math.max(12, frameBox.height * 0.08);
        tip.style.left = `${Math.round(left)}px`;
        tip.style.top = `${Math.round(top)}px`;
      } else {
        tip.style.left = `${Math.round(Math.max(12, (frameBox.width - tipW) / 2))}px`;
        tip.style.top = `${Math.round(Math.max(12, (frameBox.height - tipH) / 2))}px`;
      }
      tip.classList.add("is-parked");
      return;
    }
    const box = btn.getBoundingClientRect();
    if (setTip) {
      const tipW = tip.offsetWidth || 190;
      const tipH = tip.offsetHeight || 69;
      const menuTop = box.bottom - frameBox.top + 4;
      const menuH = box.height * 1.25;
      let left = box.right - frameBox.left + 14;
      let top = menuTop + (menuH - tipH) / 2;
      left = Math.max(12, Math.min(left, frameBox.width - tipW - 12));
      top = Math.max(12, Math.min(top, frameBox.height - tipH - 12));
      const targetMid = menuTop + menuH / 2;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.style.setProperty("--arrow-y", `${Math.round(Math.max(18, Math.min(targetMid - top, tipH - 18)))}px`);
      tip.classList.add("is-point-left");
      return;
    }
    if (paperTip) {
      const tipW = tip.offsetWidth || 210;
      const tipH = tip.offsetHeight || 72;
      let left = box.left - frameBox.left + box.width / 2 - tipW / 2;
      left = Math.max(12, Math.min(left, frameBox.width - tipW - 28));
      const top = box.bottom - frameBox.top + 14;
      const arrowX = box.left - frameBox.left + box.width / 2 - left;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.style.setProperty("--arrow-x", `${Math.round(Math.max(18, Math.min(arrowX, tipW - 18)))}px`);
      tip.classList.add("is-below");
      return;
    }
    if (achieveTip) {
      const tipW = tip.offsetWidth || 340;
      const tipH = tip.offsetHeight || 130;
      let left = box.left - frameBox.left - tipW - 18;
      left = Math.max(12, Math.min(left, frameBox.width - tipW - 12));
      let top = box.top - frameBox.top + (box.height - tipH) / 2;
      top = Math.max(12, Math.min(top, frameBox.height - tipH - 12));
      const targetMid = box.top - frameBox.top + box.height / 2;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.style.setProperty("--arrow-y", `${Math.round(Math.max(18, Math.min(targetMid - top, tipH - 18)))}px`);
      tip.classList.add("is-point-right");
      return;
    }
    if (commentTip) {
      const tipW = tip.offsetWidth || 280;
      const tipH = tip.offsetHeight || 90;
      let left = box.left - frameBox.left + box.width / 2 - tipW / 2;
      left = Math.max(12, Math.min(left, frameBox.width - tipW - 12));
      const top = box.bottom - frameBox.top + 16;
      const arrowX = box.left - frameBox.left + box.width / 2 - left;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.style.setProperty("--arrow-x", `${Math.round(Math.max(18, Math.min(arrowX, tipW - 18)))}px`);
      tip.classList.add("is-below");
      return;
    }
    if (starTip) {
      const row = document.querySelector("#starRate");
      const rowBox = row ? row.getBoundingClientRect() : box;
      const tipW = tip.offsetWidth || 240;
      const tipH = tip.offsetHeight || 72;
      let left = rowBox.left - frameBox.left - tipW - 20;
      left = Math.max(12, left);
      let top = rowBox.top - frameBox.top + (rowBox.height - tipH) / 2;
      top = Math.max(12, Math.min(top, frameBox.height - tipH - 12));
      const targetMid = rowBox.top - frameBox.top + rowBox.height / 2;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.style.setProperty("--arrow-y", `${Math.round(Math.max(18, Math.min(targetMid - top, tipH - 18)))}px`);
      tip.classList.add("is-point-right");
      return;
    }
    if (scoreTip) {
      const tipW = tip.offsetWidth || 460;
      const tipH = tip.offsetHeight || 110;
      let left = box.left - frameBox.left + box.width / 2 - tipW / 2;
      left = Math.max(12, Math.min(left, frameBox.width - tipW - 12));
      const top = Math.max(12, box.top - frameBox.top - tipH - 14);
      const arrowX = box.left - frameBox.left + box.width / 2 - left;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.style.setProperty("--arrow-x", `${Math.round(Math.max(18, Math.min(arrowX, tipW - 18)))}px`);
      tip.classList.add("is-above");
      return;
    }
    if (pdfTip) {
      const tipW = tip.offsetWidth || 280;
      const tipH = tip.offsetHeight || 80;
      let left = box.left - frameBox.left - tipW - 16;
      left = Math.max(12, Math.min(left, frameBox.width - tipW - 12));
      let top = box.top - frameBox.top + (box.height - tipH) / 2;
      top = Math.max(12, Math.min(top, frameBox.height - tipH - 12));
      const targetMid = box.top - frameBox.top + box.height / 2;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.style.setProperty("--arrow-y", `${Math.round(Math.max(18, Math.min(targetMid - top, tipH - 18)))}px`);
      tip.classList.add("is-point-right");
      return;
    }
    if (gameTip) {
      const tipW = tip.offsetWidth || 420;
      const tipH = tip.offsetHeight || 90;
      let left = box.left - frameBox.left;
      let top = box.top - frameBox.top;
      left = Math.max(12, Math.min(left, frameBox.width - tipW - 12));
      top = Math.max(12, Math.min(top, frameBox.height - tipH - 12));
      const buttonCenter = frameBox.width * 0.5206;
      const arrowX = buttonCenter - left;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.style.setProperty("--arrow-x", `${Math.round(Math.max(18, Math.min(arrowX, tipW - 18)))}px`);
      tip.classList.add("is-above");
      return;
    }
    if (selfDueTip) {
      const tipW = tip.offsetWidth || 420;
      const tipH = tip.offsetHeight || 80;
      let left = box.left - frameBox.left;
      let top = box.top - frameBox.top;
      left = Math.max(12, Math.min(left, frameBox.width - tipW - 12));
      top = Math.max(12, Math.min(top, frameBox.height - tipH - 12));
      const targetMid = frameBox.height * 0.838;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.style.setProperty("--arrow-y", `${Math.round(Math.max(18, Math.min(targetMid - top, tipH - 18)))}px`);
      tip.classList.add("is-point-left");
      return;
    }
    if (taskTip) {
      const tipW = tip.offsetWidth || 420;
      const tipH = tip.offsetHeight || 120;
      let left = box.left - frameBox.left;
      let top = box.top - frameBox.top;
      left = Math.max(12, Math.min(left, frameBox.width - tipW - 12));
      top = Math.max(12, Math.min(top, frameBox.height - tipH - 12));
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.classList.add("is-parked");
      return;
    }
    if (rankTip) {
      const tipW = tip.offsetWidth || 380;
      const tipH = tip.offsetHeight || 120;
      let left = box.left - frameBox.left;
      let top = box.top - frameBox.top;
      left = Math.max(12, Math.min(left, frameBox.width - tipW - 12));
      top = Math.max(12, Math.min(top, frameBox.height - tipH - 12));
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.classList.add("is-parked");
      return;
    }
    if (selfTip) {
      const tipW = tip.offsetWidth || 420;
      const tipH = tip.offsetHeight || 110;
      let left = box.left - frameBox.left + box.width / 2 - tipW / 2;
      left = Math.max(12, Math.min(left, frameBox.width - tipW - 12));
      const top = box.bottom - frameBox.top + 14;
      const arrowX = box.left - frameBox.left + box.width / 2 - left;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.style.setProperty("--arrow-x", `${Math.round(Math.max(18, Math.min(arrowX, tipW - 18)))}px`);
      tip.classList.add("is-below");
      return;
    }
    if (reportTip) {
      const tipW = tip.offsetWidth || 360;
      const tipH = tip.offsetHeight || 110;
      let left = box.left - frameBox.left + box.width / 2 - tipW / 2;
      left = Math.max(12, Math.min(left, frameBox.width - tipW - 12));
      const top = box.bottom - frameBox.top + 14;
      const arrowX = box.left - frameBox.left + box.width / 2 - left;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.style.setProperty("--arrow-x", `${Math.round(Math.max(18, Math.min(arrowX, tipW - 18)))}px`);
      tip.classList.add("is-below");
      return;
    }
    if (sendTip) {
      const tipW = tip.offsetWidth || 320;
      const tipH = tip.offsetHeight || 72;
      let left = box.left - frameBox.left + box.width / 2 - tipW / 2;
      left = Math.max(12, Math.min(left, frameBox.width - tipW - 12));
      const top = Math.max(12, box.top - frameBox.top - tipH - 14);
      const arrowX = box.left - frameBox.left + box.width / 2 - left;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.style.setProperty("--arrow-x", `${Math.round(Math.max(18, Math.min(arrowX, tipW - 18)))}px`);
      tip.classList.add("is-above");
      return;
    }
    if (dueTip || wrongTip) {
      const tipW = tip.offsetWidth || 240;
      const tipH = tip.offsetHeight || 80;
      let left = box.right - frameBox.left + 16;
      let top = box.top - frameBox.top + (box.height - tipH) / 2;
      if (left + tipW > frameBox.width - 12) left = frameBox.width - tipW - 12;
      top = Math.max(12, Math.min(top, frameBox.height - tipH - 12));
      const targetMid = box.top - frameBox.top + box.height / 2;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.style.setProperty("--arrow-y", `${Math.round(Math.max(18, Math.min(targetMid - top, tipH - 18)))}px`);
      tip.classList.add("is-point-left");
      return;
    }
    const place = swTip ? "above" : paperTip || roundTip ? "below" : (CLASS_GUIDES[guideIndex]?.place || "below");
    const tipW = tip.offsetWidth || 280;
    const tipH = tip.offsetHeight || 96;
    let left = box.left - frameBox.left + box.width / 2 - tipW / 2;
    left = Math.max(12, Math.min(left, frameBox.width - tipW - 12));
    const top = place === "below"
      ? box.bottom - frameBox.top + 16
      : box.top - frameBox.top - tipH - 16;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    tip.style.setProperty("--arrow-x", `${Math.round(box.left - frameBox.left + box.width / 2 - left)}px`);
    tip.classList.toggle("is-below", place === "below");
    tip.classList.toggle("is-above", place !== "below");
  }
  function setGuide(index) {
    guideIndex = index;
    const step = CLASS_GUIDES[index];
    $$(".lobby-hot.guide").forEach((btn) => btn.classList.toggle("is-on", btn.dataset.guide === step?.key));
    if (!step) return;
    const stepEl = $("#menuTipStep");
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (stepEl) stepEl.textContent = `${index + 1}/${CLASS_GUIDES.length}`;
    if (titleEl) titleEl.textContent = step.title;
    if (textEl) textEl.textContent = step.text;
    if (nextEl) nextEl.textContent = index === CLASS_GUIDES.length - 1
      ? "반짝이는 곳을 누르면 안내가 끝납니다"
      : "반짝이는 곳을 누르면 다음 설명";
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  function showLobbyView(name) {
    document.body.classList.toggle("is-lobby-lesson", name === "lesson");
    document.body.classList.toggle("is-lobby-design", name === "design");
    document.body.classList.toggle("is-lobby-class", name === "class");
    document.body.classList.toggle("is-lobby-eval", name === "eval");
    document.body.classList.toggle("is-lobby-eval-open", name === "eval-open");
    document.body.classList.toggle("is-lobby-eval-form", name === "eval-form");
    document.body.classList.toggle("is-lobby-eval-form-open", name === "eval-form-open");
    document.body.classList.toggle("is-lobby-eval-unit", name === "eval-unit");
    document.body.classList.toggle("is-lobby-dash", name === "dash");
    document.body.classList.toggle("is-lobby-dash-scroll", name === "dash-scroll");
    document.body.classList.toggle("is-lobby-dash-detail", name === "dash-detail");
    document.body.classList.toggle("is-lobby-dash-report", name === "dash-report");
    document.body.classList.toggle("is-lobby-dash-pdf", name === "dash-pdf");
    document.body.classList.toggle("is-lobby-dash-score", name === "dash-score");
    document.body.classList.toggle("is-lobby-self", name === "self");
    document.body.classList.toggle("is-lobby-self-rank", name === "self-rank");
    document.body.classList.toggle("is-lobby-self-cell", name === "self-cell");
    document.body.classList.toggle("is-lobby-self-task", name === "self-task");
    document.body.classList.toggle("is-lobby-self-content", name === "self-content");
    document.body.classList.toggle("is-lobby-self-unit01", name === "self-unit01");
    document.body.classList.toggle("is-lobby-self-unit", name === "self-unit");
    document.body.classList.toggle("is-lobby-self-lesson", name === "self-lesson");
    document.body.classList.toggle("is-lobby-self-lesson01", name === "self-lesson01");
    document.body.classList.toggle("is-lobby-self-lesson02", name === "self-lesson02");
    document.body.classList.toggle("is-lobby-self-lesson03", name === "self-lesson03");
    document.body.classList.toggle("is-lobby-self-play", name === "self-play");
    if (name !== "dash") document.body.classList.remove("is-dash-comment-tip");
    if (name !== "dash-scroll") document.body.classList.remove("is-dash-achieve-tip");
    if (name !== "dash-scroll") document.body.classList.remove("is-dash-seen");
    if (name !== "dash-detail") document.body.classList.remove("is-dash-rated", "is-dash-send-tip", "is-dash-sent", "is-dash-star-tip");
    if (name !== "dash-report") document.body.classList.remove("is-dash-report-tip", "is-dash-pdf-tip");
    if (name !== "dash-score") document.body.classList.remove("is-dash-score-tip");
    if (name !== "self") document.body.classList.remove("is-self-manage-tip", "is-self-detail");
    if (name !== "self-rank") document.body.classList.remove("is-self-rank-tip", "is-self-rank-task");
    if (name !== "self-cell") document.body.classList.remove("is-self-cell-tip");
    if (name === "self-task") document.body.classList.remove("is-self-game-tip");
    if (name !== "self-task") document.body.classList.remove("is-self-task-tip", "is-self-game-tip");
    if (name !== "self-lesson03") document.body.classList.remove("is-self-due-tip");
    if (name !== "self-play") document.body.classList.remove("is-self-play-tip");
    if (name === "dash-detail") {
      document.body.classList.remove("is-dash-rated", "is-dash-send-tip", "is-dash-sent");
      setStars(0);
      showDashStarTip();
    }
    if (name !== "eval-form-open") document.body.classList.remove("is-eval-set-tip");
    if (name !== "eval-unit") document.body.classList.remove("is-eval-paper-tip", "is-eval-due-tip", "is-eval-wrong-tip");
    if (name !== "eval-open") {
      document.body.classList.remove("is-eval-round", "is-eval-tip", "is-eval-sw-tip");
      const sw = $("#lobbyEvalSwitch");
      if (sw) {
        sw.classList.remove("is-on");
        sw.setAttribute("aria-pressed", "false");
        sw.setAttribute("aria-label", "3. 소수의 덧셈과 뺄셈 잠김");
      }
    }
    $$(".lobby-view").forEach((img) => img.classList.toggle("is-on", img.dataset.lobbyView === name));
    if (name === "class") setGuide(0);
    if (name === "eval-open") showEvalSwitchTip();
    if (name === "dash") showDashCommentTip();
    if (name === "dash-scroll") showDashAchieveTip();
    if (name === "dash-report") showDashReportTip();
    if (name === "dash-score") showDashScoreTip();
    if (name === "self") showSelfManageTip();
    if (name === "self-rank") showSelfRankTip();
    if (name === "self-cell") showSelfCellTip();
    if (name === "self-task") showSelfTaskTip();
    if (name === "self-lesson03") showSelfDueTip();
    if (name === "self-play") {
      setPlayCard("class");
      showSelfPlayTip();
    }
  }
  function showEvalSwitchTip() {
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = "평가 열기(잠김/열림)";
    if (textEl) textEl.innerHTML = "잠김이면 학생이 이 평가를 볼 수 없습니다.<br>열림으로 바꾸면 3. 소수의 덧셈과 뺄셈<br>진단 평가를 학생이 응시할 수 있습니다.";
    if (nextEl) nextEl.textContent = "";
    document.body.classList.remove("is-eval-tip");
    document.body.classList.add("is-eval-sw-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  $("#lobbyMenuHome")?.addEventListener("click", () => showLobbyView("home"));
  $("#lobbyMenuLesson")?.addEventListener("click", () => {
    demoSteps.lesson = true;
    showLobbyView("lesson");
  });
  $("#lobbyDesign")?.addEventListener("click", () => {
    if (demoSteps.lesson) demoSteps.design = true;
    showLobbyView("design");
  });
  $("#lobbyDesignBack")?.addEventListener("click", () => showLobbyView("lesson"));

  const fit = $(".lobby-shot-fit");
  const picks = [$("#pick1"), $("#pick2")].filter(Boolean);
  const bundle = $("#bundle");
  const slot = $("#dropSlot");
  function bothPicked() {
    return picks.length === 2 && picks.every((btn) => btn.classList.contains("is-on"));
  }
  function refreshBundle() {
    const parked = bundle?.classList.contains("parked");
    const ready = bothPicked() && !parked;
    bundle?.classList.toggle("show", ready);
    slot?.classList.toggle("show", ready);
    if (!bothPicked() && bundle) {
      bundle.classList.remove("parked", "dragging", "show");
      bundle.style.left = "";
      bundle.style.top = "";
      slot?.classList.remove("show", "over");
      document.body.classList.remove("is-ready-start");
    }
  }
  picks.forEach((btn) => {
    btn.addEventListener("click", () => {
      const on = !btn.classList.contains("is-on");
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (demoSteps.design && bothPicked()) demoSteps.picked = true;
      refreshBundle();
    });
  });
  let drag = null;
  bundle?.addEventListener("pointerdown", (e) => {
    if (!bundle.classList.contains("show") || !fit) return;
    const frame = fit.getBoundingClientRect();
    const box = bundle.getBoundingClientRect();
    drag = {
      dx: e.clientX - box.left,
      dy: e.clientY - box.top,
      frame,
      over: false
    };
    bundle.classList.add("dragging");
    bundle.setPointerCapture(e.pointerId);
    slot?.classList.add("show");
    e.preventDefault();
  });
  bundle?.addEventListener("pointermove", (e) => {
    if (!drag) return;
    bundle.style.left = `${e.clientX - drag.frame.left - drag.dx}px`;
    bundle.style.top = `${e.clientY - drag.frame.top - drag.dy}px`;
    const zone = slot?.getBoundingClientRect();
    const over = !!zone && e.clientX >= zone.left && e.clientX <= zone.right && e.clientY >= zone.top && e.clientY <= zone.bottom;
    drag.over = over;
    slot?.classList.toggle("over", over);
  });
  function endDrag() {
    if (!drag) return;
    bundle.classList.remove("dragging");
    if (drag.over) {
      bundle.classList.remove("show");
      bundle.classList.add("parked");
      bundle.style.left = "";
      bundle.style.top = "";
      slot?.classList.remove("show", "over");
      if (demoSteps.picked) {
        demoSteps.dropped = true;
        document.body.classList.add("is-ready-start");
        lobbyToast("오른쪽 위 수업 시작을 누르세요.");
      }
    } else {
      bundle.style.left = "";
      bundle.style.top = "";
      slot?.classList.remove("over");
      slot?.classList.add("show");
    }
    drag = null;
  }
  bundle?.addEventListener("pointerup", endDrag);
  bundle?.addEventListener("pointercancel", endDrag);
  $("#lobbyMenuEval")?.addEventListener("click", () => {
    if (!document.documentElement.classList.contains("is-eval-home")) return;
    showLobbyView("eval");
  });
  $("#lobbyEvalOpen")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-eval")) return;
    showLobbyView("eval-open");
  });
  $("#lobbyEvalSwitch")?.addEventListener("click", () => {
    const btn = $("#lobbyEvalSwitch");
    if (!btn || !document.body.classList.contains("is-lobby-eval-open")) return;
    const on = !btn.classList.contains("is-on");
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "3. 소수의 덧셈과 뺄셈 열림" : "3. 소수의 덧셈과 뺄셈 잠김");
    document.body.classList.toggle("is-eval-round", on);
    if (on) document.body.classList.remove("is-eval-sw-tip");
    else showEvalSwitchTip();
  });
  $("#lobbyEvalRound")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-eval-round")) return;
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = "평가 2세트 제공<br>(형성, 단원평가)";
    if (textEl) textEl.innerHTML = "2차 평가는 수업 진도와 상관없이<br>직접 열어야 학생이 응시할 수 있습니다.<br>아직 수업하지 않은 차시도 함께 열릴 수 있습니다.";
    if (nextEl) nextEl.textContent = "";
    document.body.classList.remove("is-eval-sw-tip");
    document.body.classList.add("is-eval-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  });
  $("#lobbyEvalForm")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-eval-tip")) return;
    showLobbyView("eval-form");
  });
  function showEvalSetTip() {
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = "학생들의 1차, 2차<br>평가 관리가 가능합니다.";
    if (textEl) textEl.innerHTML = "";
    if (nextEl) nextEl.textContent = "";
    document.body.classList.add("is-eval-set-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  $("#lobbyEvalSet")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-eval-form")) return;
    showLobbyView("eval-form-open");
    showEvalSetTip();
  });
  function showUnitTip(kind) {
    const copy = {
      paper: "학생들이 응시한 시험지를<br>확인할 수 있습니다.",
      due: "기본적으로 +4주로 자동 설정되며,<br>마감일 전에는 원하시는 마감일로<br>변경할 수 있습니다.",
      wrong: "우리반 학생들의 정답률 높은 문항,<br>오답률 높은 문항들을 바로 확인할 수 있습니다."
    };
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = copy[kind] || "";
    if (textEl) textEl.innerHTML = "";
    if (nextEl) nextEl.textContent = "";
    document.body.classList.remove("is-eval-paper-tip", "is-eval-due-tip", "is-eval-wrong-tip");
    document.body.classList.add(kind === "paper" ? "is-eval-paper-tip" : kind === "due" ? "is-eval-due-tip" : "is-eval-wrong-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  $("#lobbyEvalUnit")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-eval-set-tip")) return;
    showLobbyView("eval-unit");
  });
  $("#lobbyEvalPaper")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-eval-unit") || document.body.classList.contains("is-eval-paper-tip")) return;
    showUnitTip("paper");
  });
  $("#lobbyEvalDue")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-eval-paper-tip")) return;
    showUnitTip("due");
  });
  $("#lobbyEvalWrong")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-eval-due-tip")) return;
    showUnitTip("wrong");
    lobbyToast("평가 화면 메뉴를 모두 살펴보았습니다.", () => {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "aidt-open-self" }, "*");
      }
    });
  });
  function setStars(count) {
    $("#starRate")?.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("is-on", Number(btn.dataset.star) <= count);
    });
  }
  function showDashStarTip() {
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = "학생의 활동을 보고<br>별점으로 평가해주세요";
    if (textEl) textEl.innerHTML = "";
    if (nextEl) nextEl.textContent = "";
    document.body.classList.add("is-dash-star-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  function showDashSendTip() {
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = "실제 화면에서는<br>교사 피드백을 작성하고<br>보내기 버튼이 활성화됩니다.";
    if (textEl) textEl.innerHTML = "";
    if (nextEl) nextEl.textContent = "";
    document.body.classList.remove("is-dash-star-tip");
    document.body.classList.add("is-dash-rated", "is-dash-send-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  function showSelfManageTip() {
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = "스스로 학습 관리 메뉴는<br>우리 반 학생들의 [AI 매일수학, AI 연산] 의<br>학습 이력과 우리 반 개념 세포를<br>확인할 수 있는 메뉴입니다.";
    if (textEl) textEl.innerHTML = "";
    if (nextEl) nextEl.textContent = "반짝이는 곳을 누르면 다음 설명";
    document.body.classList.add("is-self-manage-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  function showSelfRankTip() {
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = "우리 반 학생들의 AI 매일수학, AI 연산 의<br>횟수와 평균 점수를 확인할 수 있습니다.";
    if (textEl) textEl.innerHTML = "";
    if (nextEl) nextEl.textContent = "아래 닫기 버튼을 누르면 다음 설명";
    document.body.classList.add("is-self-rank-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  function showSelfCellTip() {
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = "[우리 반 개념 세포]<br>우리 반 학생들의 개념별 이해도를<br>기준에 따라 컬러로 확인 할 수 있습니다.";
    if (textEl) textEl.innerHTML = "";
    if (nextEl) nextEl.textContent = "반짝이는 곳을 누르면 다음 설명";
    document.body.classList.add("is-self-cell-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  $("#lobbySelfClose")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-self-rank") || document.body.classList.contains("is-self-rank-task")) return;
    document.body.classList.remove("is-self-rank-tip");
    document.body.classList.add("is-self-rank-task");
  });
  $("#lobbySelfTask")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-self-rank-task")) return;
    showLobbyView("self-task");
  });
  function showSelfTaskTip() {
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = "[과제 만들기]<br>이 메뉴에서는 전체 학생 및 개별 학생,<br>그리고 성취 수준 그룹 별로<br>수학익힘 등의 과제를 출제할 수 있습니다.";
    if (textEl) textEl.innerHTML = "";
    if (nextEl) nextEl.textContent = "반짝이는 곳을 누르면 다음 설명";
    document.body.classList.add("is-self-task-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  function showSelfDueTip() {
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = "마감 기한을 지정하여 학생들에게 과제를 출제할 수 있습니다.";
    if (textEl) textEl.innerHTML = "";
    if (nextEl) nextEl.textContent = "반짝이는 곳을 클릭하면 다음 설명";
    document.body.classList.add("is-self-due-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  function showSelfGameTip() {
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = "출제한 과제들을 한 눈에 볼 수 있고,<br>[과제 확인하기] 메뉴를 통해 제출 현황 등을 관리할 수 있습니다.";
    if (textEl) textEl.innerHTML = "";
    if (nextEl) nextEl.textContent = "반짝이는 곳을 누르면 다음 설명";
    document.body.classList.add("is-self-game-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  $("#lobbySelfMake")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-self-task") || document.body.classList.contains("is-self-game-tip")) return;
    showLobbyView("self-content");
  });
  $("#lobbySelfBook")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-self-content")) return;
    showLobbyView("self-unit01");
  });
  $("#lobbySelfUnit")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-self-unit01")) return;
    showLobbyView("self-unit");
  });
  $("#lobbySelfPeriod")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-self-unit")) return;
    showLobbyView("self-lesson");
  });
  $("#lobbySelfLesson2")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-self-lesson")) return;
    showLobbyView("self-lesson01");
  });
  $("#lobbySelfLesson2b")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-self-lesson01")) return;
    showLobbyView("self-lesson02");
  });
  $("#lobbySelfLesson3")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-self-lesson02")) return;
    showLobbyView("self-lesson03");
  });
  $("#lobbySelfBack")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-self-lesson03")) return;
    showLobbyView("self-task");
    document.body.classList.remove("is-self-task-tip");
    showSelfGameTip();
  });
  $("#lobbySelfGame")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-self-game-tip")) return;
    showLobbyView("self-play");
  });
  function setPlayCard(name) {
    document.querySelectorAll(".self-play-side figure").forEach((fig) => {
      fig.classList.toggle("is-on", fig.dataset.play === name);
    });
  }
  function showSelfPlayTip() {
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = "스스로 학습의 [수학 게임]은 학생 혼자 진행하는 싱글 모드만 이용할 수 있습니다.<br>반 친구들과 함께하는 멀티 모드는 선생님께서 [수업] 메뉴에서 해당 기능을 활성화해 주셔야 이용할 수 있습니다.";
    if (textEl) textEl.innerHTML = "";
    if (nextEl) nextEl.textContent = "반짝이는 곳을 누르면 다음 설명";
    document.body.classList.add("is-self-play-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  $("#lobbyPlayGame")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-self-play")) return;
    setPlayCard("together");
  });
  $("#lobbyPlayToggle")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-self-play")) return;
    if (!document.querySelector('.self-play-side figure[data-play="together"].is-on')) return;
    lobbyToast("스스로 학습 메뉴 안내를 마칩니다.", () => {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "aidt-open-dash" }, "*");
      }
    });
  });
  $("#lobbySelfManage")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-self") || document.body.classList.contains("is-self-detail")) return;
    document.body.classList.remove("is-self-manage-tip");
    document.body.classList.add("is-self-detail");
  });
  $("#lobbySelfDetail")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-self-detail")) return;
    showLobbyView("self-rank");
  });
  $("#lobbyMenuSelf")?.addEventListener("click", () => {
    if (!document.documentElement.classList.contains("is-self-home")) return;
    showLobbyView("self");
  });
  $("#lobbyMenuDash")?.addEventListener("click", () => {
    if (!document.documentElement.classList.contains("is-dash-home")) return;
    showLobbyView("dash");
  });
  function showDashCommentTip() {
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = "AI 보조교사 샘버디가 요약하는<br>우리반 학생들의 학습 현황을<br>코멘트로 확인할 수 있습니다.";
    if (textEl) textEl.innerHTML = "";
    if (nextEl) nextEl.textContent = "";
    document.body.classList.add("is-dash-comment-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  $("#lobbyDashDown")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-dash")) return;
    showLobbyView("dash-scroll");
  });
  function showDashAchieveTip() {
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = "이 곳에서는 우리반 학생들의<br>수업에서의 출석률, 평균 수업 점수,<br>마무리 평가 등 학습 성취 수준을<br>한 눈에 파악할 수 있습니다.";
    if (textEl) textEl.innerHTML = "";
    if (nextEl) nextEl.textContent = "반짝이는 곳을 누르면 다음 설명";
    document.body.classList.add("is-dash-achieve-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  $("#lobbyDashDetail")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-dash-scroll")) return;
    showLobbyView("dash-detail");
  });
  $("#starRate")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || !document.body.classList.contains("is-lobby-dash-detail") || document.body.classList.contains("is-dash-rated")) return;
    if (btn.dataset.star !== "3") return;
    setStars(3);
    showDashSendTip();
  });
  function showDashReportTip() {
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = "평가 리포트 메뉴에서는<br>우리 반 학생들의 단원 평가 및<br>단원별 형성 평가, 총괄 평가,<br>상세 성취도 관리가 가능합니다.";
    if (textEl) textEl.innerHTML = "";
    if (nextEl) nextEl.textContent = "반짝이는 곳을 누르면 다음 설명";
    document.body.classList.add("is-dash-report-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  function showDashPdfTip() {
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = "반 학생별로 평가 리포트를<br>PDF 형태로 다운로드 할 수 있습니다.";
    if (textEl) textEl.innerHTML = "";
    if (nextEl) nextEl.textContent = "반짝이는 곳을 누르면 다음 설명";
    document.body.classList.remove("is-dash-report-tip");
    document.body.classList.add("is-dash-pdf-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  $("#lobbyDashReport")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-dash-report") || document.body.classList.contains("is-dash-pdf-tip")) return;
    showDashPdfTip();
  });
  $("#lobbyDashPdf")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-dash-pdf-tip")) return;
    showLobbyView("dash-pdf");
  });
  function showDashScoreTip() {
    const titleEl = $("#menuTipTitle");
    const textEl = $("#menuTipText");
    const nextEl = $("#menuTipNext");
    if (titleEl) titleEl.innerHTML = "학생별 평가(진단·형성·단원 1·2차) 점수가<br>구간별 색상으로 표시되어 성취도를 한눈에 파악할 수 있습니다.";
    if (textEl) textEl.innerHTML = "";
    if (nextEl) nextEl.textContent = "";
    document.body.classList.add("is-dash-score-tip");
    requestAnimationFrame(() => requestAnimationFrame(placeMenuTip));
  }
  $("#lobbyDashClose")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-lobby-dash-pdf")) return;
    showLobbyView("dash-score");
    lobbyToast("주요 기능 안내를 마칩니다.");
  });
  $("#lobbyDashSend")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-dash-rated")) return;
    showLobbyView("dash-report");
  });
  $("#lobbyClassStart")?.addEventListener("click", () => {
    if (!document.body.classList.contains("is-ready-start")) return;
    showLobbyView("class");
  });
  document.querySelector(".lobby-shot-fit")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".lobby-hot.guide.is-on");
    if (!btn || !document.body.classList.contains("is-lobby-class")) return;
    if (guideIndex >= CLASS_GUIDES.length - 1) {
      document.body.classList.add("is-guide-done");
      $$(".lobby-hot.guide").forEach((el) => el.classList.remove("is-on"));
      lobbyToast("수업 화면 메뉴를 모두 살펴보았습니다.", () => {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: "aidt-open-eval" }, "*");
        }
      });
      notifyDemoDone();
      return;
    }
    setGuide(guideIndex + 1);
  });
})();
