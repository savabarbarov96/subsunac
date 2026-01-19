/**
 * Subsunacs.net scraper to search and fetch Bulgarian subtitles
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { sanitizeTitle, formatSeriesTitle, Cache } = require('./utils');

const BASE_URL = 'https://subsunacs.net';

// Cache search results for 1 hour
const cache = new Cache(60 * 60 * 1000);

/**
 * Search for subtitles on subsunacs.net
 * @param {string} title - Movie/series title
 * @param {number} year - Release year (optional)
 * @param {number} season - Season number (for series, optional)
 * @param {number} episode - Episode number (for series, optional)
 * @returns {Promise<Array>} Array of subtitle results
 */
async function searchSubtitles(title, year = null, season = null, episode = null) {
  // Build search query
  let searchTitle = title;
  if (season && episode) {
    // For series, format as "Title S01E05"
    searchTitle = formatSeriesTitle(title, season, episode);
  }

  // Create cache key
  const cacheKey = `${searchTitle}_${year || 'no-year'}`;

  // Check cache
  if (cache.has(cacheKey)) {
    console.log(`[Subsunacs] Cache hit for "${searchTitle}"`);
    return cache.get(cacheKey);
  }

  console.log(`[Subsunacs] Searching for "${searchTitle}" (year: ${year})`);

  try {
    // Build POST data
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

    // Parse results from table rows
    // The structure is: table with rows containing subtitle information
    $('table tr').each((index, element) => {
      const $row = $(element);

      // Look for rows with onmouseover attribute (contains subtitle data)
      if ($row.attr('onmouseover')) {
        const cells = $row.find('td');

        // Extract subtitle link from first column
        const linkCell = cells.eq(0);
        const link = linkCell.find('a').attr('href');

        if (!link) return;

        // Extract subtitle ID from the link
        // Format: /subtitles/Title_Name-ID/
        const idMatch = link.match(/\/subtitles\/[^-]+-(\d+)\//);
        if (!idMatch) return;

        const subtitleId = idMatch[1];

        // Extract title
        const subtitleTitle = linkCell.find('a').text().trim();

        // Extract year from the same cell
        const yearText = linkCell.find('span.smGray').text().trim();
        const yearMatch = yearText.match(/\((\d{4})\)/);
        const year = yearMatch ? yearMatch[1] : '';

        // Extract additional metadata from other cells
        // Column 1: Number of CDs
        // Column 2: FPS
        const fps = cells.eq(2).text().trim();

        // Column 5: Uploader
        const uploader = cells.eq(5).find('a').text().trim();

        // Column 6: Downloads
        const downloads = cells.eq(6).text().trim();

        results.push({
          id: subtitleId,
          title: subtitleTitle,
          year: year,
          fps: fps,
          uploader: uploader,
          downloads: downloads,
          url: `${BASE_URL}${link}`
        });
      }
    });

    // Limit to first 20 results
    const limitedResults = results.slice(0, 20);

    console.log(`[Subsunacs] Found ${limitedResults.length} subtitles`);

    // Cache results
    cache.set(cacheKey, limitedResults);

    return limitedResults;

  } catch (error) {
    console.error(`[Subsunacs] Search error:`, error.message);
    return [];
  }
}

/**
 * Get subtitle download URL directly
 * @param {string} subtitleId - The subtitle ID
 * @returns {string} Direct download URL
 */
function getSubtitleDownloadUrl(subtitleId) {
  // Based on earlier research, the download pattern is:
  // /getentry.php?id={subtitleId}&ei={index}
  // ei=0 for the first file (usually the subtitle file itself)
  // Stremio's local server can handle archive extraction and encoding
  return `${BASE_URL}/getentry.php?id=${subtitleId}&ei=0`;
}

module.exports = {
  searchSubtitles,
  getSubtitleDownloadUrl
};
