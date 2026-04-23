import { existsSync, readFileSync } from "node:fs";

const MOVIE_DB_BASE_URL = "https://api.themoviedb.org/3";
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

  const response = await fetch(`${MOVIE_DB_BASE_URL}${path}?${search.toString()}`);
  if (!response.ok) {
    throw new Error(`电影资料请求失败: ${response.status}`);
  }

  return response.json();
}

export function getImageUrl(path, size = "w780") {
  return path ? `${IMAGE_BASE}${size}${path}` : "";
}

export async function searchMovies(query, year) {
  return movieDbFetch("/search/movie", {
    language: "zh-CN",
    query,
    include_adult: "false",
    ...(year ? { year: String(year) } : {}),
  });
}

export async function getMovieDetails(id) {
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

export function pickBestResult(results, entry) {
  const exactYear = String(entry.year || "");
  const normalizedTitle = normalize(entry.title);

  const ranked = [...results].sort((left, right) => scoreResult(right, normalizedTitle, exactYear) - scoreResult(left, normalizedTitle, exactYear));
  return ranked[0] || null;
}

function scoreResult(result, normalizedTitle, exactYear) {
  let score = 0;
  const title = normalize(result.title);
  const originalTitle = normalize(result.original_title);
  const releaseYear = result.release_date?.slice(0, 4) || "";
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
