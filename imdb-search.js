#!/usr/bin/env node

import fetch from "node-fetch";

const query = process.argv.slice(2).join(" ");
if (!query) {
  console.error("Usage: imdb-search <TITLE>");
  process.exit(1);
}

async function searchImdb(q) {
  const clean = q.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (!clean) {
    console.error("Invalid search query");
    process.exit(1);
  }

  const first = clean[0];
  const url = `https://v3.sg.media-imdb.com/suggestion/${first}/${clean}.json`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to query IMDb API: ${res.statusText}`);
  }

  const json = await res.json();
  const results = (json.d || []).filter(r => r.id && r.id.startsWith("tt"));

  if (results.length === 0) {
    console.log(`No results found for "${q}".`);
    return;
  }

  console.log(`Found ${results.length} result(s) for "${q}":\n`);
  results.slice(0, 5).forEach((r, idx) => {
    const year = r.y || r.yr || "N/A";
    const type = r.q || r.qid || "N/A";
    const title = r.l;
    const imdbUrl = `https://www.imdb.com/title/${r.id}/`;
    const posterUrl = r.i && r.i.imageUrl ? `${r.i.imageUrl.split("._")[0]}._V1_UX1000_.jpg` : null;

    console.log(`[${idx + 1}] ${title} (${year}, ${type})`);
    console.log(`    IMDb: ${imdbUrl}`);
    if (posterUrl) {
      console.log(`    image_url: ${posterUrl}`);
    } else {
      console.log(`    (No poster available)`);
    }
    console.log();
  });
}

searchImdb(query).catch(err => {
  console.error(err.message);
  process.exit(1);
});
