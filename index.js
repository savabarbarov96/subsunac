#!/usr/bin/env node

/**
 * Bulgarian Subtitles Stremio Addon
 * Supports multiple providers: Subsunacs, Yavka, SubsSab
 *
 * Local development server. For production, use Vercel deployment.
 */

const express = require('express');
const { addonBuilder, serveHTTP, getRouter } = require('stremio-addon-sdk');
const { getIMDBInfo } = require('./lib/imdb');
const { searchAllProviders, getProvider } = require('./lib/providers');
const { parseStremioId } = require('./lib/utils');
const axios = require('axios');
const http = require('http');
const AdmZip = require('adm-zip');
const iconv = require('iconv-lite');

function decodeBulgarian(buffer) {
  const utf8Text = buffer.toString('utf8');

  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return utf8Text;
  }

  const hasBulgarianUtf8 = /[\u0400-\u04FF]/.test(utf8Text);
  if (hasBulgarianUtf8 && !/\uFFFD/.test(utf8Text)) {
    return utf8Text;
  }

  try {
    return iconv.decode(buffer, 'win1251');
  } catch (e) {
    return utf8Text;
  }
}

function formatSrtTime(totalSeconds) {
  const totalMs = Math.max(0, Math.round(totalSeconds * 1000));
  const ms = totalMs % 1000;
  const totalSecondsInt = Math.floor(totalMs / 1000);
  const seconds = totalSecondsInt % 60;
  const totalMinutes = Math.floor(totalSecondsInt / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const pad2 = (value) => String(value).padStart(2, '0');
  const pad3 = (value) => String(value).padStart(3, '0');

  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)},${pad3(ms)}`;
}

function convertMicroDvdToSrt(text) {
  const lines = text.split(/\r?\n/);
  let fps = null;
  const entries = [];

  for (const line of lines) {
    const match = line.match(/^\{(\d+)\}\{(\d+)\}(.*)$/);
    if (!match) {
      continue;
    }

    const start = parseInt(match[1], 10);
    const end = parseInt(match[2], 10);
    const rawText = match[3] || '';
    const trimmed = rawText.trim();

    if (start === end && /^\d+(?:[.,]\d+)?$/.test(trimmed)) {
      const parsedFps = parseFloat(trimmed.replace(',', '.'));
      if (!Number.isNaN(parsedFps) && parsedFps > 0) {
        fps = parsedFps;
        continue;
      }
    }

    const cleaned = rawText
      .replace(/\{[^}]*\}/g, '')
      .replace(/\|/g, '\n')
      .trim();

    if (!cleaned) {
      continue;
    }

    entries.push({ start, end, text: cleaned });
  }

  if (entries.length === 0) {
    return null;
  }

  const safeFps = fps && fps > 0 ? fps : 25;
  let index = 1;

  const output = entries.map((entry) => {
    const startTime = formatSrtTime(entry.start / safeFps);
    const endTime = formatSrtTime(entry.end / safeFps);
    return `${index++}\n${startTime} --> ${endTime}\n${entry.text}\n`;
  });

  return `${output.join('\n').trim()}\n`;
}

function processSubtitleBuffer(buffer, res, subtitleId) {
  const isZip = buffer.length > 2 && buffer[0] === 0x50 && buffer[1] === 0x4B;

  if (isZip) {
    try {
      const zip = new AdmZip(buffer);
      const zipEntries = zip.getEntries();

      const srtEntry = zipEntries.find(entry =>
        !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.srt')
      );

      if (srtEntry) {
        const subtitleContent = decodeBulgarian(srtEntry.getData());
        res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(subtitleContent);
        console.log(`[Proxy] Served subtitle ${subtitleId} from ZIP`);
        return true;
      }

      const subEntry = zipEntries.find(entry =>
        !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.sub')
      );

      if (subEntry) {
        const subtitleContent = decodeBulgarian(subEntry.getData());
        const converted = convertMicroDvdToSrt(subtitleContent);
        res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(converted || subtitleContent);
        console.log(`[Proxy] Served .sub subtitle ${subtitleId} from ZIP`);
        return true;
      }

      const txtEntry = zipEntries.find(entry =>
        !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.txt')
      );

      if (txtEntry) {
        const subtitleContent = decodeBulgarian(txtEntry.getData());
        const converted = convertMicroDvdToSrt(subtitleContent);
        res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(converted || subtitleContent);
        console.log(`[Proxy] Served .txt subtitle ${subtitleId} from ZIP`);
        return true;
      }

      console.error(`[Proxy] No subtitle file found in ZIP for ${subtitleId}`);
      return false;
    } catch (zipError) {
      console.error(`[Proxy] ZIP extraction error:`, zipError.message);
      const decoded = decodeBulgarian(buffer);
      const converted = convertMicroDvdToSrt(decoded);
      res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(converted || decoded);
      return true;
    }
  } else {
    const decoded = decodeBulgarian(buffer);
    const converted = convertMicroDvdToSrt(decoded);
    res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(converted || decoded);
    console.log(`[Proxy] Served subtitle ${subtitleId} directly`);
    return true;
  }
}

// Environment configuration
const PORT = process.env.PORT || 7000;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

// Define addon manifest
const manifest = {
  id: 'org.stremio.subsunacs',
  version: '2.0.0',
  name: 'Bulgarian Subtitles',
  description: 'Bulgarian subtitles from multiple providers (Subsunacs, Yavka, SubsSab)',
  logo: 'https://flagcdn.com/w320/bg.png',
  background: 'https://flagcdn.com/w1280/bg.png',
  resources: [
    { name: 'subtitles', types: ['movie', 'series'], idPrefixes: ['tt'] }
  ],
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
    const parsed = parseStremioId(args.id);
    console.log(`[Addon] Parsed ID:`, parsed);

    let imdbInfo;
    try {
      imdbInfo = await getIMDBInfo(parsed.imdbId, parsed.type);
      console.log(`[Addon] IMDB Info:`, imdbInfo);
    } catch (error) {
      console.error(`[Addon] Failed to get IMDB info:`, error.message);
      return { subtitles: [] };
    }

    // Search all providers in parallel
    let searchResults;
    if (parsed.type === 'movie') {
      searchResults = await searchAllProviders(
        imdbInfo.title,
        imdbInfo.year,
        null,
        null,
        parsed.imdbId
      );
    } else {
      searchResults = await searchAllProviders(
        imdbInfo.title,
        imdbInfo.year,
        parsed.season,
        parsed.episode,
        parsed.imdbId
      );
    }

    if (searchResults.length === 0) {
      console.log(`[Addon] No subtitles found`);
      return { subtitles: [] };
    }

    const subtitles = searchResults.map((result, index) => {
      const id = `${result.provider}-${result.id}-${index}`;
      // New URL pattern includes provider
      const url = `${PUBLIC_URL}/subtitle/${result.provider}/${result.id}.srt`;

      // Build subtitle label with provider prefix
      let subtitleLabel = `[${result.providerName}] ${result.title}`;
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
        title: subtitleLabel
      };
    });

    console.log(`[Addon] Returning ${subtitles.length} subtitle(s) from all providers`);
    return { subtitles };

  } catch (error) {
    console.error(`[Addon] Error in subtitle handler:`, error);
    return { subtitles: [] };
  }
});

// Get the addon interface
const addonInterface = builder.getInterface();

// Create Express router with custom endpoints
const router = getRouter(addonInterface);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: manifest.version,
    providers: ['subsunacs', 'subsab']
  });
});

// Subtitle proxy endpoint - supports multiple providers
// URL pattern: /subtitle/:provider/:id.srt
router.get('/subtitle/:provider/:id.srt', async (req, res) => {
  const { provider, id: subtitleId } = req.params;

  if (!/^\d+$/.test(subtitleId)) {
    return res.status(400).send('Invalid subtitle ID');
  }

  const validProviders = ['subsunacs', 'subsab'];
  if (!validProviders.includes(provider)) {
    return res.status(400).send('Invalid provider');
  }

  console.log(`[Proxy] Fetching subtitle ID: ${subtitleId} from ${provider}`);

  try {
    let buffer;

    switch (provider) {
      case 'subsunacs': {
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
        buffer = Buffer.from(response.data);
        break;
      }

      case 'subsab': {
        const downloadUrl = `http://subs.sab.bz/index.php?act=download&attach_id=${subtitleId}`;
        const response = await axios.get(downloadUrl, {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'http://subs.sab.bz',
            'Accept': '*/*'
          },
          timeout: 25000,
          maxRedirects: 5,
          httpAgent: new http.Agent({ keepAlive: true })
        });
        buffer = Buffer.from(response.data);
        break;
      }

      default:
        return res.status(400).send('Unknown provider');
    }

    if (!buffer || buffer.length === 0) {
      console.error(`[Proxy] Empty response from ${provider} for ${subtitleId}`);
      return res.status(404).send('Subtitle not found');
    }

    const success = processSubtitleBuffer(buffer, res, subtitleId);
    if (!success) {
      res.status(404).send('Subtitle file not found in archive');
    }

  } catch (error) {
    console.error(`[Proxy] Error fetching subtitle ${subtitleId} from ${provider}:`, error.message);
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
║   Bulgarian Subtitles Addon for Stremio                  ║
║   Providers: Subsunacs, SubsSab                          ║
╚═══════════════════════════════════════════════════════════╝

Addon is running at:
  → ${PUBLIC_URL}/manifest.json

To install in Stremio:
  1. Open Stremio
  2. Go to Settings → Addons
  3. Enter the URL above and click Install

Health check:
  → ${PUBLIC_URL}/health

Press Ctrl+C to stop the addon.
`);
