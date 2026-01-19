/**
 * IMDB scraper to get movie/series information from IMDB ID
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { Cache } = require('./utils');

// Cache IMDB results for 24 hours (they rarely change)
const cache = new Cache(24 * 60 * 60 * 1000);

/**
 * Get movie/series information from IMDB ID
 * @param {string} imdbId - IMDB ID (e.g., "tt0133093")
 * @param {string|null} typeHint - Optional type hint ("movie" or "series")
 * @returns {Promise<{title: string, year: number, type: string}>}
 */
async function getIMDBInfo(imdbId, typeHint = null) {
  // Check cache first
  if (cache.has(imdbId)) {
    console.log(`[IMDB] Cache hit for ${imdbId}`);
    return cache.get(imdbId);
  }

  console.log(`[IMDB] Fetching info for ${imdbId}`);

  try {
    const infoFromCinemeta = await getCinemetaInfo(imdbId, typeHint);
    if (infoFromCinemeta) {
      cache.set(imdbId, infoFromCinemeta);
      return infoFromCinemeta;
    }

    const url = `https://www.imdb.com/title/${imdbId}/`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    // Try to get title from various sources
    let title = null;
    let year = null;
    let type = 'movie'; // Default to movie

    // Method 1: Try og:title meta tag
    const ogTitle = $('meta[property="og:title"]').attr('content');
    if (ogTitle) {
      // Format: "Title (Year)" or "Title (TV Series 2019–2023)"
      const match = ogTitle.match(/^(.+?)\s+\((?:TV Series\s+)?(\d{4})/);
      if (match) {
        title = match[1].trim();
        year = parseInt(match[2], 10);
        if (ogTitle.includes('TV Series') || ogTitle.includes('TV Mini Series')) {
          type = 'series';
        }
      }
    }

    // Method 2: Try structured data (JSON-LD)
    if (!title) {
      const jsonLd = $('script[type="application/ld+json"]').first();
      if (jsonLd.length) {
        try {
          const data = JSON.parse(jsonLd.html());
          if (data.name) {
            title = data.name;
          }
          if (data.datePublished) {
            year = parseInt(data.datePublished.substring(0, 4), 10);
          }
          if (data['@type'] === 'TVSeries') {
            type = 'series';
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
    }

    // Method 3: Try h1 tag with data-testid
    if (!title) {
      const h1 = $('h1[data-testid="hero__pageTitle"]').text().trim();
      if (h1) {
        title = h1;
      }
    }

    // Method 4: Try year from release info
    if (!year) {
      const releaseYear = $('a[href*="/releaseinfo"]').first().text().trim();
      if (releaseYear && /^\d{4}$/.test(releaseYear)) {
        year = parseInt(releaseYear, 10);
      }
    }

    // Method 5: Try to detect series from page structure
    if ($('[data-testid="hero-subnav-bar-series-episode-guide-button"]').length > 0) {
      type = 'series';
    }

    if (!title) {
      throw new Error(`Could not extract title from IMDB page for ${imdbId}`);
    }

    const info = {
      title: title,
      year: year || null,
      type: type
    };

    // Cache the result
    cache.set(imdbId, info);

    console.log(`[IMDB] Found: ${info.title} (${info.year}) - ${info.type}`);
    return info;

  } catch (error) {
    console.error(`[IMDB] Error fetching ${imdbId}:`, error.message);
    throw error;
  }
}

async function getCinemetaInfo(imdbId, typeHint) {
  const typesToTry = [];
  const seenTypes = new Set();

  if (typeHint) {
    typesToTry.push(typeHint);
  } else {
    typesToTry.push('series', 'movie');
  }

  for (const type of typesToTry) {
    if (seenTypes.has(type)) {
      continue;
    }
    seenTypes.add(type);

    try {
      const url = `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      const meta = response.data && response.data.meta ? response.data.meta : null;
      if (!meta || !meta.name) {
        continue;
      }

      const info = {
        title: meta.name,
        year: meta.year ? parseInt(meta.year, 10) : null,
        type: type
      };

      console.log(`[IMDB] Cinemeta hit: ${info.title} (${info.year}) - ${info.type}`);
      return info;
    } catch (error) {
      // Try next type or fallback to IMDB
    }
  }

  return null;
}

module.exports = {
  getIMDBInfo
};
