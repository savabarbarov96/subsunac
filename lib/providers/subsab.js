/**
 * Subs.sab.bz provider for Bulgarian subtitles
 */

const axios = require('axios');
const http = require('http');
const cheerio = require('cheerio');
const { sanitizeTitle, formatSeriesTitle, Cache } = require('../utils');

const PROVIDER = 'subsab';
const PROVIDER_NAME = 'SubsSab';
const BASE_URL = 'http://subs.sab.bz';  // Note: HTTP, not HTTPS

// Cache search results for 1 hour
const cache = new Cache(60 * 60 * 1000);

// Create axios instance with HTTP agent for subs.sab.bz
const httpAgent = new http.Agent({
  keepAlive: true
});

const client = axios.create({
  httpAgent,
  timeout: 15000
});

async function searchSubtitlesByQuery(searchTitle, year = null, imdbId = null, isEpisode = false) {
  const cacheKey = `subsab_${searchTitle}_${year || 'no-year'}_${imdbId || 'no-imdb'}`;

  if (cache.has(cacheKey)) {
    console.log(`[SubsSab] Cache hit for "${searchTitle}"`);
    return cache.get(cacheKey);
  }

  console.log(`[SubsSab] Searching for "${searchTitle}" (year: ${year || 'n/a'}, imdb: ${imdbId || 'n/a'})`);

  try {
    const formData = new URLSearchParams({
      'act': 'search',
      'movie': searchTitle,
      'select-language': '2',  // 2 = Bulgarian, 1 = English
      'imdb': imdbId ? imdbId.replace('tt', '') : '',  // Just the numeric part
      'yr': year || ''
    });

    const response = await client.post(`${BASE_URL}/index.php?`, formData.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': BASE_URL,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'bg,en-US;q=0.7,en;q=0.3'
      }
    });

    const $ = cheerio.load(response.data);
    const results = [];

    // Parse subtitle table rows - look for subs-row class
    $('tr.subs-row, .subs-row, tr[class*="sub"]').each((index, element) => {
      const $row = $(element);

      // Find subtitle link
      const $link = $row.find('a[href*="index.php?"], a[href*="getfile"]').first();
      if (!$link.length) {
        // Try alternative link patterns
        const $altLink = $row.find('a').filter((i, el) => {
          const href = $(el).attr('href') || '';
          return href.includes('id=') || href.includes('sub');
        }).first();
        if (!$altLink.length) return;
      }

      const $titleLink = $link.length ? $link : $row.find('a').first();
      const href = $titleLink.attr('href') || '';

      // Extract subtitle ID from various URL patterns
      let subtitleId = null;
      const idMatch = href.match(/[?&]id=(\d+)/) ||
                      href.match(/getfile\.php\?id=(\d+)/) ||
                      href.match(/\/(\d+)(?:\/|$)/);

      if (idMatch) {
        subtitleId = idMatch[1];
      }

      if (!subtitleId) return;

      const subtitleTitle = $titleLink.text().trim() || $row.find('td').first().text().trim();
      if (!subtitleTitle) return;

      // Get additional info from table cells
      const cells = $row.find('td');
      let fps = null;
      let uploader = null;
      let downloads = null;

      cells.each((i, cell) => {
        const text = $(cell).text().trim();

        // Check for FPS (number between 23 and 60)
        if (/^\d+(\.\d+)?$/.test(text)) {
          const num = parseFloat(text);
          if (num >= 23 && num <= 60) {
            fps = text;
          } else if (num > 0 && !downloads) {
            downloads = text;
          }
        }
      });

      // Find uploader
      const $uploaderLink = $row.find('a[href*="user"], a[href*="profile"]').first();
      if ($uploaderLink.length) {
        uploader = $uploaderLink.text().trim();
      }

      results.push({
        provider: PROVIDER,
        providerName: PROVIDER_NAME,
        id: subtitleId,
        title: subtitleTitle,
        year: null,
        fps: fps,
        uploader: uploader,
        downloads: downloads
      });
    });

    // Fallback: Try parsing general table structure
    if (results.length === 0) {
      $('table tr').each((index, element) => {
        const $row = $(element);
        if ($row.find('th').length) return;  // Skip header rows

        const $link = $row.find('a').filter((i, el) => {
          const href = $(el).attr('href') || '';
          return href.includes('id=') || href.includes('getfile');
        }).first();

        if (!$link.length) return;

        const href = $link.attr('href');
        const idMatch = href.match(/[?&]id=(\d+)/) || href.match(/getfile\.php\?id=(\d+)/);
        if (!idMatch) return;

        const subtitleId = idMatch[1];
        const subtitleTitle = $link.text().trim();

        if (!subtitleTitle) return;

        results.push({
          provider: PROVIDER,
          providerName: PROVIDER_NAME,
          id: subtitleId,
          title: subtitleTitle,
          year: null,
          fps: null,
          uploader: null,
          downloads: null
        });
      });
    }

    const limitedResults = results.slice(0, 20);
    console.log(`[SubsSab] Found ${limitedResults.length} subtitles`);

    cache.set(cacheKey, limitedResults);
    return limitedResults;
  } catch (error) {
    console.error(`[SubsSab] Search error:`, error.message);
    return [];
  }
}

async function aggregateSearch(queries, year = null, imdbId = null, isEpisode = false) {
  const results = [];
  const seenIds = new Set();

  for (const query of queries) {
    const queryResults = await searchSubtitlesByQuery(query, year, imdbId, isEpisode);
    for (const item of queryResults) {
      const uniqueKey = `${item.provider}_${item.id}`;
      if (!seenIds.has(uniqueKey)) {
        seenIds.add(uniqueKey);
        results.push(item);
      }
    }
    if (results.length >= 20) {
      break;
    }
  }

  return results.slice(0, 20);
}

/**
 * Search for subtitles on subs.sab.bz
 * @param {string} title - Movie/series title
 * @param {number} year - Release year (optional)
 * @param {number} season - Season number (for series, optional)
 * @param {number} episode - Episode number (for series, optional)
 * @param {string} imdbId - IMDB ID (optional)
 * @returns {Promise<Array>} Array of subtitle results
 */
async function search(title, year = null, season = null, episode = null, imdbId = null) {
  const baseTitle = sanitizeTitle(title);
  if (!baseTitle) {
    return [];
  }

  const queries = [];
  const addQuery = (query) => {
    if (!query || queries.includes(query)) {
      return;
    }
    queries.push(query);
  };

  const isEpisode = season && episode;

  if (isEpisode) {
    const seasonPadded = String(season).padStart(2, '0');
    const episodePadded = String(episode).padStart(2, '0');

    // SubsSab may use DDxDD format for episodes
    addQuery(`${baseTitle} ${season}x${episodePadded}`);
    addQuery(`${baseTitle} S${seasonPadded}E${episodePadded}`);
    addQuery(formatSeriesTitle(baseTitle, season, episode));
  } else {
    addQuery(baseTitle);
  }

  if (queries.length === 0) {
    return [];
  }

  // Try with IMDB ID if available
  let results = await aggregateSearch([queries[0]], year, imdbId, isEpisode);

  if (results.length === 0 && queries.length > 1) {
    results = await aggregateSearch(queries.slice(1), year, imdbId, isEpisode);
  }

  // Try without year if no results
  if (results.length === 0 && year) {
    results = await aggregateSearch(queries, null, imdbId, isEpisode);
  }

  return results;
}

/**
 * Get subtitle download URL
 * @param {string} subtitleId - The subtitle ID
 * @returns {string} Direct download URL
 */
function getDownloadUrl(subtitleId) {
  return `${BASE_URL}/index.php?act=download&id=${subtitleId}`;
}

/**
 * Download subtitle file from SubsSab
 * @param {string} subtitleId - The subtitle ID
 * @returns {Promise<Buffer>} Subtitle file buffer
 */
async function downloadSubtitle(subtitleId) {
  const downloadUrl = getDownloadUrl(subtitleId);

  const response = await client.get(downloadUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': BASE_URL
    },
    responseType: 'arraybuffer',
    timeout: 25000,
    maxRedirects: 5
  });

  return Buffer.from(response.data);
}

module.exports = {
  search,
  getDownloadUrl,
  downloadSubtitle,
  PROVIDER,
  PROVIDER_NAME,
  BASE_URL
};
