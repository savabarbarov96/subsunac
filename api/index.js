/**
 * Vercel Serverless Function for Subsunacs Stremio Addon
 */

const express = require('express');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const axios = require('axios');
const https = require('https');
const AdmZip = require('adm-zip');
const iconv = require('iconv-lite');
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

// Helper function to decode Bulgarian text (typically Windows-1251 encoded)
function decodeBulgarian(buffer) {
  // Try to detect if it's already valid UTF-8
  const utf8Text = buffer.toString('utf8');

  // Check for common UTF-8 BOM or valid Bulgarian UTF-8 characters
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return utf8Text; // Has UTF-8 BOM
  }

  // Check if the text has valid Bulgarian Cyrillic UTF-8 sequences (U+0400-U+04FF range)
  // Bulgarian letters in UTF-8 are 2-byte sequences: 0xD0/0xD1 followed by 0x80-0xBF
  const hasBulgarianUtf8 = /[\u0400-\u04FF]/.test(utf8Text);
  if (hasBulgarianUtf8 && !/\uFFFD/.test(utf8Text)) {
    return utf8Text; // Valid UTF-8 with Cyrillic
  }

  // Otherwise, decode as Windows-1251 (common Bulgarian encoding)
  try {
    return iconv.decode(buffer, 'win1251');
  } catch (e) {
    // Fallback to UTF-8
    return utf8Text;
  }
}

// Helper function to fetch subtitle using native https (handles malformed server responses)
function fetchSubtitle(subtitleId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'subsunacs.net',
      path: `/getentry.php?id=${subtitleId}&ei=0`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://subsunacs.net',
        'Accept': '*/*'
      },
      // Required for subsunacs.net which returns malformed HTTP responses
      insecureHTTPParser: true
    };

    let resolved = false;
    const chunks = [];
    let responseHeaders = {};
    let statusCode = 0;

    const req = https.request(options, (response) => {
      responseHeaders = response.headers;
      statusCode = response.statusCode;

      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        if (!resolved) {
          resolved = true;
          resolve({
            data: Buffer.concat(chunks),
            headers: responseHeaders,
            statusCode: statusCode
          });
        }
      });

      // Handle errors on the response stream - the server sends malformed data
      // that triggers parse errors, but we may already have the subtitle content
      response.on('error', (err) => {
        if (!resolved && chunks.length > 0) {
          resolved = true;
          resolve({
            data: Buffer.concat(chunks),
            headers: responseHeaders,
            statusCode: statusCode
          });
        }
      });
    });

    // Handle request-level errors - but if we got data, use it
    req.on('error', (err) => {
      if (!resolved) {
        if (chunks.length > 0) {
          resolved = true;
          resolve({
            data: Buffer.concat(chunks),
            headers: responseHeaders,
            statusCode: statusCode
          });
        } else {
          resolved = true;
          reject(err);
        }
      }
    });

    req.setTimeout(25000, () => {
      if (!resolved) {
        req.destroy();
        resolved = true;
        reject(new Error('Request timeout'));
      }
    });

    req.end();
  });
}

// Subtitle proxy endpoint - must be before addon router
app.get('/subtitle/:id.srt', async (req, res) => {
  const subtitleId = req.params.id;

  // Validate subtitle ID (must be numeric)
  if (!/^\d+$/.test(subtitleId)) {
    return res.status(400).send('Invalid subtitle ID');
  }

  console.log(`[Proxy] Fetching subtitle ID: ${subtitleId}`);

  try {
    const response = await fetchSubtitle(subtitleId);
    const contentType = response.headers['content-type'] || '';
    const buffer = response.data;

    // Check for ZIP magic bytes (PK)
    const isZip = buffer.length > 2 && buffer[0] === 0x50 && buffer[1] === 0x4B;

    if (isZip) {
      try {
        const zip = new AdmZip(buffer);
        const zipEntries = zip.getEntries();

        // Find .srt file
        const srtEntry = zipEntries.find(entry =>
          !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.srt')
        );

        if (srtEntry) {
          const subtitleContent = decodeBulgarian(srtEntry.getData());
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
          const subtitleContent = decodeBulgarian(subEntry.getData());
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
        res.send(decodeBulgarian(buffer));
      }
    } else {
      // Serve as plain text (handles raw .srt or .sub files)
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(decodeBulgarian(buffer));
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
