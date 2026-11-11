#!/usr/bin/env node

import fetch from "node-fetch";
import { load } from "cheerio";

const input = process.argv[2];
if (!input) {
  console.error("Usage: imdb-poster <IMDB_URL | TITLE_ID | TITLE>");
  process.exit(1);
}

function extractTtId(str) {
  const match = str.match(/(tt\d+)/);
  return match ? match[1] : null;
}

async function getPosterFromApiById(ttId) {
  const url = `https://v3.sg.media-imdb.com/suggestion/x/${ttId}.json`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
    }
  });
  if (!res.ok) return null;
  const json = await res.json();
  const item = json.d && json.d[0];
  if (item && item.i && item.i.imageUrl) {
    const base = item.i.imageUrl.split("._")[0];
    return `    image_url: ${base}._V1_UX1000_.jpg`;
  }
  return null;
}

async function searchPosterByTitle(query) {
  const clean = query.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (!clean) return null;
  const first = clean[0];
  const url = `https://v3.sg.media-imdb.com/suggestion/${first}/${clean}.json`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
    }
  });
  if (!res.ok) return null;
  const json = await res.json();
  const results = (json.d || []).filter(r => r.id && r.id.startsWith("tt") && r.i && r.i.imageUrl);
  if (results.length > 0) {
    const base = results[0].i.imageUrl.split("._")[0];
    return `    image_url: ${base}._V1_UX1000_.jpg`;
  }
  return null;
}

async function getImdbPosterFallback(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7"
    }
  });

  const html = await res.text();
  const $ = load(html);

  const img =
    $('[data-testid="hero-media__poster"] img').attr("src") ||
    $('[data-testid="hero-media__poster"] img')
      .attr("srcset")
      ?.split(",")[0]
      ?.trim()
      ?.split(" ")[0];

  if (!img) {
    throw new Error("Poster not found (markup changed or blocked)");
  }

  const base = img.split("._")[0];
  return `    image_url: ${base}._V1_UX1000_.jpg`;
}

async function getPoster(queryOrUrl) {
  const ttId = extractTtId(queryOrUrl);
  if (ttId) {
    try {
      const poster = await getPosterFromApiById(ttId);
      if (poster) return poster;
    } catch {
      // Fall through to HTML scraping if API fails
    }

    if (queryOrUrl.startsWith("http")) {
      return await getImdbPosterFallback(queryOrUrl);
    }
  }

  // Not a tt ID or URL, search by title
  const poster = await searchPosterByTitle(queryOrUrl);
  if (poster) return poster;

  throw new Error("Poster not found for: " + queryOrUrl);
}

getPoster(input)
  .then(console.log)
  .catch(err => {
    console.error(err.message);
    process.exit(1);
  });
