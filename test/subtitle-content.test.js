const test = require('node:test');
const assert = require('node:assert/strict');
const iconv = require('iconv-lite');
const { zip, rar } = require('./fixtures/archives');
const { processSubtitleBuffer } = require('../lib/subtitle-content');
const srt = '1\n00:00:01,000 --> 00:00:03,000\nЗдравей, свят!\n';

for (const encoding of ['utf8', 'windows-1251', 'utf16le']) {
  test(`decodes ${encoding} SRT`, async () => {
    const data = encoding === 'utf16le' ? Buffer.concat([Buffer.from([255, 254]), iconv.encode(srt, encoding)]) : iconv.encode(srt, encoding);
    assert.equal(await processSubtitleBuffer(data), srt);
  });
}
for (const [name, archive] of [['ZIP', zip], ['RAR', rar]]) {
  test(`extracts ${name} before decoding Cyrillic`, async () => {
    assert.equal(await processSubtitleBuffer(archive({'readme.txt': 'not subtitles', 'movie.srt': iconv.encode(srt, 'windows-1251')})), srt);
  });
  test(`selects requested episode in ${name}`, async () => {
    const data = archive({'show.S01E01.srt': srt, 'show.01x02.srt': srt.replace('Здравей', 'Втори')});
    assert.match(await processSubtitleBuffer(data, {season: 1, episode: 2}), /Втори/);
    await assert.rejects(processSubtitleBuffer(data, {season: 1, episode: 3}), {status: 404});
  });
  test(`accepts single unnamed episode file in ${name}`, async () => {
    assert.equal(await processSubtitleBuffer(archive({'subtitle.srt': srt}), {season: 1, episode: 2}), srt);
  });
  test(`rejects an explicitly wrong single episode in ${name}`, async () => {
    await assert.rejects(processSubtitleBuffer(archive({'show.S01E01.srt': srt}), {season: 1, episode: 2}), {status: 404});
  });
}
test('converts MicroDVD using declared fps', async () => {
  assert.equal(await processSubtitleBuffer(Buffer.from('{1}{1}25\n{25}{75}Здравей|свят\n')), '1\n00:00:01,000 --> 00:00:03,000\nЗдравей\nсвят\n');
});
for (const [name, buffer] of [
  ['HTML', Buffer.from('<html><body>Download moved</body></html>')],
  ['plain error', Buffer.from('Error: subtitle not found')],
  ['RAR header without archive', Buffer.from('526172211a0700', 'hex')],
  ['corrupt ZIP', Buffer.from('504b0304', 'hex')],
  ['binary', Buffer.from([0, 1, 2, 3])]
]) {
  test(`rejects ${name} instead of serving an SRT`, async () => {
    await assert.rejects(processSubtitleBuffer(buffer), {status: 502});
  });
}
test('returns 404 for an archive without subtitle files', async () => {
  await assert.rejects(processSubtitleBuffer(zip({'cover.jpg': 'image'})), {status: 404});
});
test('rejects oversized archive entries before extraction', async () => {
  await assert.rejects(processSubtitleBuffer(zip({'movie.srt': srt}), {maxFileBytes: 8}), {status: 502});
});
test('parallel RAR requests keep their own extracted contents', async () => {
  const contents = Array.from({length: 10}, (_, i) => srt.replace('свят', `свят ${i}`));
  assert.deepEqual(await Promise.all(contents.map(text => processSubtitleBuffer(rar({'movie.srt': text})))), contents);
});
