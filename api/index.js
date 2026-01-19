/**
 * Vercel Serverless Function for Subsunacs Stremio Addon
 */

const express = require('express');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const axios = require('axios');
const AdmZip = require('adm-zip');
const path = require('path');

// Import lib modules using path.join for Vercel compatibility
const { getIMDBInfo } = require(path.join(__dirname, '..', 'lib', 'imdb'));
const { searchSubtitles } = require(path.join(__dirname, '..', 'lib', 'subsunacs'));
const { parseStremioId } = require(path.join(__dirname, '..', 'lib', 'utils'));

// Create Express app
const app = express();

// Trust proxy for proper IP detection
app.set('trust proxy', 1);

// CORS middleware for Stremio
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});

// Get base URL dynamically
function getBaseUrl(req) {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${protocol}://${host}`;
}

// Define addon manifest
const manifest = {
  id: 'org.stremio.subsunacs',
  version: '1.0.0',
  name: 'Subsunacs Bulgarian Subtitles',
  description: 'Bulgarian subtitles from subsunacs.net',
  logo: 'https://flagcdn.com/w320/bg.png',
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

// Store base URL for subtitle handler (set per-request)
let currentBaseUrl = '';

// Define subtitle handler
builder.defineSubtitlesHandler(async (args) => {
  console.log(`[Addon] Subtitle request for: ${args.type} - ${args.id}`);

  try {
    const parsed = parseStremioId(args.id);
    console.log(`[Addon] Parsed ID:`, parsed);

    let imdbInfo;
    try {
      imdbInfo = await getIMDBInfo(parsed.imdbId);
      console.log(`[Addon] IMDB Info:`, imdbInfo);
    } catch (error) {
      console.error(`[Addon] Failed to get IMDB info:`, error.message);
      return { subtitles: [] };
    }

    let searchResults;
    if (parsed.type === 'movie') {
      searchResults = await searchSubtitles(imdbInfo.title, imdbInfo.year);
    } else {
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

    const subtitles = searchResults.map((result, index) => {
      const id = `subsunacs-${result.id}-${index}`;
      const url = `${currentBaseUrl}/subtitle/${result.id}.srt`;

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
        lang: 'bul',
        ...(subtitleLabel !== result.title && { title: subtitleLabel })
      };
    });

    console.log(`[Addon] Returning ${subtitles.length} subtitle(s)`);
    return { subtitles };

  } catch (error) {
    console.error(`[Addon] Error in subtitle handler:`, error);
    return { subtitles: [] };
  }
});

// Get the addon interface and router
const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);

// Middleware to set base URL before addon routes
app.use((req, res, next) => {
  currentBaseUrl = getBaseUrl(req);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: manifest.version
  });
});

// Subtitle proxy endpoint - must be before addon router
app.get('/subtitle/:id.srt', async (req, res) => {
  const subtitleId = req.params.id;

  // Validate subtitle ID (must be numeric)
  if (!/^\d+$/.test(subtitleId)) {
    return res.status(400).send('Invalid subtitle ID');
  }

  console.log(`[Proxy] Fetching subtitle ID: ${subtitleId}`);

  try {
    const downloadUrl = `https://subsunacs.net/getentry.php?id=${subtitleId}&ei=0`;

    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://subsunacs.net',
        'Accept': '*/*'
      },
      timeout: 25000,
      maxRedirects: 5
    });

    const contentType = response.headers['content-type'] || '';
    const buffer = Buffer.from(response.data);

    // Check for ZIP magic bytes (PK)
    const isZip = buffer.length > 2 && buffer[0] === 0x50 && buffer[1] === 0x4B;

    if (isZip || contentType.includes('zip') || contentType.includes('octet-stream')) {
      try {
        const zip = new AdmZip(buffer);
        const zipEntries = zip.getEntries();

        // Find .srt file
        const srtEntry = zipEntries.find(entry =>
          !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.srt')
        );

        if (srtEntry) {
          const subtitleContent = srtEntry.getData().toString('utf8');
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.send(subtitleContent);
          console.log(`[Proxy] Served subtitle ${subtitleId} from ZIP`);
          return;
        }

        // Try .sub file if no .srt found
        const subEntry = zipEntries.find(entry =>
          !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.sub')
        );

        if (subEntry) {
          const subtitleContent = subEntry.getData().toString('utf8');
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.send(subtitleContent);
          console.log(`[Proxy] Served .sub subtitle ${subtitleId} from ZIP`);
          return;
        }

        console.error(`[Proxy] No subtitle file found in ZIP for ${subtitleId}`);
        res.status(404).send('Subtitle file not found in archive');
      } catch (zipError) {
        console.error(`[Proxy] ZIP extraction error:`, zipError.message);
        // Maybe it's not actually a ZIP, try serving raw
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(buffer.toString('utf8'));
      }
    } else {
      // Serve as plain text
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(buffer.toString('utf8'));
      console.log(`[Proxy] Served subtitle ${subtitleId} directly`);
    }
  } catch (error) {
    console.error(`[Proxy] Error fetching subtitle ${subtitleId}:`, error.message);
    res.status(500).send('Error fetching subtitle');
  }
});

// Mount the addon router
app.use(addonRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Export for Vercel
module.exports = app;
