/**
 * Utility functions for the Subsunacs Stremio addon
 */

/**
 * Sanitize a title for searching
 * Removes special characters and normalizes spaces
 */
function sanitizeTitle(title) {
  return title
    .replace(/[^\w\s\-]/g, ' ')  // Replace special chars with spaces
    .replace(/\s+/g, ' ')         // Normalize multiple spaces
    .trim();
}

/**
 * Format a TV show title with season and episode
 * e.g., "Breaking Bad" + season 1 + episode 5 = "Breaking Bad 1x05"
 * Using format that subsunacs.net expects (1x01 instead of S01E01)
 */
function formatSeriesTitle(title, season, episode) {
  const e = String(episode).padStart(2, '0');
  return `${title} ${season}x${e}`;
}

/**
 * Parse IMDB ID into components
 * Movie: "tt0133093" -> { imdbId: "tt0133093", type: "movie" }
 * Series: "tt0944947:1:1" -> { imdbId: "tt0944947", type: "series", season: 1, episode: 1 }
 */
function parseStremioId(id) {
  const parts = id.split(':');

  if (parts.length === 1) {
    // Movie
    return {
      imdbId: parts[0],
      type: 'movie'
    };
  } else if (parts.length >= 3) {
    // Series with season and episode (ignore any trailing parts)
    const season = parseInt(parts[1], 10);
    const episode = parseInt(parts[2], 10);

    if (Number.isNaN(season) || Number.isNaN(episode)) {
      throw new Error(`Invalid Stremio ID format: ${id}`);
    }

    return {
      imdbId: parts[0],
      type: 'series',
      season,
      episode
    };
  }

  throw new Error(`Invalid Stremio ID format: ${id}`);
}

/**
 * Simple in-memory cache with TTL
 */
class Cache {
  constructor(ttl = 3600000) { // Default: 1 hour
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      expires: Date.now() + this.ttl
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  has(key) {
    return this.get(key) !== null;
  }
}

module.exports = {
  sanitizeTitle,
  formatSeriesTitle,
  parseStremioId,
  Cache
};
