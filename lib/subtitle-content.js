const fs = require('node:fs');
const AdmZip = require('adm-zip');
const iconv = require('iconv-lite');
const { createExtractorFromData } = require('node-unrar-js');
const { SubtitleError } = require('./subtitle-error');

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 1000;
const extensions = ['.srt', '.sub', '.txt'];
let rarQueue = Promise.resolve();
let wasmBinary;

function decodeBulgarian(buffer) {
  let text;
  if (buffer[0] === 0xff && buffer[1] === 0xfe) text = iconv.decode(buffer.subarray(2), 'utf16-le');
  else if (buffer[0] === 0xfe && buffer[1] === 0xff) text = iconv.decode(buffer.subarray(2), 'utf16-be');
  else {
    try { text = new TextDecoder('utf-8', {fatal: true}).decode(buffer); }
    catch { text = iconv.decode(buffer, 'windows-1251'); }
  }
  return text.replace(/^\uFEFF/, '');
}

function formatSrtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}
function convertMicroDvdToSrt(text) {
  let fps = 25;
  const cues = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^\{(\d+)\}\{(\d+)\}(.*)$/);
    if (!match) continue;
    const [, start, end, raw] = match;
    if (start === end && /^\d+(?:[.,]\d+)?$/.test(raw.trim())) {
      const declared = Number(raw.trim().replace(',', '.'));
      if (declared > 0 && declared <= 120) fps = declared;
      continue;
    }
    const content = raw.replace(/\{[^}]*\}/g, '').replace(/\|/g, '\n').trim();
    if (content && Number(end) > Number(start)) cues.push({start: Number(start), end: Number(end), content});
  }
  if (!cues.length) return null;
  return cues.map((cue, i) => `${i + 1}\n${formatSrtTime(cue.start / fps)} --> ${formatSrtTime(cue.end / fps)}\n${cue.content}\n`).join('\n');
}
function normalizeSubtitle(buffer, maxFileBytes) {
  if (buffer.length > maxFileBytes) throw new SubtitleError(502, 'Subtitle file exceeds size limit');
  const decoded = decodeBulgarian(buffer);
  const text = convertMicroDvdToSrt(decoded) || decoded;
  if (/^\s*(?:<!doctype\s+html|<html|<body)/i.test(text) || text.includes('\0') || text.includes('\uFFFD') ||
      !/(?:^|\n)\d+\s*\r?\n\d{2}:[0-5]\d:[0-5]\d,\d{3}\s*-->\s*\d{2}:[0-5]\d:[0-5]\d,\d{3}\s*\r?\n\S/.test(text)) {
    throw new SubtitleError(502, 'Provider did not return valid subtitle content');
  }
  return text;
}
function chooseEntries(entries, {season, episode}) {
  let candidates = entries.filter(entry => extensions.some(ext => entry.name.toLowerCase().endsWith(ext)));
  if (season != null && episode != null) {
    const tokens = name => [...name.matchAll(/(?:^|[^\d])(?:s(\d{1,3})[ ._-]*e(\d{1,3})|(\d{1,3})x(\d{1,3}))(?!\d)/gi)];
    const matches = candidates.filter(entry => tokens(entry.name).some(m => Number(m[1] || m[3]) === season && Number(m[2] || m[4]) === episode));
    if (matches.length) candidates = matches;
    else if (candidates.length !== 1 || tokens(candidates[0].name).length) candidates = [];
  }
  if (!candidates.length) throw new SubtitleError(404, 'Requested subtitle file not found in archive');
  return candidates.sort((a, b) => extensions.findIndex(ext => a.name.toLowerCase().endsWith(ext)) - extensions.findIndex(ext => b.name.toLowerCase().endsWith(ext)));
}
function checkArchive(entries) {
  if (entries.length > MAX_ENTRIES || entries.reduce((sum, entry) => sum + entry.size, 0) > MAX_ARCHIVE_BYTES) {
    throw new SubtitleError(502, 'Subtitle archive exceeds size limit');
  }
}
function readCandidates(entries, options) {
  let failure;
  for (const entry of chooseEntries(entries, options)) {
    try {
      if (entry.size > options.maxFileBytes) throw new SubtitleError(502, 'Subtitle file exceeds size limit');
      return normalizeSubtitle(entry.read(), options.maxFileBytes);
    } catch (error) { failure = error; }
  }
  throw failure;
}
async function extractRar(buffer, options) {
  if (buffer.length < 15) throw new SubtitleError(502, 'Incomplete RAR archive');
  // Explicit asset loading lets Vercel trace the WASM file into the function bundle.
  wasmBinary ||= fs.readFileSync(require.resolve('node-unrar-js/dist/js/unrar.wasm'));
  const extractor = await createExtractorFromData({data: Uint8Array.from(buffer).buffer, wasmBinary});
  const headers = [...extractor.getFileList().fileHeaders];
  const entries = headers.filter(header => !header.flags.directory).map(header => ({name: header.name, size: header.unpSize}));
  checkArchive(entries);
  const chosen = chooseEntries(entries, options).filter(entry => entry.size <= options.maxFileBytes);
  if (!chosen.length) throw new SubtitleError(502, 'Subtitle file exceeds size limit');
  const names = new Set(chosen.map(entry => entry.name));
  // Exhaust the iterator: the upstream extractor releases native memory at its end.
  const extracted = [...extractor.extract({files: header => names.has(header.name)}).files];
  const files = extracted.filter(file => file.extraction).map(file => ({name: file.fileHeader.name, size: file.extraction.length, read: () => Buffer.from(file.extraction)}));
  return readCandidates(files, options);
}
async function processSubtitleBuffer(buffer, options = {}) {
  const settings = {maxFileBytes: MAX_FILE_BYTES, ...options};
  if (!buffer?.length) throw new SubtitleError(404, 'Subtitle not found');
  try {
    if (buffer.subarray(0, 2).equals(Buffer.from('PK'))) {
      const archive = new AdmZip(buffer);
      const entries = archive.getEntries().filter(entry => !entry.isDirectory).map(entry => ({name: entry.entryName, size: entry.header.size, read: () => entry.getData()}));
      checkArchive(entries);
      return readCandidates(entries, settings);
    }
    if (buffer.subarray(0, 6).equals(Buffer.from('526172211a07', 'hex'))) {
      // node-unrar-js shares a WASM singleton; serialize extraction to avoid request races.
      const result = rarQueue.then(() => extractRar(buffer, settings));
      rarQueue = result.catch(() => {});
      return await result;
    }
    return normalizeSubtitle(buffer, settings.maxFileBytes);
  } catch (error) {
    if (error instanceof SubtitleError) throw error;
    throw new SubtitleError(502, 'Invalid or unsupported subtitle archive', error);
  }
}
module.exports = { processSubtitleBuffer };
