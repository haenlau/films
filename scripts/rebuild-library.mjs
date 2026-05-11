import { getMediaDetails, pickBestResult, searchMedia } from "./lib/movie-db.mjs";
import { dedupeEntries, readSourceLibrary, writeResolvedLibrary, writeSourceLibrary } from "./lib/library-files.mjs";

const source = await readSourceLibrary();
const entries = dedupeEntries(source.entries);
const resolvedEntries = [];
const movies = [];
const generatedAt = new Date().toISOString();

for (const [index, entry] of entries.entries()) {
  const match = entry.tmdbId
    ? { id: entry.tmdbId, media_type: entry.media_type || "movie" }
    : await findMovieMatch(entry);

  if (!match) {
    console.warn(`未找到匹配电影: ${entry.title}${entry.year ? ` (${entry.year})` : ""}`);
    continue;
  }

  const detail = await getMediaDetails(match.media_type || "movie", match.id);
  resolvedEntries.push({
    ...entry,
    title: detail.title,
    year: Number(detail.release_date?.slice(0, 4)) || entry.year,
    tmdbId: detail.id,
    media_type: match.media_type || entry.media_type || "movie",
  });
  movies.push(transformMedia(detail, match.media_type || "movie", index));
  console.log(`已解析 ${index + 1}/${entries.length}: ${detail.title} (${detail.release_date?.slice(0, 4) || "未知"})`);
}

await writeSourceLibrary({
  title: source.title,
  subtitle: source.subtitle,
  generatedAt,
  entries: resolvedEntries,
});

await writeResolvedLibrary({
  title: source.title,
  subtitle: source.subtitle,
  generatedAt,
  movies,
});

console.log(`静态片库已生成：${movies.length} 部电影。`);

async function findMovieMatch(entry) {
  const results = await searchMedia(entry.title, entry.year);
  return pickBestResult(results || [], entry);
}

function transformMedia(detail, mediaType, index) {
  const title = mediaType === "tv" ? detail.name : detail.title;
  const originalTitle = mediaType === "tv" ? detail.original_name : detail.original_title;
  const releaseDate = mediaType === "tv" ? detail.first_air_date : detail.release_date;
  const runtime = mediaType === "tv"
    ? Number(detail.episode_run_time?.[0] || 0)
    : detail.runtime;

  return {
    id: detail.id,
    order: index,
    media_type: mediaType,
    title,
    original_title: originalTitle,
    overview: detail.overview,
    release_date: releaseDate,
    release_country: getReleaseRegion(detail, mediaType),
    poster_path: detail.poster_path,
    backdrop_path: detail.backdrop_path,
    vote_average: detail.vote_average,
    vote_count: detail.vote_count,
    runtime,
    popularity: detail.popularity,
    genres: detail.genres || [],
    production_countries: getProductionCountries(detail, mediaType),
    production_companies: detail.production_companies || [],
    spoken_languages: detail.spoken_languages || [],
    cast: (detail.credits?.cast || []).slice(0, 10).map((person) => ({
      name: person.name,
      character: person.character,
    })),
  };
}

function getReleaseRegion(detail, mediaType) {
  if (mediaType === "tv") {
    return (detail.origin_country || [])[0] || "";
  }

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

function getProductionCountries(detail, mediaType) {
  if (mediaType === "tv") {
    return (detail.origin_country || []).map((code) => ({
      iso_3166_1: code,
      name: code,
    }));
  }

  return detail.production_countries || [];
}
