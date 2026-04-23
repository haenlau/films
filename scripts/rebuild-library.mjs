import { getMovieDetails, pickBestResult, searchMovies } from "./lib/movie-db.mjs";
import { dedupeEntries, readSourceLibrary, writeResolvedLibrary, writeSourceLibrary } from "./lib/library-files.mjs";

const source = await readSourceLibrary();
const entries = dedupeEntries(source.entries);
const resolvedEntries = [];
const movies = [];
const generatedAt = new Date().toISOString();

for (const [index, entry] of entries.entries()) {
  const match = entry.tmdbId
    ? { id: entry.tmdbId }
    : await findMovieMatch(entry);

  if (!match) {
    console.warn(`未找到匹配电影: ${entry.title}${entry.year ? ` (${entry.year})` : ""}`);
    continue;
  }

  const detail = await getMovieDetails(match.id);
  resolvedEntries.push({
    ...entry,
    title: detail.title,
    year: Number(detail.release_date?.slice(0, 4)) || entry.year,
    tmdbId: detail.id,
  });
  movies.push(transformMovie(detail, index));
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
  const searchResult = await searchMovies(entry.title, entry.year);
  return pickBestResult(searchResult.results || [], entry);
}

function transformMovie(detail, index) {
  return {
    id: detail.id,
    order: index,
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
