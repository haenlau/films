import { existsSync, readFileSync } from "node:fs";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/";
const REQUEST_INTERVAL_MS = 100;

let lastRequestAt = 0;

export function loadApiKey() {
  const envValue = process.env.TMDB_API_KEY?.trim();
  if (envValue) {
    return envValue;
  }

  const localFiles = [".dev.vars", ".env", ".env.local"];
  for (const file of localFiles) {
    if (!existsSync(file)) {
      continue;
    }

    const content = readFileSync(file, "utf8");
    const match = content.match(/^\s*TMDB_API_KEY\s*=\s*"?([^"\r\n]+)"?\s*$/m);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  throw new Error("未找到 TMDB_API_KEY。请在 .dev.vars、.env.local 或环境变量中配置。");
}

export async function movieDbFetch(path, params = {}) {
  await throttleRequests();
  const search = new URLSearchParams({
    api_key: loadApiKey(),
    ...params,
  });

  const response = await fetch(`${TMDB_BASE_URL}${path}?${search.toString()}`);
  if (!response.ok) {
    throw new Error(`电影资料请求失败: ${response.status}`);
  }

  return response.json();
}

export function getImageUrl(path, size = "w780") {
  return path ? `${IMAGE_BASE}${size}${path}` : "";
}

export async function searchMedia(query) {
  const [movieResult, tvResult] = await Promise.all([
    movieDbFetch("/search/movie", {
      language: "zh-CN",
      query,
      include_adult: "false",
      page: "1",
    }),
    movieDbFetch("/search/tv", {
      language: "zh-CN",
      query,
      include_adult: "false",
      page: "1",
    }),
  ]);

  const movies = (movieResult.results || []).map(normalizeMovieResult);
  const tvShows = (tvResult.results || []).map(normalizeTvResult);
  return [...movies, ...tvShows];
}

export async function getMediaDetails(mediaType, id) {
  if (mediaType === "tv") {
    return movieDbFetch(`/tv/${id}`, {
      language: "zh-CN",
      append_to_response: "credits",
    });
  }

  return movieDbFetch(`/movie/${id}`, {
    language: "zh-CN",
    append_to_response: "credits,release_dates",
  });
}

async function throttleRequests() {
  const now = Date.now();
  const waitTime = Math.max(0, REQUEST_INTERVAL_MS - (now - lastRequestAt));
  if (waitTime > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastRequestAt = Date.now();
}

function normalizeMovieResult(movie) {
  return {
    id: movie.id,
    media_type: "movie",
    title: movie.title,
    original_title: movie.original_title,
    overview: movie.overview,
    release_date: movie.release_date,
    poster_path: movie.poster_path,
    backdrop_path: movie.backdrop_path,
    vote_average: movie.vote_average,
    vote_count: movie.vote_count,
    popularity: movie.popularity,
  };
}

function normalizeTvResult(show) {
  return {
    id: show.id,
    media_type: "tv",
    title: show.name,
    original_title: show.original_name,
    overview: show.overview,
    release_date: show.first_air_date,
    poster_path: show.poster_path,
    backdrop_path: show.backdrop_path,
    vote_average: show.vote_average,
    vote_count: show.vote_count,
    popularity: show.popularity,
  };
}

export function pickBestResult(results, entry) {
  const exactYear = String(entry.year || "");
  const normalizedTitle = normalize(entry.title);
  const preferredMediaType = entry.media_type || entry.mediaType || "";

  const ranked = [...results]
    .filter((result) => !preferredMediaType || result.media_type === preferredMediaType)
    .sort((left, right) => scoreResult(right, normalizedTitle, exactYear) - scoreResult(left, normalizedTitle, exactYear));

  if (ranked.length) {
    return ranked[0];
  }

  return [...results]
    .sort((left, right) => scoreResult(right, normalizedTitle, exactYear) - scoreResult(left, normalizedTitle, exactYear))[0] || null;
}

function scoreResult(result, normalizedTitle, exactYear) {
  let score = 0;
  const title = normalize(result.title);
  const originalTitle = normalize(result.original_title);
  const releaseYear = getYear(result.release_date);
  const exactWordMatch = hasExactWord(title, normalizedTitle) || hasExactWord(originalTitle, normalizedTitle);

  if (title === normalizedTitle || originalTitle === normalizedTitle) {
    score += 100;
  }

  if (exactWordMatch) {
    score += 20;
  }

  if (exactYear && releaseYear === exactYear) {
    score += 30;
  }

  score += Number(result.popularity || 0) / 100;
  score += Number(result.vote_count || 0) / 1000;

  return score;
}

function getYear(value) {
  return String(value || "").slice(0, 4);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function hasExactWord(target, query) {
  if (!query) {
    return false;
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(target);
}
