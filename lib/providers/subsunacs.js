/**
 * Subsunacs.net provider for Bulgarian subtitles
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { sanitizeTitle, formatSeriesTitle, Cache } = require('../utils');

const PROVIDER = 'subsunacs';
const PROVIDER_NAME = 'Subsunacs';
const BASE_URL = 'https://subsunacs.net';

// Cache search results for 1 hour
const cache = new Cache(60 * 60 * 1000);

async function searchSubtitlesByQuery(searchTitle, year = null) {
  const cacheKey = `subsunacs_${searchTitle}_${year || 'no-year'}`;

  if (cache.has(cacheKey)) {
    console.log(`[Subsunacs] Cache hit for "${searchTitle}"`);
    return cache.get(cacheKey);
  }

  console.log(`[Subsunacs] Searching for "${searchTitle}" (year: ${year || 'n/a'})`);

  try {
    const formData = new URLSearchParams({
      'm': searchTitle,
      'y': year || '',
      'l': '0',  // 0 = Bulgarian
      'action': 'search',
      'c': '',
      'd': '',
      'u': '',
      'g': '',
      't': '',
      'imdbcheck': '1'
    });

    const response = await axios.post(`${BASE_URL}/search.php`, formData.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': BASE_URL,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'bg,en-US;q=0.7,en;q=0.3'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const results = [];

    $('table tr').each((index, element) => {
      const $row = $(element);

      if ($row.attr('onmouseover')) {
        const cells = $row.find('td');
        const linkCell = cells.eq(0);
        const link = linkCell.find('a').attr('href');

        if (!link) return;

        const idMatch = link.match(/\/subtitles\/.+-(\d+)\//);
        if (!idMatch) return;

        const subtitleId = idMatch[1];
        const subtitleTitle = linkCell.find('a').text().trim();
        const yearText = linkCell.find('span.smGray').text().trim();
        const yearMatch = yearText.match(/\((\d{4})\)/);
        const resultYear = yearMatch ? yearMatch[1] : '';
        const fps = cells.eq(2).text().trim();
        const uploader = cells.eq(5).find('a').text().trim();
        const downloads = cells.eq(6).text().trim();

        results.push({
          provider: PROVIDER,
          providerName: PROVIDER_NAME,
          id: subtitleId,
          title: subtitleTitle,
          year: resultYear,
          fps: fps || null,
          uploader: uploader || null,
          downloads: downloads || null
        });
      }
    });

    const limitedResults = results.slice(0, 20);
    console.log(`[Subsunacs] Found ${limitedResults.length} subtitles`);

    cache.set(cacheKey, limitedResults);
    return limitedResults;
  } catch (error) {
    console.error(`[Subsunacs] Search error:`, error.message);
    return [];
  }
}

async function aggregateSearch(queries, year = null) {
  const results = [];
  const seenIds = new Set();

  for (const query of queries) {
    const queryResults = await searchSubtitlesByQuery(query, year);
    for (const item of queryResults) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
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
 * Search for subtitles on subsunacs.net
 * @param {string} title - Movie/series title
 * @param {number} year - Release year (optional)
 * @param {number} season - Season number (for series, optional)
 * @param {number} episode - Episode number (for series, optional)
 * @returns {Promise<Array>} Array of subtitle results
 */
async function search(title, year = null, season = null, episode = null) {
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

    addQuery(formatSeriesTitle(baseTitle, season, episode));
    addQuery(`${baseTitle} ${seasonPadded}x${episodePadded}`);
    addQuery(`${baseTitle} S${seasonPadded}E${episodePadded}`);
  } else {
    addQuery(baseTitle);
  }

  if (queries.length === 0) {
    return [];
  }

  let results = await aggregateSearch([queries[0]], year);

  if (results.length === 0 && queries.length > 1) {
    results = await aggregateSearch(queries.slice(1), year);
  }

  if (results.length === 0 && year) {
    results = await aggregateSearch(queries, null);
  }

  return results;
}

/**
 * Get subtitle download URL
 * @param {string} subtitleId - The subtitle ID
 * @returns {string} Direct download URL
 */
function getDownloadUrl(subtitleId) {
  return `${BASE_URL}/getentry.php?id=${subtitleId}&ei=0`;
}

module.exports = {
  search,
  getDownloadUrl,
  PROVIDER,
  PROVIDER_NAME,
  BASE_URL
};
