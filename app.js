const RESOLVED_LIBRARY_URL = "./data/library.resolved.json";

const state = {
  library: {
    title: "我的电影墙",
    subtitle: "一面为私人观影史准备的电影墙，用沉浸式视觉把每一次观看变成可回看的馆藏。",
    movies: [],
  },
  activeGenre: "all",
  featuredMovieId: null,
};

const elements = {
  pageTitle: document.getElementById("pageTitle"),
  pageSubtitle: document.getElementById("pageSubtitle"),
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
  toast: document.getElementById("toast"),
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  bindEvents();
  bootstrapLibrary();
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

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDetailDrawer();
    }
  });
}

async function bootstrapLibrary() {
  renderLoadingWall();

  try {
    state.library = await loadResolvedLibrary();
    elements.pageTitle.textContent = state.library.title;
    elements.pageSubtitle.textContent = state.library.subtitle;
    buildRegionOptions();
    renderGenreChips();
    updateStats();
    updateFeaturedMovie();
    renderLibrary();
  } catch (error) {
    console.error(error);
    elements.resultsMeta.textContent = "片库数据加载失败，请先生成 data/library.resolved.json。";
    elements.movieWall.innerHTML = `
      <div class="empty-state">
        片库数据尚未准备完成。请先在本地运行 <code>npm run rebuild:library</code> 生成静态数据。
      </div>
    `;
    showToast("未读取到静态片库数据。");
  }
}

async function loadResolvedLibrary() {
  const response = await fetch(RESOLVED_LIBRARY_URL, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`片库静态数据读取失败: ${response.status}`);
  }

  const data = await response.json();
  return {
    title: data.title || "我的电影墙",
    subtitle: data.subtitle || "",
    movies: Array.isArray(data.movies) ? data.movies : [],
  };
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

  elements.movieWall.innerHTML = filteredMovies
    .map((movie) => {
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
    })
    .join("");

  elements.movieWall.querySelectorAll("[data-open-detail]").forEach((card) => {
    card.addEventListener("click", () => openDetail(Number(card.dataset.openDetail)));
  });
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
    (movie.production_countries || []).forEach((country) => {
      regions.add(country.iso_3166_1);
    });
  });

  elements.statCount.textContent = String(total);
  elements.statRating.textContent = avgRating.toFixed(1);
  elements.statDecades.textContent = String(decades.size);
  elements.statRegions.textContent = String(regions.size);
}

function renderGenreChips() {
  const genreMap = new Map();
  state.library.movies.forEach((movie) => {
    (movie.genres || []).forEach((genre) => {
      genreMap.set(genre.id, genre.name);
    });
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
  const source = state.library.movies.length ? state.library.movies : [];
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
    ? `linear-gradient(90deg, rgba(5, 7, 11, 0.92), rgba(5, 7, 11, 0.55) 42%, rgba(5, 7, 11, 0.82) 100%), url(${getImageUrl(
        featured.backdrop_path,
        "w1280"
      )})`
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
              ? cast
                  .map(
                    (person) => `
                      <article class="cast-card">
                        <strong>${escapeHtml(person.name)}</strong>
                        <span>${escapeHtml(person.character || "角色待补充")}</span>
                      </article>
                    `
                  )
                  .join("")
              : `<div class="muted">暂无演员信息。</div>`
          }
        </div>
      </section>

      <section class="detail-block">
        <h4>展厅说明</h4>
        <div class="detail-list">
          <div class="detail-row"><span>站点模式</span><strong>公开只读</strong></div>
          <div class="detail-row"><span>维护方式</span><strong>本地搜索添加后重新部署</strong></div>
          <div class="detail-row"><span>兼容部署</span><strong>Cloudflare Pages / Workers</strong></div>
        </div>
      </section>
    </div>
  `;
}

function openDrawer() {
  elements.detailDrawer.classList.add("open");
  elements.detailDrawer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeDetailDrawer() {
  elements.detailDrawer.classList.remove("open");
  elements.detailDrawer.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function getImageUrl(path, size = "w780") {
  if (!path) {
    return "";
  }

  return `https://image.tmdb.org/t/p/${size}${path}`;
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
