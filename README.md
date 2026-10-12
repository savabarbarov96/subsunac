# Bulgarian Subtitles — Stremio addon

Bulgarian subtitles for movies and series from [Subsunacs](https://subsunacs.net/) and [SubsSab](http://subs.sab.bz/).

Install using `https://subsunac.vercel.app/manifest.json`. The addon ID and installation URL stay the same across updates. Yavka remains disabled because its bot protection blocks server-side requests.

## Release 2.0.1

Live checks of The Matrix and Breaking Bad S01E01/S01E02 reproduced the loading problem: SubsSab download URLs returned RAR data decoded as text and labelled SRT. The provider files were available, but the addon did not extract them. Six sampled Subsunacs downloads returned valid SRT; all four sampled SubsSab downloads failed before the repair.

The updated pipeline extracts ZIP and RAR archives in memory, converts MicroDVD subtitles to SRT, decodes Bulgarian Windows-1251/UTF-8/UTF-16 text, and validates subtitle content before returning success. It follows HTTP/HTTPS redirects, bounds downloads and extraction, and keeps generated URLs isolated between requests. Episode URLs carry season and episode parameters to select the correct file in packs.

## Local development

Requires Node.js 22 (the same runtime is used in CI and Vercel).

```bash
npm ci
npm start
```

Install `http://localhost:7000/manifest.json` in Stremio. Set `PORT` to change the local port or `PUBLIC_URL` to override the URL included in subtitle results. Vercel normally derives this URL from the incoming request.

The local server and `api/index.js` use the same Express application and subtitle pipeline.

## Verification

```bash
npm test                 # deterministic offline regression tests
npm run test:live:local  # repaired local code, actual provider downloads
npm run test:live        # deployed listing and subtitle download checks
```

Live tests are opt-in, have request deadlines, and test movie and series results from both active providers. `LIVE_URL` can point deployed checks at a Vercel preview. The local live suite executes Express routes in memory, allowing verification without opening a listening socket. Offline archives contain generated test text, not third-party subtitles.

## API

- `GET /manifest.json` — Stremio manifest.
- `GET /health` — application version and active providers; this is not a provider availability check.
- `GET /subtitles/movie/tt0133093.json` — movie subtitle options.
- `GET /subtitles/series/tt0903747:1:2.json` — episode subtitle options.
- `GET /subtitle/:provider/:id.srt` — extracted UTF-8 SRT.
- Optional `?season=1&episode=2` selects an episode from an archive; existing download paths remain valid.

Download errors return `400` for invalid parameters, `404` for missing files, `502` for invalid provider responses or unsupported/corrupt archives, and `504` for download timeouts. HTML and raw archive bytes are never served as successful SRT. Password-protected and multi-volume RAR archives are unsupported.

Downloads are limited to 20 MiB and 25 seconds across up to five redirects. Archives allow up to 1,000 files and 50 MiB declared unpacked content; selected subtitle files are limited to 5 MiB. RAR extraction is serialized because the decoder shares a WASM instance. The WASM asset is explicitly included in the Vercel function bundle.

## Release checks

CI runs offline tests and local live provider tests before promotion. Validate a Vercel preview, then deploy the tested commit to the existing production project. Run production live tests after deployment and confirm the manifest reports `2.0.1`. PC/TV playback acceptance is a separate manual check; successful HTTP downloads do not prove device playback or subtitle synchronization.

## License

MIT.
