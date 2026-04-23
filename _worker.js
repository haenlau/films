const COOKIE_NAME = "film_vault_admin";
const COOKIE_MAX_AGE = 60 * 60 * 8;
const KV_SOURCE_KEY = "library:source";
const KV_RESOLVED_KEY = "library:resolved";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/library" && request.method === "GET") {
      return handleGetLibrary(env);
    }
    if (url.pathname === "/api/admin/session" && request.method === "GET") {
      return handleGetSession(request, env);
    }
    if (url.pathname === "/api/admin/session" && request.method === "POST") {
      return handleLogin(request, env);
    }
    if (url.pathname === "/api/admin/session" && request.method === "DELETE") {
      return handleLogout(request);
    }
    if (url.pathname === "/api/admin/search" && request.method === "POST") {
      return withAuth(request, env, () => handleSearch(request, env));
    }
    if (url.pathname === "/api/admin/add" && request.method === "POST") {
      return withAuth(request, env, () => handleAddMovie(request, env));
    }
    if (url.pathname === "/api/admin/remove" && request.method === "POST") {
      return withAuth(request, env, () => handleRemoveMovie(request, env));
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleGetLibrary(env) {
  const resolvedRaw = await env.FILM_VAULT_KV?.get(KV_RESOLVED_KEY);
  if (!resolvedRaw) {
    return json({ message: "Library not seeded yet." }, 404);
  }

  return json(JSON.parse(resolvedRaw), 200);
}

async function handleGetSession(request, env) {
  const available = Boolean(env.FILM_VAULT_KV && env.ADMIN_PASSWORD && env.SESSION_SECRET && env.TMDB_API_KEY);
  if (!available) {
    return json({ available: false, authenticated: false, seeded: false }, 200);
  }

  const authenticated = await verifySession(request, env);
  const seeded = Boolean(await env.FILM_VAULT_KV.get(KV_RESOLVED_KEY));
  return json({ available: true, authenticated, seeded }, 200);
}

async function handleLogin(request, env) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET || !env.FILM_VAULT_KV) {
    return json({ message: "Admin is not configured." }, 503);
  }

  const body = await request.json().catch(() => ({}));
  if (String(body.password || "") !== String(env.ADMIN_PASSWORD)) {
    return json({ message: "Unauthorized" }, 401);
  }

  const token = await createSessionToken(env);
  const seeded = Boolean(await env.FILM_VAULT_KV.get(KV_RESOLVED_KEY));
  const headers = new Headers({
    "Set-Cookie": buildCookie(request, token),
  });

  return json({ authenticated: true, seeded }, 200, headers);
}

function handleLogout(request) {
  const headers = new Headers({
    "Set-Cookie": clearCookie(request),
  });
  return json({ authenticated: false }, 200, headers);
}

async function handleSearch(request, env) {
  const body = await request.json().catch(() => ({}));
  const query = String(body.query || "").trim();

  if (!query) {
    return json({ results: [] }, 200);
  }

  const search = new URLSearchParams({
    api_key: env.TMDB_API_KEY,
    language: "zh-CN",
    query,
    include_adult: "false",
    page: "1",
  });

  const response = await fetch(`https://api.themoviedb.org/3/search/movie?${search.toString()}`);
  if (!response.ok) {
    return json({ message: "Search failed." }, 502);
  }

  const payload = await response.json();
  return json({
    results: (payload.results || []).slice(0, 10).map((movie) => ({
      id: movie.id,
      title: movie.title,
      original_title: movie.original_title,
      overview: movie.overview,
      release_date: movie.release_date,
      poster_path: movie.poster_path,
    })),
  });
}

async function handleAddMovie(request, env) {
  const body = await request.json().catch(() => ({}));
  const movieId = Number(body.movieId);
  if (!Number.isInteger(movieId)) {
    return json({ message: "movieId is required." }, 400);
  }

  const currentSource = await loadSourceLibrary(env, body.sourceLibrary);
  const currentResolved = await loadResolvedLibrary(env, body.resolvedLibrary);

  if (currentResolved.movies.some((movie) => Number(movie.id) === movieId)) {
    return json({ sourceLibrary: currentSource, library: currentResolved }, 200);
  }

  const detail = await fetchMovieDetail(env, movieId);
  currentResolved.movies.push(transformMovie(detail, currentResolved.movies.length));
  currentSource.entries.push({
    title: detail.title,
    year: Number(detail.release_date?.slice(0, 4)) || undefined,
    tmdbId: detail.id,
  });

  currentResolved.movies = currentResolved.movies.map((movie, index) => ({ ...movie, order: index }));
  currentSource.entries = dedupeEntries(currentSource.entries);

  await env.FILM_VAULT_KV.put(KV_SOURCE_KEY, JSON.stringify(currentSource));
  await env.FILM_VAULT_KV.put(KV_RESOLVED_KEY, JSON.stringify(currentResolved));

  return json({ sourceLibrary: currentSource, library: currentResolved }, 200);
}

async function handleRemoveMovie(request, env) {
  const body = await request.json().catch(() => ({}));
  const movieId = Number(body.movieId);
  if (!Number.isInteger(movieId)) {
    return json({ message: "movieId is required." }, 400);
  }

  const currentSource = await loadSourceLibrary(env, body.sourceLibrary);
  const currentResolved = await loadResolvedLibrary(env, body.resolvedLibrary);

  currentResolved.movies = currentResolved.movies
    .filter((movie) => Number(movie.id) !== movieId)
    .map((movie, index) => ({ ...movie, order: index }));
  currentSource.entries = currentSource.entries.filter((entry) => Number(entry.tmdbId) !== movieId);

  await env.FILM_VAULT_KV.put(KV_SOURCE_KEY, JSON.stringify(currentSource));
  await env.FILM_VAULT_KV.put(KV_RESOLVED_KEY, JSON.stringify(currentResolved));

  return json({ sourceLibrary: currentSource, library: currentResolved }, 200);
}

async function withAuth(request, env, handler) {
  const authorized = await verifySession(request, env);
  if (!authorized) {
    return json({ message: "Unauthorized" }, 401);
  }

  return handler();
}

async function verifySession(request, env) {
  if (!env.SESSION_SECRET) {
    return false;
  }

  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const token = cookies[COOKIE_NAME];
  if (!token) {
    return false;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return false;
  }

  const expected = await signValue(payload, env.SESSION_SECRET);
  if (signature !== expected) {
    return false;
  }

  const decoded = JSON.parse(decodeBase64Url(payload));
  return Number(decoded.exp || 0) > Date.now();
}

async function createSessionToken(env) {
  const payload = encodeBase64Url(JSON.stringify({
    exp: Date.now() + COOKIE_MAX_AGE * 1000,
  }));
  const signature = await signValue(payload, env.SESSION_SECRET);
  return `${payload}.${signature}`;
}

async function signValue(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return encodeBase64Url(signature);
}

function buildCookie(request, token) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}${secure}`;
}

function clearCookie(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

async function loadSourceLibrary(env, fallback) {
  const stored = await env.FILM_VAULT_KV?.get(KV_SOURCE_KEY);
  if (stored) {
    return normalizeSourceLibrary(JSON.parse(stored));
  }

  return normalizeSourceLibrary(fallback || {
    title: "我的电影墙",
    subtitle: "",
    entries: [],
  });
}

async function loadResolvedLibrary(env, fallback) {
  const stored = await env.FILM_VAULT_KV?.get(KV_RESOLVED_KEY);
  if (stored) {
    return normalizeResolvedLibrary(JSON.parse(stored));
  }

  return normalizeResolvedLibrary(fallback || {
    title: "我的电影墙",
    subtitle: "",
    movies: [],
  });
}

function normalizeSourceLibrary(data) {
  return {
    title: data?.title || "我的电影墙",
    subtitle: data?.subtitle || "",
    entries: Array.isArray(data?.entries) ? data.entries : [],
  };
}

function normalizeResolvedLibrary(data) {
  return {
    title: data?.title || "我的电影墙",
    subtitle: data?.subtitle || "",
    movies: Array.isArray(data?.movies) ? data.movies : [],
  };
}

async function fetchMovieDetail(env, movieId) {
  const search = new URLSearchParams({
    api_key: env.TMDB_API_KEY,
    language: "zh-CN",
    append_to_response: "credits,release_dates",
  });

  const response = await fetch(`https://api.themoviedb.org/3/movie/${movieId}?${search.toString()}`);
  if (!response.ok) {
    throw new Error(`Movie detail fetch failed: ${response.status}`);
  }

  return response.json();
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

function dedupeEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = entry.tmdbId
      ? `id::${entry.tmdbId}`
      : `${String(entry.title || "").trim().toLowerCase()}::${entry.year || ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function parseCookies(cookieHeader) {
  return cookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((accumulator, chunk) => {
      const [name, ...rest] = chunk.split("=");
      accumulator[name] = rest.join("=");
      return accumulator;
    }, {});
}

function json(data, status = 200, headers = new Headers()) {
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
}

function encodeBase64Url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
