#!/usr/bin/env node

import fetch from "node-fetch";
import { load } from "cheerio";

const imdbUrl = process.argv[2];
if (!imdbUrl) {
  console.error("Usage: imdb-poster <IMDB_URL>");
  process.exit(1);
}

async function getImdbPoster(url) {
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

getImdbPoster(imdbUrl)
  .then(console.log)
  .catch(err => {
    console.error(err.message);
    process.exit(1);
  });

