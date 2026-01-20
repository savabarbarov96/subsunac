/**
 * Provider aggregation and common interface for subtitle providers
 */

const subsunacs = require('./subsunacs');
// NOTE: Yavka is disabled due to Cloudflare bot protection that blocks server-side requests
// const yavka = require('./yavka');
const subsab = require('./subsab');

/**
 * Common subtitle result format:
 * {
 *   provider: 'subsunacs' | 'subsab',
 *   providerName: 'Subsunacs' | 'SubsSab',
 *   id: string,
 *   title: string,
 *   fps: string | null,
 *   uploader: string | null,
 *   downloads: string | null
 * }
 */

const providers = {
  subsunacs,
  // yavka,  // Disabled: Cloudflare protected
  subsab
};

/**
 * Search all providers in parallel and aggregate results
 * @param {string} title - Movie/series title
 * @param {number|null} year - Release year
 * @param {number|null} season - Season number (for series)
 * @param {number|null} episode - Episode number (for series)
 * @param {string|null} imdbId - IMDB ID (optional, some providers support it)
 * @returns {Promise<Array>} Aggregated subtitle results from all providers
 */
async function searchAllProviders(title, year = null, season = null, episode = null, imdbId = null) {
  const searchPromises = [
    subsunacs.search(title, year, season, episode).catch(err => {
      console.error('[Providers] Subsunacs search failed:', err.message);
      return [];
    }),
    // Yavka disabled due to Cloudflare protection
    // yavka.search(title, year, season, episode, imdbId).catch(err => {
    //   console.error('[Providers] Yavka search failed:', err.message);
    //   return [];
    // }),
    subsab.search(title, year, season, episode, imdbId).catch(err => {
      console.error('[Providers] SubsSab search failed:', err.message);
      return [];
    })
  ];

  const results = await Promise.allSettled(searchPromises);

  const aggregated = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      aggregated.push(...result.value);
    }
  }

  return aggregated;
}

/**
 * Get download handler for a specific provider
 * @param {string} provider - Provider name
 * @returns {object|null} Provider module or null if not found
 */
function getProvider(provider) {
  return providers[provider] || null;
}

module.exports = {
  searchAllProviders,
  getProvider,
  providers
};
