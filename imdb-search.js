#!/usr/bin/env node

import fetch from "node-fetch";

const query = process.argv.slice(2).join(" ").trim();
if (!query) {
  console.error("Usage: imdb-search <TITLE | IMDB_URL | TITLE_ID>");
  process.exit(1);
}

function extractTtId(str) {
  const match = str.match(/(tt\d+)/);
  return match ? match[1] : null;
}

async function getSeriesDetails(id) {
  const gqlQuery = `query {
    title(id: "${id}") {
      titleType { id text isSeries }
      episodes {
        seasons { number }
        episodes(first: 1) {
          total
        }
      }
    }
  }`;

  try {
    const res = await fetch("https://caching.graphql.imdb.com/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Origin": "https://www.imdb.com",
        "Referer": "https://www.imdb.com/",
        "x-imdb-client-name": "imdb-web-next-localized",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
      },
      body: JSON.stringify({ query: gqlQuery })
    });

    if (!res.ok) return null;
    const json = await res.json();
    const title = json.data?.title;
    if (!title || !title.episodes) return null;

    const episodes = title.episodes.episodes?.total ?? null;
    const seasonsList = (title.episodes.seasons || []).filter(
      s => typeof s.number === "number" && s.number > 0
    );
    const seasons = seasonsList.length || null;

    return { episodes, seasons };
  } catch {
    return null;
  }
}

async function searchImdb(q) {
  const ttId = extractTtId(q);
  let results = [];

  if (ttId) {
    const url = `https://v3.sg.media-imdb.com/suggestion/x/${ttId}.json`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
      }
    });
    if (res.ok) {
      const json = await res.json();
      results = json.d || [];
    }
  } else {
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
    results = (json.d || []).filter(r => r.id && r.id.startsWith("tt"));
  }

  if (results.length === 0) {
    console.log(`No results found for "${q}".`);
    return;
  }

  const topResults = results.slice(0, 5);

  // Fetch episodes/seasons details in parallel
  const details = await Promise.all(topResults.map(r => getSeriesDetails(r.id)));

  console.log(`Found ${results.length} result(s) for "${q}":\n`);
  topResults.forEach((r, idx) => {
    const year = r.y || r.yr || "N/A";
    const type = r.q || r.qid || "N/A";
    const title = r.l;
    const imdbUrl = `https://www.imdb.com/title/${r.id}/`;
    const posterUrl = r.i && r.i.imageUrl ? `${r.i.imageUrl.split("._")[0]}._V1_UX1000_.jpg` : null;
    const seriesInfo = details[idx];

    console.log(`[${idx + 1}] ${imdbUrl}`);
    console.log(`  - title: ${JSON.stringify(`${title} (${year}, ${type})`)}`);
    if (posterUrl) {
      console.log(`    image_url: ${posterUrl}`);
    } else {
      console.log(`    (No poster available)`);
    }
    if (seriesInfo) {
      if (seriesInfo.episodes !== null) {
        console.log(`    number_of_episodes: ${seriesInfo.episodes}`);
      }
      if (seriesInfo.seasons !== null) {
        console.log(`    number_of_seasons: ${seriesInfo.seasons}`);
      }
    }
    console.log();
  });
}

searchImdb(query).catch(err => {
  console.error(err.message);
  process.exit(1);
});
