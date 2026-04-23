import { readFile, writeFile } from "node:fs/promises";

export const SOURCE_LIBRARY_PATH = new URL("../../data/library.json", import.meta.url);
export const RESOLVED_LIBRARY_PATH = new URL("../../data/library.resolved.json", import.meta.url);
export const SOURCE_LIBRARY_SCRIPT_PATH = new URL("../../data/library.source.js", import.meta.url);
export const RESOLVED_LIBRARY_SCRIPT_PATH = new URL("../../data/library.resolved.js", import.meta.url);

export async function readSourceLibrary() {
  const raw = await readFile(SOURCE_LIBRARY_PATH, "utf8");
  const data = JSON.parse(raw);
  return {
    title: data.title || "我的电影墙",
    subtitle: data.subtitle || "",
    entries: Array.isArray(data.entries) ? data.entries : [],
  };
}

export async function writeSourceLibrary(data) {
  await writeFile(SOURCE_LIBRARY_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await writeFile(
    SOURCE_LIBRARY_SCRIPT_PATH,
    `window.__FILM_VAULT_SOURCE__ = ${JSON.stringify(data, null, 2)};\n`,
    "utf8"
  );
}

export async function writeResolvedLibrary(data) {
  await writeFile(RESOLVED_LIBRARY_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await writeFile(
    RESOLVED_LIBRARY_SCRIPT_PATH,
    `window.__FILM_VAULT_RESOLVED__ = ${JSON.stringify(data, null, 2)};\n`,
    "utf8"
  );
}

export function dedupeEntries(entries) {
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
