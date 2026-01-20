/**
 * Subs.sab.bz provider for Bulgarian subtitles
 */

const axios = require('axios');
const http = require('http');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
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
  timeout: 15000,
  responseType: 'arraybuffer'  // Get raw bytes to handle encoding
});

async function searchSubtitlesByQuery(searchTitle, year = null, imdbId = null) {
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

    const response = await client.post(`${BASE_URL}/index.php`, formData.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': BASE_URL,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'bg,en-US;q=0.7,en;q=0.3'
      }
    });

    // Decode from windows-1251 (Bulgarian encoding used by subs.sab.bz)
    const html = iconv.decode(Buffer.from(response.data), 'windows-1251');
    const $ = cheerio.load(html);
    const results = [];

    // Parse subtitle table rows with class "subs-row"
    $('tr.subs-row').each((index, element) => {
      const $row = $(element);

      // Find the download link - it contains "act=download&attach_id="
      const $downloadLink = $row.find('a[href*="act=download"]').first();
      if (!$downloadLink.length) return;

      const href = $downloadLink.attr('href') || '';

      // Extract attach_id from URL like: act=download&attach_id=83129
      const idMatch = href.match(/attach_id=(\d+)/);
      if (!idMatch) return;

      const subtitleId = idMatch[1];

      // Get the title from the download link text
      const subtitleTitle = $downloadLink.text().trim();
      if (!subtitleTitle) return;

      // Get additional info from specific cells
      const cells = $row.find('td');
      let fps = null;
      let uploader = null;
      let downloads = null;

      // FPS is usually in the 8th column (index 7) with class c5
      const fpsCell = $row.find('td.c5, td:nth-child(8)').first();
      if (fpsCell.length) {
        const fpsText = fpsCell.text().trim();
        if (/^\d+(\.\d+)?$/.test(fpsText)) {
          fps = fpsText;
        }
      }

      // Uploader is in cell with class c6 or has link to forum user
      const $uploaderLink = $row.find('a[href*="showuser"]').first();
      if ($uploaderLink.length) {
        uploader = $uploaderLink.text().trim();
      }

      // Downloads count is in the 11th column (index 10) with class c8
      const dlCell = $row.find('td.c8, td:nth-child(11)').first();
      if (dlCell.length) {
        const dlText = dlCell.text().trim();
        if (/^\d+$/.test(dlText)) {
          downloads = dlText;
        }
      }

      // Extract year from title if present (e.g., "Movie Name (2024)")
      let resultYear = null;
      const yearMatch = subtitleTitle.match(/\((\d{4})\)/);
      if (yearMatch) {
        resultYear = yearMatch[1];
      }

      results.push({
        provider: PROVIDER,
        providerName: PROVIDER_NAME,
        id: subtitleId,
        title: subtitleTitle.replace(/\s*\(\d{4}\)\s*$/, '').trim(),  // Remove year from title
        year: resultYear,
        fps: fps,
        uploader: uploader,
        downloads: downloads
      });
    });

    const limitedResults = results.slice(0, 20);
    console.log(`[SubsSab] Found ${limitedResults.length} subtitles`);

    cache.set(cacheKey, limitedResults);
    return limitedResults;
  } catch (error) {
    console.error(`[SubsSab] Search error:`, error.message);
    return [];
  }
}

async function aggregateSearch(queries, year = null, imdbId = null) {
  const results = [];
  const seenIds = new Set();

  for (const query of queries) {
    const queryResults = await searchSubtitlesByQuery(query, year, imdbId);
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

  if (season && episode) {
    const seasonPadded = String(season).padStart(2, '0');
    const episodePadded = String(episode).padStart(2, '0');

    // SubsSab uses DDxDD format for episodes
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
  let results = await aggregateSearch([queries[0]], year, imdbId);

  if (results.length === 0 && queries.length > 1) {
    results = await aggregateSearch(queries.slice(1), year, imdbId);
  }

  // Try without year if no results
  if (results.length === 0 && year) {
    results = await aggregateSearch(queries, null, imdbId);
  }

  return results;
}

/**
 * Get subtitle download URL
 * Note: SubsSab uses attach_id parameter
 * @param {string} subtitleId - The subtitle ID (attach_id)
 * @returns {string} Direct download URL
 */
function getDownloadUrl(subtitleId) {
  return `${BASE_URL}/index.php?act=download&attach_id=${subtitleId}`;
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
