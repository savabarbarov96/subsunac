/**
 * Yavka.net provider for Bulgarian subtitles
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { sanitizeTitle, formatSeriesTitle, Cache } = require('../utils');

const PROVIDER = 'yavka';
const PROVIDER_NAME = 'Yavka';
const BASE_URL = 'https://yavka.net';

// Cache search results for 1 hour
const cache = new Cache(60 * 60 * 1000);

async function searchSubtitlesByQuery(searchTitle, year = null, imdbId = null) {
  const cacheKey = `yavka_${searchTitle}_${year || 'no-year'}_${imdbId || 'no-imdb'}`;

  if (cache.has(cacheKey)) {
    console.log(`[Yavka] Cache hit for "${searchTitle}"`);
    return cache.get(cacheKey);
  }

  console.log(`[Yavka] Searching for "${searchTitle}" (year: ${year || 'n/a'}, imdb: ${imdbId || 'n/a'})`);

  try {
    const formData = new URLSearchParams({
      's': searchTitle,
      'y': year || '',
      'l': 'bg',  // Bulgarian language
      'i': imdbId || ''  // IMDB ID (ttXXXXXXX format)
    });

    const response = await axios.post(`${BASE_URL}/subtitles`, formData.toString(), {
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

    // Parse subtitle table rows
    $('tr.subs-row, tr[id^="sub_"]').each((index, element) => {
      const $row = $(element);

      // Try to find the subtitle link
      const $link = $row.find('a[href*="/subtitles/"]').first();
      if (!$link.length) return;

      const href = $link.attr('href');
      if (!href) return;

      // Extract subtitle ID from URL pattern like /subtitles/xxxxx/title
      const idMatch = href.match(/\/subtitles\/(\d+)/);
      if (!idMatch) return;

      const subtitleId = idMatch[1];
      const subtitleTitle = $link.text().trim();

      // Get additional info from table cells
      const cells = $row.find('td');
      let fps = null;
      let uploader = null;
      let downloads = null;

      // Try to find fps (usually in a cell with FPS label or number)
      cells.each((i, cell) => {
        const text = $(cell).text().trim();
        if (/^\d+(\.\d+)?$/.test(text) && parseFloat(text) > 20 && parseFloat(text) < 60) {
          fps = text;
        }
      });

      // Find uploader (usually a link with user profile)
      const $uploaderLink = $row.find('a[href*="/user/"], a[href*="/profile/"]').first();
      if ($uploaderLink.length) {
        uploader = $uploaderLink.text().trim();
      }

      // Find downloads count (usually a number in one of the cells)
      cells.each((i, cell) => {
        const text = $(cell).text().trim();
        if (/^\d+$/.test(text) && parseInt(text) > 0 && !fps) {
          downloads = text;
        }
      });

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

    // Fallback: Try alternative table structure
    if (results.length === 0) {
      $('table.subs-list tr, table tbody tr').each((index, element) => {
        const $row = $(element);
        if ($row.find('th').length) return; // Skip header rows

        const $link = $row.find('a').filter((i, el) => {
          const href = $(el).attr('href') || '';
          return href.includes('/subtitles/') || href.includes('/sub/');
        }).first();

        if (!$link.length) return;

        const href = $link.attr('href');
        const idMatch = href.match(/\/(?:subtitles|sub)\/(\d+)/);
        if (!idMatch) return;

        const subtitleId = idMatch[1];
        const subtitleTitle = $link.text().trim() || $row.find('td').first().text().trim();

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
    console.log(`[Yavka] Found ${limitedResults.length} subtitles`);

    cache.set(cacheKey, limitedResults);
    return limitedResults;
  } catch (error) {
    console.error(`[Yavka] Search error:`, error.message);
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
 * Search for subtitles on yavka.net
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

    addQuery(formatSeriesTitle(baseTitle, season, episode));
    addQuery(`${baseTitle} S${seasonPadded}E${episodePadded}`);
    addQuery(`${baseTitle} ${seasonPadded}x${episodePadded}`);
  } else {
    addQuery(baseTitle);
  }

  if (queries.length === 0) {
    return [];
  }

  // Try with IMDB ID first if available
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
 * Get subtitle download info - for Yavka, we need the subtitle page URL
 * The actual download requires fetching the page and extracting the download form
 * @param {string} subtitleId - The subtitle ID
 * @returns {string} Subtitle page URL
 */
function getDownloadUrl(subtitleId) {
  return `${BASE_URL}/subtitles/${subtitleId}`;
}

/**
 * Fetch the actual subtitle file from Yavka
 * This requires a 2-step process: get page, extract form, submit download
 * @param {string} subtitleId - The subtitle ID
 * @returns {Promise<Buffer>} Subtitle file buffer
 */
async function downloadSubtitle(subtitleId) {
  const pageUrl = getDownloadUrl(subtitleId);

  // Step 1: Fetch the subtitle page
  const pageResponse = await axios.get(pageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': BASE_URL,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    timeout: 15000
  });

  const $ = cheerio.load(pageResponse.data);

  // Step 2: Find the download form or direct download link
  let downloadUrl = null;

  // Try to find direct download link
  const $downloadLink = $('a[href*="/get/"], a[href*="download"], a.download-btn').first();
  if ($downloadLink.length) {
    downloadUrl = $downloadLink.attr('href');
    if (downloadUrl && !downloadUrl.startsWith('http')) {
      downloadUrl = BASE_URL + downloadUrl;
    }
  }

  // Try to find download form
  if (!downloadUrl) {
    const $form = $('form[action*="download"], form[action*="get"]').first();
    if ($form.length) {
      const action = $form.attr('action');
      downloadUrl = action.startsWith('http') ? action : BASE_URL + action;

      // Get form fields
      const formData = new URLSearchParams();
      $form.find('input[name]').each((i, input) => {
        const name = $(input).attr('name');
        const value = $(input).attr('value') || '';
        formData.append(name, value);
      });

      // Submit the form
      const downloadResponse = await axios.post(downloadUrl, formData.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': pageUrl
        },
        responseType: 'arraybuffer',
        timeout: 25000,
        maxRedirects: 5
      });

      return Buffer.from(downloadResponse.data);
    }
  }

  // Direct download if we found a link
  if (downloadUrl) {
    const downloadResponse = await axios.get(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': pageUrl
      },
      responseType: 'arraybuffer',
      timeout: 25000,
      maxRedirects: 5
    });

    return Buffer.from(downloadResponse.data);
  }

  throw new Error('Could not find download link on Yavka subtitle page');
}

module.exports = {
  search,
  getDownloadUrl,
  downloadSubtitle,
  PROVIDER,
  PROVIDER_NAME,
  BASE_URL
};
