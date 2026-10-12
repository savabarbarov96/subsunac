const express = require('express');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const landingTemplate = require('stremio-addon-sdk/src/landingTemplate');
const { AsyncLocalStorage } = require('node:async_hooks');
const { getIMDBInfo } = require('./imdb');
const { searchAllProviders, getProvider } = require('./providers');
const { parseStremioId } = require('./utils');
const { getBaseUrl } = require('./base-url');
const { downloadSubtitle } = require('./subtitle-download');
const { processSubtitleBuffer } = require('./subtitle-content');
const { SubtitleError } = require('./subtitle-error');
const { version } = require('../package.json');

function createApp(dependencies = {}) {
  const deps = {getIMDBInfo, searchAllProviders, downloadSubtitle, ...dependencies};
  const context = new AsyncLocalStorage();
  const manifest = {
    id: 'org.stremio.subsunacs', version, name: 'Bulgarian Subtitles',
    description: 'Bulgarian subtitles from Subsunacs and SubsSab',
    logo: 'https://flagcdn.com/w320/bg.png', background: 'https://flagcdn.com/w1280/bg.png',
    resources: [{name: 'subtitles', types: ['movie', 'series'], idPrefixes: ['tt']}],
    types: ['movie', 'series'], idPrefixes: ['tt'], catalogs: [],
    behaviorHints: {configurable: false, configurationRequired: false}
  };
  const builder = new addonBuilder(manifest);
  builder.defineSubtitlesHandler(async args => {
    try {
      const parsed = parseStremioId(args.id);
      const info = await deps.getIMDBInfo(parsed.imdbId, parsed.type);
      const results = await deps.searchAllProviders(info.title, info.year, parsed.season ?? null, parsed.episode ?? null, parsed.imdbId);
      const baseUrl = context.getStore().baseUrl;
      return {subtitles: results.map((result, index) => {
        const episode = parsed.type === 'series' ? `?season=${parsed.season}&episode=${parsed.episode}` : '';
        let label = `[${result.providerName}] ${result.title}`;
        if (result.fps) label += ` [${result.fps}fps]`;
        if (result.uploader) label += ` - ${result.uploader}`;
        return {id: `${result.provider}-${result.id}-${index}`, url: `${baseUrl}/subtitle/${result.provider}/${result.id}.srt${episode}`, lang: 'bul', title: label, label};
      })};
    } catch (error) {
      console.error('[Addon] Subtitle search failed:', error.message);
      return {subtitles: []};
    }
  });
  const app = express();
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    context.run({baseUrl: getBaseUrl(req)}, next);
  });
  app.get('/health', (req, res) => res.json({status: 'ok', timestamp: new Date().toISOString(), version, providers: ['subsunacs', 'subsab']}));
  app.get('/subtitle/:provider/:id.srt', async (req, res) => {
    const {provider, id} = req.params;
    try {
      if (!getProvider(provider) || !/^\d+$/.test(id)) throw new SubtitleError(400, 'Invalid subtitle request');
      const options = {};
      if (req.query.season !== undefined || req.query.episode !== undefined) {
        if (!/^\d+$/.test(req.query.season) || !/^[1-9]\d*$/.test(req.query.episode)) throw new SubtitleError(400, 'Invalid episode parameters');
        options.season = Number(req.query.season);
        options.episode = Number(req.query.episode);
        if (!Number.isSafeInteger(options.season) || !Number.isSafeInteger(options.episode)) throw new SubtitleError(400, 'Invalid episode parameters');
      }
      const buffer = await deps.downloadSubtitle(provider, id);
      const text = await processSubtitleBuffer(buffer, options);
      res.set('Content-Type', 'application/x-subrip; charset=utf-8');
      res.send(text);
    } catch (error) {
      console.error(`[Proxy] ${provider}/${id}:`, error.message, error.cause?.code || '', error.cause?.message || '');
      res.status(error instanceof SubtitleError ? error.status : 502).type('text/plain').send(error instanceof SubtitleError ? error.message : 'Subtitle download failed');
    }
  });
  app.get('/', (req, res) => res.type('html').send(landingTemplate(manifest)));
  app.use(getRouter(builder.getInterface()));
  return app;
}
module.exports = { createApp };
