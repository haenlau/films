const RESOLVED_LIBRARY_URL = "./data/library.resolved.json";
const SOURCE_LIBRARY_URL = "./data/library.json";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/";
const MOVIE_DB_BASE_URL = "https://api.themoviedb.org/3";
const BROWSER_REQUEST_INTERVAL_MS = 120;
const STORAGE_KEY = "film-vault.local-draft.v3";

let lastBrowserRequestAt = 0;

const state = {
  library: {
    title: "我的电影墙",
    subtitle: "一面为私人观影史准备的电影墙，用沉浸式视觉把每一次观看变成可回看的馆藏。",
    movies: [],
  },
  sourceLibrary: {
    title: "我的电影墙",
    subtitle: "一面为私人观影史准备的电影墙，用沉浸式视觉把每一次观看变成可回看的馆藏。",
    entries: [],
  },
  activeGenre: "all",
  featuredMovieId: null,
  searchResults: [],
  admin: {
    mode: "none",
    apiKey: "",
    localAvailable: false,
    localAuthenticated: false,
    localPassword: "",
    remoteAvailable: false,
    remoteAuthenticated: false,
    remoteSeeded: false,
    menuOpen: false,
  },
};

const elements = {
  pageTitle: document.getElementById("pageTitle"),
  pageSubtitle: document.getElementById("pageSubtitle"),
  statusCopy: document.getElementById("statusCopy"),
  userHub: document.getElementById("userHub"),
  userMenu: document.getElementById("userMenu"),
  userMenuButton: document.getElementById("userMenuButton"),
  adminLoginButton: document.getElementById("adminLoginButton"),
  adminLogoutButton: document.getElementById("adminLogoutButton"),
  openSearch: document.getElementById("openSearch"),
  exportSource: document.getElementById("exportSource"),
  exportResolved: document.getElementById("exportResolved"),
  movieWall: document.getElementById("movieWall"),
  resultsMeta: document.getElementById("resultsMeta"),
  statCount: document.getElementById("statCount"),
  statRating: document.getElementById("statRating"),
  statDecades: document.getElementById("statDecades"),
  statRegions: document.getElementById("statRegions"),
  librarySearch: document.getElementById("librarySearch"),
  sortSelect: document.getElementById("sortSelect"),
  regionSelect: document.getElementById("regionSelect"),
  ratingRange: document.getElementById("ratingRange"),
  ratingRangeValue: document.getElementById("ratingRangeValue"),
  genreChips: document.getElementById("genreChips"),
  heroBackdrop: document.getElementById("heroBackdrop"),
  heroTitle: document.getElementById("heroTitle"),
  heroOverview: document.getElementById("heroOverview"),
  heroMeta: document.getElementById("heroMeta"),
  heroTags: document.getElementById("heroTags"),
  heroShuffleButton: document.getElementById("heroShuffleButton"),
  detailDrawer: document.getElementById("detailDrawer"),
  detailContent: document.getElementById("detailContent"),
  closeDetail: document.getElementById("closeDetail"),
  searchModal: document.getElementById("searchModal"),
  closeSearchModal: document.getElementById("closeSearchModal"),
  tmdbSearchForm: document.getElementById("tmdbSearchForm"),
  tmdbSearchInput: document.getElementById("tmdbSearchInput"),
  searchResults: document.getElementById("searchResults"),
  loginModal: document.getElementById("loginModal"),
  closeLoginModal: document.getElementById("closeLoginModal"),
  loginTitle: document.getElementById("loginTitle"),
  loginCopy: document.getElementById("loginCopy"),
  adminLoginForm: document.getElementById("adminLoginForm"),
  adminPasswordInput: document.getElementById("adminPasswordInput"),
  loginMessage: document.getElementById("loginMessage"),
  toast: document.getElementById("toast"),
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  configureLocalAdminMode();
  bindEvents();
  await bootstrapLibrary();
}

function configureLocalAdminMode() {
  const config = window.FILM_VAULT_ADMIN || {};
  if (window.location.protocol === "file:" && config.apiKey) {
    state.admin.localAvailable = true;
    state.admin.apiKey = String(config.apiKey).trim();
    state.admin.localPassword = String(config.password || "").trim();
  }

  updateAdminUi();
}

function bindEvents() {
  elements.librarySearch.addEventListener("input", renderLibrary);
  elements.sortSelect.addEventListener("change", renderLibrary);
  elements.regionSelect.addEventListener("change", renderLibrary);
  elements.ratingRange.addEventListener("input", () => {
    elements.ratingRangeValue.textContent = `${Number(elements.ratingRange.value).toFixed(1)}+`;
    renderLibrary();
  });

  elements.heroShuffleButton.addEventListener("click", shuffleFeaturedMovie);
  elements.closeDetail.addEventListener("click", closeDetailDrawer);

  elements.userMenuButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    setUserMenuOpen(!state.admin.menuOpen);
  });

  elements.openSearch?.addEventListener("click", () => {
    syncSearchModalCopy();
    setUserMenuOpen(false);
    openModal(elements.searchModal);
  });
  elements.exportSource?.addEventListener("click", () => {
    exportSourceLibrary();
    setUserMenuOpen(false);
  });
  elements.exportResolved?.addEventListener("click", () => {
    exportResolvedLibrary();
    setUserMenuOpen(false);
  });
  elements.adminLoginButton?.addEventListener("click", () => {
    setUserMenuOpen(false);
    syncLoginModalCopy();
    openModal(elements.loginModal);
  });
  elements.adminLogoutButton?.addEventListener("click", handleRemoteLogout);

  elements.closeSearchModal?.addEventListener("click", () => closeModal(elements.searchModal));
  elements.closeLoginModal?.addEventListener("click", () => closeModal(elements.loginModal));
  elements.tmdbSearchForm?.addEventListener("submit", handleSearchSubmit);
  elements.adminLoginForm?.addEventListener("submit", handleRemoteLogin);

  [elements.searchModal, elements.loginModal].forEach((modal) => {
    modal?.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeModal(modal);
      }
    });
  });

  document.addEventListener("click", (event) => {
    if (!elements.userHub?.contains(event.target)) {
      setUserMenuOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setUserMenuOpen(false);
      closeDetailDrawer();
      closeModal(elements.searchModal);
      closeModal(elements.loginModal);
    }
  });
}

async function bootstrapLibrary() {
  renderLoadingWall();
  await initializeRemoteAdmin();

  try {
    const [sourceLibrary, resolvedLibrary] = await Promise.all([
      loadSourceLibrary(),
      loadResolvedLibrary(),
    ]);

    state.sourceLibrary = sourceLibrary;
    state.library = resolvedLibrary;

    if (state.admin.mode === "local") {
      applyLocalDraft();
    }

    elements.pageTitle.textContent = state.library.title;
    elements.pageSubtitle.textContent = state.library.subtitle;

    buildRegionOptions();
    renderGenreChips();
    updateStats();
    updateFeaturedMovie();
    renderLibrary();
  } catch (error) {
    console.error(error);
    elements.resultsMeta.textContent = "片库数据加载失败，请检查 data 文件或远程配置。";
    elements.movieWall.innerHTML = `
      <div class="empty-state">
        未读取到片库数据。若本地双击打开，请确认 <code>data/library.resolved.js</code> 存在；
        若要部署到 Cloudflare，请先配置 KV 与管理员密钥。
      </div>
    `;
    showToast("未读取到片库数据。");
  }
}

async function initializeRemoteAdmin() {
  if (!/^https?:$/.test(window.location.protocol)) {
    updateAdminUi();
    return;
  }

  try {
    const response = await fetch("/api/admin/session", {
      method: "GET",
      credentials: "include",
      headers: { "Cache-Control": "no-store" },
    });

    if (!response.ok) {
      updateAdminUi();
      return;
    }

    const payload = await response.json();
    state.admin.remoteAvailable = Boolean(payload.available);
    state.admin.remoteAuthenticated = Boolean(payload.authenticated);
    state.admin.remoteSeeded = Boolean(payload.seeded);

    if (state.admin.remoteAuthenticated) {
      state.admin.mode = "remote";
    } else if (state.admin.mode !== "local") {
      state.admin.mode = "none";
    }
  } catch (error) {
    console.warn("远程管理接口不可用，继续使用静态预览模式。", error);
  }

  updateAdminUi();
}

function updateAdminUi() {
  const isLocalAdmin = state.admin.mode === "local" && state.admin.localAuthenticated;
  const isRemoteAdmin = state.admin.mode === "remote" && state.admin.remoteAuthenticated;
  const canAttemptLocalLogin = state.admin.localAvailable && !state.admin.localAuthenticated;
  const canAttemptRemoteLogin = !state.admin.localAvailable && /^https?:$/.test(window.location.protocol);
  const canManage = isLocalAdmin || isRemoteAdmin;

  elements.openSearch.hidden = !canManage;
  elements.exportSource.hidden = !isLocalAdmin;
  elements.exportResolved.hidden = !isLocalAdmin;
  elements.adminLoginButton.hidden = !(canAttemptLocalLogin || (canAttemptRemoteLogin && !state.admin.remoteAuthenticated));
  elements.adminLogoutButton.hidden = !canManage;

  if (isLocalAdmin) {
    elements.userMenuButton.textContent = "控制台 · 本地已登录";
  } else if (isRemoteAdmin) {
    elements.userMenuButton.textContent = "控制台 · 已登录";
  } else {
    elements.userMenuButton.textContent = "控制台";
  }

  if (isLocalAdmin) {
    elements.adminLogoutButton.textContent = "退出登录";
    elements.statusCopy.textContent = "本地管理员模式已启用。你可以搜索添加电影，也可以导出新的片库文件。";
  } else if (isRemoteAdmin) {
    elements.adminLogoutButton.textContent = "退出登录";
    elements.statusCopy.textContent = "你已进入管理员模式。现在可以搜索添加电影，或在搜索结果里删除已存在的电影，变更会直接写入 Cloudflare KV。";
  } else if (canAttemptLocalLogin) {
    elements.adminLoginButton.textContent = "登录管理";
    elements.statusCopy.textContent = "当前是本地预览模式。登录后可以进入管理状态，搜索添加或导出片库。";
  } else if (canAttemptRemoteLogin) {
    elements.adminLoginButton.textContent = "管理员登录";
    elements.statusCopy.textContent = "公开访客只能浏览和搜索已添加电影。登录后，才可以搜索添加或删除片库内容。";
  } else {
    elements.statusCopy.textContent = "当前是本地只读预览模式。公开搜索始终可用；若要页面内维护，请使用本地管理员模式或部署 Cloudflare 后登录。";
  }
}

function setUserMenuOpen(open) {
  state.admin.menuOpen = open;
  elements.userMenu?.classList.toggle("open", open);
  elements.userMenu?.setAttribute("aria-hidden", String(!open));
  elements.userMenuButton?.setAttribute("aria-expanded", String(open));
}

function syncLoginModalCopy() {
  if (state.admin.localAvailable && window.location.protocol === "file:") {
    elements.loginTitle.textContent = "本地管理登录";
    elements.loginCopy.textContent = "输入你在 admin.local.js 中配置的本地管理密码，进入可添加和导出的维护模式。";
    elements.adminPasswordInput.placeholder = "输入本地管理密码";
    return;
  }

  elements.loginTitle.textContent = "管理员登录";
  elements.loginCopy.textContent = "上线后，只有通过管理员密码鉴权，才能搜索并添加你看过的电影。";
  elements.adminPasswordInput.placeholder = "输入管理员密码";
}

async function loadResolvedLibrary() {
  if (/^https?:$/.test(window.location.protocol)) {
    try {
      const response = await fetch("/api/library", { headers: { "Cache-Control": "no-store" } });
      if (response.ok) {
        return normalizeResolvedLibrary(await response.json());
      }
    } catch (error) {
      console.warn("远程片库读取失败，尝试静态回退。", error);
    }
  }

  const embedded = window.__FILM_VAULT_RESOLVED__;
  if (embedded?.movies) {
    return normalizeResolvedLibrary(embedded);
  }

  const response = await fetch(RESOLVED_LIBRARY_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`片库静态数据读取失败: ${response.status}`);
  }

  return normalizeResolvedLibrary(await response.json());
}

async function loadSourceLibrary() {
  const embedded = window.__FILM_VAULT_SOURCE__;
  if (embedded?.entries) {
    return normalizeSourceLibrary(embedded);
  }

  const response = await fetch(SOURCE_LIBRARY_URL, { cache: "no-store" });
  if (!response.ok) {
    return normalizeSourceLibrary({
      title: state.library.title,
      subtitle: state.library.subtitle,
      entries: [],
    });
  }

  return normalizeSourceLibrary(await response.json());
}

function normalizeResolvedLibrary(data) {
  return {
    title: data.title || "我的电影墙",
    subtitle: data.subtitle || "",
    movies: Array.isArray(data.movies) ? data.movies : [],
  };
}

function normalizeSourceLibrary(data) {
  return {
    title: data.title || "我的电影墙",
    subtitle: data.subtitle || "",
    entries: Array.isArray(data.entries) ? data.entries : [],
  };
}

function applyLocalDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    const draft = JSON.parse(raw);
    if (draft?.sourceLibrary?.entries && draft?.library?.movies) {
      state.sourceLibrary = normalizeSourceLibrary(draft.sourceLibrary);
      state.library = normalizeResolvedLibrary(draft.library);
    }
  } catch (error) {
    console.warn("读取本地草稿失败", error);
  }
}

function persistLocalDraft() {
  if (state.admin.mode !== "local") {
    return;
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      sourceLibrary: state.sourceLibrary,
      library: state.library,
    })
  );
}

function renderLibrary() {
  const filteredMovies = getFilteredMovies();
  updateResultsMeta(filteredMovies);
  updateFeaturedMovieIfNeeded(filteredMovies);

  if (!filteredMovies.length) {
    elements.movieWall.innerHTML = `
      <div class="empty-state">
        当前筛选条件下没有结果，换个关键词、地区或评分试试看。
      </div>
    `;
    return;
  }

  elements.movieWall.innerHTML = filteredMovies.map(renderMovieCard).join("");
  elements.movieWall.querySelectorAll("[data-open-detail]").forEach((card) => {
    card.addEventListener("click", () => openDetail(Number(card.dataset.openDetail)));
  });
}

function renderMovieCard(movie) {
  const poster = movie.poster_path
    ? `<img src="${getImageUrl(movie.poster_path, "w500")}" alt="${escapeHtml(movie.title)} 海报" loading="lazy" />`
    : `<div class="movie-fallback">${escapeHtml(movie.title)}</div>`;

  const genres = (movie.genres || []).slice(0, 2).map((genre) => genre.name).join(" / ") || "未分类";
  const countries = (movie.production_countries || [])
    .slice(0, 2)
    .map((country) => country.name)
    .join(" / ") || "地区待补充";

  return `
    <article class="movie-card" data-open-detail="${movie.id}">
      ${poster}
      <div class="movie-content">
        <div class="movie-topline">
          <span class="movie-score">评分 ${formatScore(movie.vote_average)}</span>
          <span class="movie-year">${formatYear(movie.release_date)}</span>
        </div>
        <h4 class="movie-title">${escapeHtml(movie.title)}</h4>
        <p class="movie-subtitle">${escapeHtml(truncate(movie.overview || "暂无简介。", 72))}</p>
        <p class="movie-meta">${escapeHtml(genres)} · ${escapeHtml(countries)}</p>
      </div>
    </article>
  `;
}

function getFilteredMovies() {
  const keyword = elements.librarySearch.value.trim().toLowerCase();
  const sortBy = elements.sortSelect.value;
  const region = elements.regionSelect.value;
  const minRating = Number(elements.ratingRange.value);

  const filtered = state.library.movies.filter((movie) => {
    const searchableText = [
      movie.title,
      movie.original_title,
      movie.overview,
      ...(movie.genres || []).map((genre) => genre.name),
      ...(movie.production_countries || []).map((country) => country.name),
      ...(movie.production_companies || []).map((company) => company.name),
      ...(movie.cast || []).map((person) => person.name),
    ]
      .join(" ")
      .toLowerCase();

    const genreMatched =
      state.activeGenre === "all" ||
      (movie.genres || []).some((genre) => genre.id === Number(state.activeGenre));
    const regionMatched =
      region === "all" ||
      (movie.production_countries || []).some((country) => country.iso_3166_1 === region);
    const keywordMatched = !keyword || searchableText.includes(keyword);
    const ratingMatched = Number(movie.vote_average || 0) >= minRating;

    return genreMatched && regionMatched && keywordMatched && ratingMatched;
  });

  return filtered.sort((a, b) => {
    if (sortBy === "release") {
      return new Date(b.release_date || "1900-01-01") - new Date(a.release_date || "1900-01-01");
    }
    if (sortBy === "title") {
      return (a.title || "").localeCompare(b.title || "", "zh-Hans-CN");
    }
    if (sortBy === "added") {
      return Number(a.order || 0) - Number(b.order || 0);
    }
    return Number(b.vote_average || 0) - Number(a.vote_average || 0);
  });
}

function renderLoadingWall() {
  elements.movieWall.innerHTML = Array.from({ length: 10 }, () => `<div class="movie-card loading"></div>`).join("");
}

function updateStats() {
  const total = state.library.movies.length;
  const avgRating =
    total === 0 ? 0 : state.library.movies.reduce((sum, movie) => sum + Number(movie.vote_average || 0), 0) / total;
  const decades = new Set(
    state.library.movies
      .map((movie) => movie.release_date?.slice(0, 4))
      .filter(Boolean)
      .map((year) => `${year.slice(0, 3)}0`)
  );
  const regions = new Set();

  state.library.movies.forEach((movie) => {
    (movie.production_countries || []).forEach((country) => regions.add(country.iso_3166_1));
  });

  elements.statCount.textContent = String(total);
  elements.statRating.textContent = avgRating.toFixed(1);
  elements.statDecades.textContent = String(decades.size);
  elements.statRegions.textContent = String(regions.size);
}

function renderGenreChips() {
  const genreMap = new Map();
  state.library.movies.forEach((movie) => {
    (movie.genres || []).forEach((genre) => genreMap.set(genre.id, genre.name));
  });

  const chips = [{ id: "all", name: "全部类型" }, ...Array.from(genreMap, ([id, name]) => ({ id, name }))];
  elements.genreChips.innerHTML = chips
    .map(
      (genre) => `
        <button class="genre-chip ${String(genre.id) === String(state.activeGenre) ? "active" : ""}" data-genre="${genre.id}">
          ${escapeHtml(genre.name)}
        </button>
      `
    )
    .join("");

  elements.genreChips.querySelectorAll("[data-genre]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.activeGenre = chip.dataset.genre;
      renderGenreChips();
      renderLibrary();
    });
  });
}

function buildRegionOptions() {
  const regionMap = new Map();

  state.library.movies.forEach((movie) => {
    (movie.production_countries || []).forEach((country) => {
      if (!regionMap.has(country.iso_3166_1)) {
        regionMap.set(country.iso_3166_1, country.name);
      }
    });
  });

  const currentValue = elements.regionSelect.value || "all";
  const options = [`<option value="all">全部地区</option>`];

  Array.from(regionMap.entries())
    .sort((a, b) => a[1].localeCompare(b[1], "zh-Hans-CN"))
    .forEach(([code, name]) => {
      options.push(`<option value="${code}">${escapeHtml(name)}</option>`);
    });

  elements.regionSelect.innerHTML = options.join("");
  elements.regionSelect.value = regionMap.has(currentValue) || currentValue === "all" ? currentValue : "all";
}

function updateResultsMeta(filteredMovies) {
  const visible = filteredMovies.length;
  const total = state.library.movies.length;
  const sortText = {
    rating: "评分优先",
    release: "上映时间",
    title: "片名字母",
    added: "片单顺序",
  }[elements.sortSelect.value];

  elements.resultsMeta.textContent = `当前展示 ${visible} / ${total} 部电影，按「${sortText}」排序。`;
}

function updateFeaturedMovie(preferredId) {
  const source = state.library.movies;
  if (!source.length) {
    return;
  }

  const featured = preferredId
    ? source.find((movie) => movie.id === preferredId)
    : pickFeaturedMovie(source);

  if (!featured) {
    return;
  }

  state.featuredMovieId = featured.id;
  const backdrop = featured.backdrop_path
    ? `linear-gradient(90deg, rgba(5, 7, 11, 0.92), rgba(5, 7, 11, 0.55) 42%, rgba(5, 7, 11, 0.82) 100%), url(${getImageUrl(featured.backdrop_path, "w1280")})`
    : "linear-gradient(135deg, rgba(255, 122, 24, 0.14), rgba(212, 57, 62, 0.16), rgba(10, 14, 20, 0.92))";

  const countries = (featured.production_countries || []).map((country) => country.name).slice(0, 2);
  const genres = (featured.genres || []).map((genre) => genre.name).slice(0, 3);

  elements.heroBackdrop.style.backgroundImage = backdrop;
  elements.heroTitle.textContent = featured.title;
  elements.heroOverview.textContent = featured.overview || "暂无简介。";
  elements.heroMeta.textContent = `${formatYear(featured.release_date)} · 评分 ${formatScore(featured.vote_average)} · ${countries.join(" / ") || "地区待补充"}`;
  elements.heroTags.innerHTML = [
    ...genres.map((genre) => `<span class="hero-tag">${escapeHtml(genre)}</span>`),
    `<span class="hero-tag">${formatRuntime(featured.runtime)}</span>`,
  ].join("");
}

function updateFeaturedMovieIfNeeded(filteredMovies) {
  if (!filteredMovies.length) {
    return;
  }

  const currentVisible = filteredMovies.some((movie) => movie.id === state.featuredMovieId);
  if (!currentVisible) {
    updateFeaturedMovie(filteredMovies[0].id);
  }
}

function pickFeaturedMovie(movies) {
  const sorted = [...movies].sort((a, b) => Number(b.vote_average || 0) - Number(a.vote_average || 0));
  const top = sorted.slice(0, Math.min(sorted.length, 8));
  return top[Math.floor(Math.random() * top.length)];
}

function shuffleFeaturedMovie() {
  if (!state.library.movies.length) {
    return;
  }

  const candidates = state.library.movies.filter((movie) => movie.id !== state.featuredMovieId);
  if (!candidates.length) {
    return;
  }

  updateFeaturedMovie(candidates[Math.floor(Math.random() * candidates.length)].id);
}

async function openDetail(movieId) {
  const detail = state.library.movies.find((movie) => movie.id === movieId);
  if (!detail) {
    return;
  }

  openDrawer();
  const cast = (detail.cast || []).slice(0, 8);
  const releaseCountry = detail.release_country || "";
  const companies = (detail.production_companies || []).slice(0, 5).map((item) => item.name).join(" / ");
  const countries = (detail.production_countries || []).map((item) => item.name).join(" / ");
  const genres = (detail.genres || []).map((item) => item.name).join(" / ");
  const detailHeroBackground = detail.backdrop_path || detail.poster_path
    ? `url('${getImageUrl(detail.backdrop_path || detail.poster_path, "w1280")}')`
    : "linear-gradient(135deg, rgba(255, 122, 24, 0.18), rgba(212, 57, 62, 0.2), rgba(10, 14, 20, 0.96))";
  const localRemoveAction = state.admin.mode === "local"
    ? `<button class="movie-action danger-button" data-remove-movie="${detail.id}">从本地草稿移除</button>`
    : "";

  elements.detailContent.innerHTML = `
    <section class="detail-hero" style="background-image: ${detailHeroBackground}">
      <div class="detail-hero-content">
        <span class="eyebrow">FILM DETAIL</span>
        <h3 class="detail-title">${escapeHtml(detail.title)}</h3>
        <p class="detail-overview">${escapeHtml(detail.overview || "暂无简介。")}</p>
      </div>
    </section>
    <div class="detail-grid">
      <section class="detail-block">
        <h4>基础信息</h4>
        <div class="detail-list">
          <div class="detail-row"><span>上映日期</span><strong>${escapeHtml(detail.release_date || "未知")}</strong></div>
          <div class="detail-row"><span>上映地区</span><strong>${escapeHtml(releaseCountry || countries || "未知")}</strong></div>
          <div class="detail-row"><span>用户评分</span><strong>${formatScore(detail.vote_average)} / 10</strong></div>
          <div class="detail-row"><span>片长</span><strong>${formatRuntime(detail.runtime)}</strong></div>
          <div class="detail-row"><span>类型</span><strong>${escapeHtml(genres || "未分类")}</strong></div>
          <div class="detail-row"><span>原始片名</span><strong>${escapeHtml(detail.original_title || detail.title)}</strong></div>
        </div>
      </section>
      <section class="detail-block">
        <h4>制作信息</h4>
        <div class="detail-list">
          <div class="detail-row"><span>出品国家</span><strong>${escapeHtml(countries || "未知")}</strong></div>
          <div class="detail-row"><span>制作公司</span><strong>${escapeHtml(companies || "未知")}</strong></div>
          <div class="detail-row"><span>语言</span><strong>${escapeHtml((detail.spoken_languages || []).map((item) => item.english_name || item.name).join(" / ") || "未知")}</strong></div>
          <div class="detail-row"><span>热度</span><strong>${Number(detail.popularity || 0).toFixed(1)}</strong></div>
        </div>
      </section>
      <section class="detail-block">
        <h4>主要演员</h4>
        <div class="cast-grid">
          ${
            cast.length
              ? cast.map((person) => `
                  <article class="cast-card">
                    <strong>${escapeHtml(person.name)}</strong>
                    <span>${escapeHtml(person.character || "角色待补充")}</span>
                  </article>
                `).join("")
              : `<div class="muted">暂无演员信息。</div>`
          }
        </div>
      </section>
      <section class="detail-block">
        <h4>维护方式</h4>
        <div class="detail-actions">
          <button class="movie-action" data-close-detail>返回电影墙</button>
          ${localRemoveAction}
        </div>
      </section>
    </div>
  `;

  elements.detailContent.querySelector("[data-close-detail]")?.addEventListener("click", closeDetailDrawer);
  elements.detailContent.querySelector("[data-remove-movie]")?.addEventListener("click", () => {
    removeMovieLocally(detail.id);
    closeDetailDrawer();
  });
}

function removeMovieLocally(movieId) {
  state.library.movies = state.library.movies
    .filter((movie) => movie.id !== movieId)
    .map((movie, index) => ({ ...movie, order: index }));
  state.sourceLibrary.entries = state.sourceLibrary.entries.filter((entry) => Number(entry.tmdbId) !== movieId);
  persistLocalDraft();
  refreshLibraryViews();
  showToast("已从本地草稿移除。");
}

async function handleRemoteLogin(event) {
  event.preventDefault();
  const password = elements.adminPasswordInput.value.trim();

  if (!password) {
    elements.loginMessage.innerHTML = `<div class="empty-state">请输入管理员密码。</div>`;
    return;
  }

  if (state.admin.localAvailable && !state.admin.remoteAvailable && window.location.protocol === "file:") {
    if (!state.admin.localPassword || password === state.admin.localPassword) {
      state.admin.localAuthenticated = true;
      state.admin.mode = "local";
      elements.adminPasswordInput.value = "";
      elements.loginMessage.innerHTML = "";
      updateAdminUi();
      closeModal(elements.loginModal);
      showToast("本地管理登录成功。");
      return;
    }

    elements.loginMessage.innerHTML = `<div class="empty-state">本地管理密码不正确。</div>`;
    return;
  }

  try {
    const response = await fetch("/api/admin/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      elements.loginMessage.innerHTML = `<div class="empty-state">登录失败，请检查密码。</div>`;
      return;
    }

    const payload = await response.json();
    state.admin.remoteAvailable = true;
    state.admin.remoteAuthenticated = true;
    state.admin.remoteSeeded = Boolean(payload.seeded);
    state.admin.mode = "remote";
    elements.adminPasswordInput.value = "";
    elements.loginMessage.innerHTML = "";
    updateAdminUi();
    closeModal(elements.loginModal);
    showToast("管理员登录成功。");
  } catch (error) {
    console.error(error);
    elements.loginMessage.innerHTML = `<div class="empty-state">登录接口不可用，请检查 Cloudflare 配置。</div>`;
  }
}

async function handleRemoteLogout() {
  if (state.admin.mode === "local") {
    state.admin.localAuthenticated = false;
    state.admin.mode = "none";
    updateAdminUi();
    setUserMenuOpen(false);
    showToast("已退出本地管理。");
    return;
  }

  try {
    await fetch("/api/admin/session", {
      method: "DELETE",
      credentials: "include",
    });
  } catch (error) {
    console.warn(error);
  }

  state.admin.remoteAuthenticated = false;
  state.admin.mode = "none";
  updateAdminUi();
  setUserMenuOpen(false);
  showToast("已退出管理员模式。");
}

function syncSearchModalCopy() {
  const title = elements.searchModal.querySelector(".section-kicker");
  const heading = elements.searchModal.querySelector("h3");
  const copy = elements.searchModal.querySelector(".modal-copy");

  if (state.admin.mode === "remote") {
    title.textContent = "CLOUDFLARE ADMIN";
    heading.textContent = "搜索电影并管理云端片库";
    copy.textContent = "搜索结果里可以直接添加未收录电影，也可以删除已经在片库中的电影，变更会直接写入 Cloudflare KV。";
    return;
  }

  title.textContent = "LOCAL ADMIN";
  heading.textContent = "搜索电影并管理本地草稿";
  copy.textContent = "本地管理员模式下，搜索结果支持添加和删除，变更会保存在浏览器草稿中。";
}

async function handleSearchSubmit(event) {
  event.preventDefault();

  if (state.admin.mode !== "local" && state.admin.mode !== "remote") {
    showToast("请先完成管理员登录。");
    return;
  }

  const query = elements.tmdbSearchInput.value.trim();
  if (!query) {
    showToast("先输入电影名再搜索。");
    return;
  }

  elements.searchResults.innerHTML = createLoadingSearchCards(3);

  try {
    state.searchResults = state.admin.mode === "remote"
      ? await remoteSearchMovies(query)
      : await localSearchMovies(query);
    renderSearchResults();
  } catch (error) {
    console.error(error);
    elements.searchResults.innerHTML = `<div class="empty-state">搜索失败，请稍后重试。</div>`;
  }
}

async function remoteSearchMovies(query) {
  const response = await fetch("/api/admin/search", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (response.status === 401) {
    state.admin.remoteAuthenticated = false;
    state.admin.mode = "none";
    updateAdminUi();
    throw new Error("管理员会话已失效");
  }

  if (!response.ok) {
    throw new Error(`搜索失败: ${response.status}`);
  }

  const payload = await response.json();
  return payload.results || [];
}

async function localSearchMovies(query) {
  const payload = await fetchFromMovieDb("/search/movie", {
    language: "zh-CN",
    query,
    include_adult: "false",
    page: "1",
  });

  return payload.results || [];
}

function renderSearchResults() {
  if (!state.searchResults.length) {
    elements.searchResults.innerHTML = `<div class="empty-state">没有找到匹配结果，换个中英文片名试试。</div>`;
    return;
  }

  elements.searchResults.innerHTML = state.searchResults
    .slice(0, 10)
    .map((movie) => {
      const exists = state.library.movies.some((item) => Number(item.id) === Number(movie.id));
      const poster = movie.poster_path
        ? `<img src="${getImageUrl(movie.poster_path, "w342")}" alt="${escapeHtml(movie.title)} 海报" />`
        : `<div class="search-fallback">NO POSTER</div>`;
      const badge = exists ? `<span class="result-badge">已在片库中</span>` : "";
      const actionClass = exists ? "search-result-button remove" : "search-result-button";
      const actionLabel = exists ? "删除" : "加入片库";
      const actionAttr = exists ? "data-remove-movie" : "data-add-movie";

      return `
        <article class="search-card">
          ${poster}
          <div>
            <h4>${escapeHtml(movie.title)} <span class="muted">${formatYear(movie.release_date)}</span></h4>
            <p>${escapeHtml(truncate(movie.overview || "暂无简介。", 100))}</p>
            ${badge}
          </div>
          <button class="${actionClass}" ${actionAttr}="${movie.id}">${actionLabel}</button>
        </article>
      `;
    })
    .join("");

  elements.searchResults.querySelectorAll("[data-add-movie]").forEach((button) => {
    button.addEventListener("click", () => addMovieById(Number(button.dataset.addMovie)));
  });
  elements.searchResults.querySelectorAll("[data-remove-movie]").forEach((button) => {
    button.addEventListener("click", () => removeMovieById(Number(button.dataset.removeMovie)));
  });
}

async function addMovieById(movieId) {
  if (state.library.movies.some((movie) => Number(movie.id) === movieId)) {
    showToast("这部电影已经在当前片库里了。");
    return;
  }

  try {
    if (state.admin.mode === "remote") {
      await addMovieRemotely(movieId);
    } else {
      await addMovieLocally(movieId);
    }

    refreshLibraryViews();
    updateFeaturedMovie(movieId);
    renderSearchResults();
    showToast(state.admin.mode === "remote" ? "已写入云端片库。" : "已加入本地草稿。");
  } catch (error) {
    console.error(error);
    showToast("添加失败，请稍后重试。");
  }
}

async function removeMovieById(movieId) {
  try {
    if (state.admin.mode === "remote") {
      await removeMovieRemotely(movieId);
    } else {
      removeMovieLocally(movieId);
    }

    refreshLibraryViews();
    renderSearchResults();
    showToast(state.admin.mode === "remote" ? "已从云端片库删除。" : "已从本地草稿删除。");
  } catch (error) {
    console.error(error);
    showToast("删除失败，请稍后重试。");
  }
}

async function addMovieLocally(movieId) {
  const detail = await fetchFromMovieDb(`/movie/${movieId}`, {
    language: "zh-CN",
    append_to_response: "credits,release_dates",
  });

  state.library.movies.push(transformMovie(detail, state.library.movies.length));
  state.sourceLibrary.entries.push({
    title: detail.title,
    year: Number(detail.release_date?.slice(0, 4)) || undefined,
    tmdbId: detail.id,
  });
  persistLocalDraft();
}

async function addMovieRemotely(movieId) {
  const response = await fetch("/api/admin/add", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      movieId,
      sourceLibrary: state.admin.remoteSeeded ? undefined : state.sourceLibrary,
      resolvedLibrary: state.admin.remoteSeeded ? undefined : state.library,
    }),
  });

  if (response.status === 401) {
    state.admin.remoteAuthenticated = false;
    state.admin.mode = "none";
    updateAdminUi();
    throw new Error("管理员会话已失效");
  }

  if (!response.ok) {
    throw new Error(`远程添加失败: ${response.status}`);
  }

  const payload = await response.json();
  state.sourceLibrary = normalizeSourceLibrary(payload.sourceLibrary);
  state.library = normalizeResolvedLibrary(payload.library);
  state.admin.remoteSeeded = true;
}

async function removeMovieRemotely(movieId) {
  const response = await fetch("/api/admin/remove", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      movieId,
      sourceLibrary: state.admin.remoteSeeded ? undefined : state.sourceLibrary,
      resolvedLibrary: state.admin.remoteSeeded ? undefined : state.library,
    }),
  });

  if (response.status === 401) {
    state.admin.remoteAuthenticated = false;
    state.admin.mode = "none";
    updateAdminUi();
    throw new Error("管理员会话已失效");
  }

  if (!response.ok) {
    throw new Error(`远程删除失败: ${response.status}`);
  }

  const payload = await response.json();
  state.sourceLibrary = normalizeSourceLibrary(payload.sourceLibrary);
  state.library = normalizeResolvedLibrary(payload.library);
  state.admin.remoteSeeded = true;
}

function refreshLibraryViews() {
  state.library.movies = state.library.movies.map((movie, index) => ({ ...movie, order: index }));
  buildRegionOptions();
  renderGenreChips();
  updateStats();
  renderLibrary();
}

function exportSourceLibrary() {
  downloadJson("library.json", {
    title: state.sourceLibrary.title,
    subtitle: state.sourceLibrary.subtitle,
    entries: state.sourceLibrary.entries,
  });
  showToast("已导出 library.json。");
}

function exportResolvedLibrary() {
  downloadJson("library.resolved.json", {
    title: state.library.title,
    subtitle: state.library.subtitle,
    movies: state.library.movies,
  });
  showToast("已导出 library.resolved.json。");
}

function downloadJson(filename, data) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function fetchFromMovieDb(path, params = {}) {
  await throttleBrowserRequests();
  const search = new URLSearchParams({
    api_key: state.admin.apiKey,
    ...params,
  });
  const response = await fetch(`${MOVIE_DB_BASE_URL}${path}?${search.toString()}`);
  if (!response.ok) {
    throw new Error(`电影资料请求失败: ${response.status}`);
  }
  return response.json();
}

async function throttleBrowserRequests() {
  const now = Date.now();
  const waitTime = Math.max(0, BROWSER_REQUEST_INTERVAL_MS - (now - lastBrowserRequestAt));
  if (waitTime > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastBrowserRequestAt = Date.now();
}

function transformMovie(detail, order) {
  return {
    id: detail.id,
    order,
    title: detail.title,
    original_title: detail.original_title,
    overview: detail.overview,
    release_date: detail.release_date,
    release_country: getReleaseCountry(detail),
    poster_path: detail.poster_path,
    backdrop_path: detail.backdrop_path,
    vote_average: detail.vote_average,
    vote_count: detail.vote_count,
    runtime: detail.runtime,
    popularity: detail.popularity,
    genres: detail.genres || [],
    production_countries: detail.production_countries || [],
    production_companies: detail.production_companies || [],
    spoken_languages: detail.spoken_languages || [],
    cast: (detail.credits?.cast || []).slice(0, 10).map((person) => ({
      name: person.name,
      character: person.character,
    })),
  };
}

function getReleaseCountry(detail) {
  const releaseResults = detail.release_dates?.results || [];
  const preferred = releaseResults.find((item) => item.iso_3166_1 === "CN")
    || releaseResults.find((item) => item.iso_3166_1 === "US")
    || releaseResults[0];
  if (!preferred) {
    return "";
  }

  const country = (detail.production_countries || []).find((item) => item.iso_3166_1 === preferred.iso_3166_1);
  return country?.name || preferred.iso_3166_1;
}

function createLoadingSearchCards(count) {
  return Array.from({ length: count }, () => `
    <div class="search-card">
      <div class="search-fallback">...</div>
      <div><p>正在搜索中...</p></div>
      <div></div>
    </div>
  `).join("");
}

function openDrawer() {
  elements.detailDrawer.classList.add("open");
  elements.detailDrawer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeDetailDrawer() {
  elements.detailDrawer.classList.remove("open");
  elements.detailDrawer.setAttribute("aria-hidden", "true");
  if (!elements.searchModal.classList.contains("open") && !elements.loginModal.classList.contains("open")) {
    document.body.style.overflow = "";
  }
}

function openModal(modal) {
  modal?.classList.add("open");
  modal?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal(modal) {
  if (!modal) {
    return;
  }

  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  if (!elements.detailDrawer.classList.contains("open") && !elements.searchModal.classList.contains("open") && !elements.loginModal.classList.contains("open")) {
    document.body.style.overflow = "";
  }
}

function getImageUrl(path, size = "w780") {
  return path ? `${IMAGE_BASE_URL}${size}${path}` : "";
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2400);
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength).trim()}...`;
}

function formatYear(releaseDate) {
  return releaseDate ? releaseDate.slice(0, 4) : "未知";
}

function formatScore(score) {
  return Number(score || 0).toFixed(1);
}

function formatRuntime(runtime) {
  if (!runtime) {
    return "片长待补充";
  }

  const hours = Math.floor(runtime / 60);
  const minutes = runtime % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
