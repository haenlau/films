import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { getMovieDetails, searchMovies } from "./lib/movie-db.mjs";
import { dedupeEntries, readSourceLibrary, writeResolvedLibrary, writeSourceLibrary } from "./lib/library-files.mjs";
import { pickBestResult } from "./lib/movie-db.mjs";

const rawTitle = process.argv.slice(2).join(" ").trim();
if (!rawTitle) {
  console.error("用法：npm run add:movie -- 电影名");
  process.exit(1);
}

const source = await readSourceLibrary();
const searchResult = await searchMovies(rawTitle);
const candidates = (searchResult.results || []).slice(0, 8);

if (!candidates.length) {
  console.error(`没有找到与「${rawTitle}」匹配的电影。`);
  process.exit(1);
}

console.log(`找到 ${candidates.length} 个候选结果：`);
candidates.forEach((movie, index) => {
  console.log(`${index + 1}. ${movie.title} (${movie.release_date?.slice(0, 4) || "未知"}) | id=${movie.id}`);
});

const rl = readline.createInterface({ input, output });
const answer = await rl.question("请选择编号（直接回车默认第 1 个）：");
rl.close();

const selectedIndex = Math.max(1, Number(answer || 1)) - 1;
const selected = candidates[selectedIndex] || pickBestResult(candidates, { title: rawTitle });

source.entries = dedupeEntries([
  ...source.entries,
  {
    title: selected.title,
    year: Number(selected.release_date?.slice(0, 4)) || undefined,
    tmdbId: selected.id,
  },
]);

await writeSourceLibrary(source);

const movies = [];
for (const [index, entry] of source.entries.entries()) {
  const matched = entry.tmdbId
    ? { id: entry.tmdbId }
    : await findMovieMatch(entry);
  if (!matched) {
    continue;
  }

  const detail = await getMovieDetails(matched.id);
  movies.push(transformMovie(detail, index));
}

await writeResolvedLibrary({
  title: source.title,
  subtitle: source.subtitle,
  movies,
});

console.log(`已添加：${selected.title}。`);

async function findMovieMatch(entry) {
  const result = await searchMovies(entry.title, entry.year);
  return pickBestResult(result.results || [], entry);
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
