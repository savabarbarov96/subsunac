#!/usr/bin/env node

/**
 * Stremio Addon for Subsunacs Bulgarian Subtitles
 *
 * This addon fetches Bulgarian subtitles from subsunacs.net
 * and makes them available in Stremio for movies and TV shows.
 */

const { addonBuilder, serveHTTP, getRouter } = require('stremio-addon-sdk');
const { getIMDBInfo } = require('./lib/imdb');
const { searchSubtitles, getSubtitleDownloadUrl } = require('./lib/subsunacs');
const { parseStremioId } = require('./lib/utils');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const AdmZip = require('adm-zip');

// Environment configuration
const PORT = process.env.PORT || 7000;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

// Define addon manifest
const manifest = {
  id: 'org.stremio.subsunacs',
  version: '1.0.0',
  name: 'Subsunacs Bulgarian Subtitles',
  description: 'Bulgarian subtitles from subsunacs.net',
  logo: 'https://flagcdn.com/w320/bg.png',  // Bulgarian flag
  background: 'https://flagcdn.com/w1280/bg.png',
  resources: ['subtitles'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  catalogs: [],
  behaviorHints: {
    configurable: false,
    configurationRequired: false
  }
};

// Create addon builder
const builder = new addonBuilder(manifest);

// Define subtitle handler
builder.defineSubtitlesHandler(async (args) => {
  console.log(`\n[Addon] Subtitle request for: ${args.type} - ${args.id}`);

  try {
    // Parse the Stremio ID
    const parsed = parseStremioId(args.id);
    console.log(`[Addon] Parsed ID:`, parsed);

    // Get movie/series info from IMDB
    let imdbInfo;
    try {
      imdbInfo = await getIMDBInfo(parsed.imdbId);
      console.log(`[Addon] IMDB Info:`, imdbInfo);
    } catch (error) {
      console.error(`[Addon] Failed to get IMDB info:`, error.message);
      return { subtitles: [] };
    }

    // Search for subtitles on subsunacs.net
    let searchResults;
    if (parsed.type === 'movie') {
      searchResults = await searchSubtitles(imdbInfo.title, imdbInfo.year);
    } else {
      // For series, include season and episode
      searchResults = await searchSubtitles(
        imdbInfo.title,
        imdbInfo.year,
        parsed.season,
        parsed.episode
      );
    }

    if (searchResults.length === 0) {
      console.log(`[Addon] No subtitles found`);
      return { subtitles: [] };
    }

    // Format results for Stremio
    const subtitles = searchResults.map((result, index) => {
      // Create a unique subtitle ID
      const id = `subsunacs-${result.id}-${index}`;

      // Build the download URL - proxy through our server
      const url = `${PUBLIC_URL}/subtitle/${result.id}.srt`;

      // Build a descriptive subtitle title
      let subtitleLabel = result.title;
      if (result.fps) {
        subtitleLabel += ` [${result.fps}fps]`;
      }
      if (result.uploader) {
        subtitleLabel += ` - ${result.uploader}`;
      }

      return {
        id: id,
        url: url,
        lang: 'bul',  // ISO 639-2 code for Bulgarian
        // Optional: Add more metadata if Stremio supports it
        // Note: Stremio may not display all of these, but we include them for future compatibility
        ...(subtitleLabel !== result.title && { title: subtitleLabel })
      };
    });

    console.log(`[Addon] Returning ${subtitles.length} subtitle(s)`);

    return {
      subtitles: subtitles,
      // Optional: Set cache headers
      // cacheMaxAge: 3600,  // Cache for 1 hour
      // staleRevalidate: 86400,  // Revalidate after 24 hours
      // staleError: 604800  // Serve stale content for up to 7 days on error
    };

  } catch (error) {
    console.error(`[Addon] Error in subtitle handler:`, error);
    return { subtitles: [] };
  }
});

// Get the addon interface
const addonInterface = builder.getInterface();

// Create Express router with custom endpoints
const router = getRouter(addonInterface);

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const subtitleLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit subtitle downloads to 30 per minute per IP
  message: 'Too many subtitle downloads, please try again later.',
});

// Apply rate limiting to all routes
router.use(limiter);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: manifest.version
  });
});

// Subtitle proxy endpoint
router.get('/subtitle/:id.srt', subtitleLimiter, async (req, res) => {
  const subtitleId = req.params.id;
  console.log(`[Proxy] Fetching subtitle ID: ${subtitleId}`);

  try {
    // Download the subtitle archive from subsunacs
    const downloadUrl = `https://subsunacs.net/getentry.php?id=${subtitleId}&ei=0`;

    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://subsunacs.net'
      },
      timeout: 30000
    });

    // Check if it's a ZIP file
    const contentType = response.headers['content-type'];

    if (contentType && contentType.includes('zip')) {
      // Extract the subtitle from the ZIP archive
      const zip = new AdmZip(response.data);
      const zipEntries = zip.getEntries();

      // Find the first .srt file in the archive
      const srtEntry = zipEntries.find(entry =>
        entry.entryName.toLowerCase().endsWith('.srt')
      );

      if (srtEntry) {
        const subtitleContent = srtEntry.getData().toString('utf8');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="${subtitleId}.srt"`);
        res.send(subtitleContent);
        console.log(`[Proxy] Served subtitle ${subtitleId} from ZIP`);
      } else {
        console.error(`[Proxy] No .srt file found in ZIP for ${subtitleId}`);
        res.status(404).send('Subtitle file not found in archive');
      }
    } else {
      // It's already an SRT file, serve it directly
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="${subtitleId}.srt"`);
      res.send(response.data);
      console.log(`[Proxy] Served subtitle ${subtitleId} directly`);
    }
  } catch (error) {
    console.error(`[Proxy] Error fetching subtitle ${subtitleId}:`, error.message);
    res.status(500).send('Error fetching subtitle');
  }
});

// Start the server
serveHTTP(addonInterface, {
  port: PORT,
  getRouter: () => router
});

console.log(`
╔═══════════════════════════════════════════════════════════╗
║   Subsunacs Bulgarian Subtitles Addon for Stremio        ║
╚═══════════════════════════════════════════════════════════╝

Addon is running at:
  → ${PUBLIC_URL}/manifest.json

To install in Stremio:
  1. Open Stremio
  2. Go to Settings → Addons
  3. Enter the URL above and click Install

Production URL (set PUBLIC_URL env variable):
  → PUBLIC_URL=https://your-domain.com

Health check:
  → ${PUBLIC_URL}/health

Press Ctrl+C to stop the addon.
`);
