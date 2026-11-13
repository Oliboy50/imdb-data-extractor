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

function inferAnimeGenres(imdbTitle) {
  const genres = new Set();
  const interests = (imdbTitle?.interests?.edges || []).map(e => ({
    id: e.node.id,
    text: e.node.primaryText?.text || ""
  }));
  const interestTexts = interests.map(i => i.text);
  const keywords = (imdbTitle?.keywords?.edges || []).map(e => (e.node.text || "").toLowerCase());
  const imdbGenres = (imdbTitle?.genres?.genres || []).map(g => g.text);
  const cert = imdbTitle?.certificate?.rating || null;

  // 1. Explicit IMDb demographic interests
  for (const int of interests) {
    if (int.id === "in0000206" || /sh[oō]nen|shounen/i.test(int.text)) genres.add("shonen");
    if (int.id === "in0000207" || /sh[oō]jo|shoujo/i.test(int.text)) genres.add("shojo");
    if (int.id === "in0000205" || /seinen/i.test(int.text)) genres.add("seinen");
    if (int.id === "in0000203" || /josei/i.test(int.text)) genres.add("josei");
    if (/kodomo/i.test(int.text)) genres.add("kodomuke");
  }

  // 2. Explicit IMDb keywords
  for (const kw of keywords) {
    if (/\b(shonen|shounen|shōnen)\b/i.test(kw)) genres.add("shonen");
    if (/\b(shojo|shoujo|shōjo)\b/i.test(kw)) genres.add("shojo");
    if (/\b(seinen)\b/i.test(kw)) genres.add("seinen");
    if (/\b(josei)\b/i.test(kw)) genres.add("josei");
    if (/\b(kodomo|kodomomuke|kodomuke|children's anime|kids anime)\b/i.test(kw)) genres.add("kodomuke");
  }

  // 3. Fallback inference from IMDb interests, genres, keywords, and certificate
  if (genres.size === 0) {
    const isMature =
      cert === "TV-MA" ||
      cert === "R" ||
      cert === "NC-17" ||
      interestTexts.includes("Splatter Horror") ||
      interestTexts.includes("Psychological Thriller") ||
      interestTexts.includes("Psychological Horror") ||
      interestTexts.includes("Erotica") ||
      interestTexts.includes("Cyberpunk") ||
      interestTexts.includes("Hardboiled");

    if (
      !isMature &&
      (interestTexts.includes("Family") ||
        imdbGenres.includes("Family") ||
        cert === "TV-Y" ||
        cert === "TV-Y7")
    ) {
      genres.add("kodomuke");
    }

    if (
      keywords.some(k => /otome|villainess|reverse harem|magical girl|shojo/i.test(k)) ||
      (interestTexts.includes("Teen Romance") && !isMature)
    ) {
      genres.add("shojo");
    }

    if (isMature || interestTexts.includes("Psychological Drama") || interestTexts.includes("Seinen")) {
      genres.add("seinen");
    }

    if (
      genres.size === 0 ||
      interestTexts.includes("Isekai") ||
      interestTexts.includes("Sword & Sorcery") ||
      interestTexts.includes("Martial Arts") ||
      interestTexts.includes("Superhero") ||
      interestTexts.includes("Teen Adventure")
    ) {
      if (!isMature && !genres.has("shojo")) {
        genres.add("shonen");
      }
    }

    if (genres.size === 0) {
      genres.add("shonen");
    }
  }

  const order = ["shonen", "shojo", "seinen", "josei", "kodomuke"];
  return order.filter(g => genres.has(g));
}

async function getSeriesDetails(id) {
  const gqlQuery = `query {
    title(id: "${id}") {
      titleType { id text isSeries }
      releaseYear { year }
      certificate { rating }
      genres { genres { text } }
      interests(first: 20) { edges { node { id primaryText { text } } } }
      keywords(first: 50) { edges { node { text } } }
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
    if (!title) return null;

    const episodes = title.episodes?.episodes?.total ?? null;
    const seasonsList = (title.episodes?.seasons || []).filter(
      s => typeof s.number === "number" && s.number > 0
    );
    const seasons = seasonsList.length || null;
    const year = title.releaseYear?.year ?? null;
    const genre = inferAnimeGenres(title);

    return { episodes, seasons, year, genre };
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
    const seriesInfo = details[idx];
    const releaseYear = seriesInfo?.year || r.y || (typeof r.yr === "string" ? parseInt(r.yr, 10) : null);
    const yearDisplay = r.y || r.yr || releaseYear || "N/A";
    const type = r.q || r.qid || "N/A";
    const title = r.l;
    const imdbUrl = `https://www.imdb.com/title/${r.id}/`;
    const posterUrl = r.i && r.i.imageUrl ? `${r.i.imageUrl.split("._")[0]}._V1_UX1000_.jpg` : null;

    console.log(`[${idx + 1}] ${imdbUrl}`);
    console.log(`  - title: ${JSON.stringify(`${title} (${yearDisplay}, ${type})`)}`);
    if (posterUrl) {
      console.log(`    image_url: ${posterUrl}`);
    } else {
      console.log(`    (No poster available)`);
    }
    console.log(`    imdb: ${imdbUrl}`);
    if (seriesInfo && seriesInfo.genre && seriesInfo.genre.length > 0) {
      console.log(`    genre: [${seriesInfo.genre.join(", ")}]`);
    }
    if (releaseYear) {
      console.log(`    year: ${releaseYear}`);
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
