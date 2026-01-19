# Subsunacs Bulgarian Subtitles - Stremio Addon

A Stremio addon that provides Bulgarian subtitles from [subsunacs.net](https://subsunacs.net/) for movies and TV shows.

## Features

- ✅ Search for Bulgarian subtitles from subsunacs.net
- ✅ Support for both movies and TV series
- ✅ Automatic IMDB ID to title conversion
- ✅ Handles Cyrillic encoding automatically
- ✅ Extracts subtitles from ZIP/RAR archives
- ✅ Caching for better performance
- ✅ Shows FPS and uploader information

## Installation

### Prerequisites

- Node.js (version 14 or higher)
- npm

### Setup

1. Install dependencies:
```bash
npm install
```

2. Start the addon:
```bash
npm start
```

The addon will start on `http://127.0.0.1:7000`

3. Install in Stremio:
   - Open Stremio
   - Go to **Settings** → **Addons**
   - Enter the URL: `http://127.0.0.1:7000/manifest.json`
   - Click **Install**

## Usage

Once installed, the addon will automatically appear in your Stremio subtitle options when watching movies or TV shows:

1. Start playing any movie or TV show in Stremio
2. Click the **CC** (subtitles) button
3. Look for **Bulgarian** subtitles from this addon
4. Select your preferred subtitle (shows FPS and uploader info)

## How It Works

1. **IMDB Lookup**: Converts Stremio's IMDB ID to movie/series title
2. **Search**: Queries subsunacs.net for matching subtitles
3. **Results**: Returns up to 20 subtitle options with metadata
4. **Download**: Uses Stremio's built-in handler for encoding and archive extraction

## File Structure

```
subsunac/
├── index.js              # Main addon server
├── lib/
│   ├── imdb.js          # IMDB scraper
│   ├── subsunacs.js     # Subsunacs.net scraper
│   └── utils.js         # Utility functions
├── package.json
└── README.md
```

## Caching

The addon uses in-memory caching to improve performance:
- **IMDB lookups**: Cached for 24 hours
- **Subtitle searches**: Cached for 1 hour

## Troubleshooting

### No subtitles found
- Make sure subsunacs.net is accessible
- Try searching for the movie/show manually on subsunacs.net to verify availability
- Check console logs for errors

### Encoding issues
The addon uses Stremio's built-in encoding handler (`http://127.0.0.1:11470/subtitles.vtt?from=`) which automatically detects and converts Cyrillic text.

### Archive extraction issues
Stremio's local server handles ZIP and RAR extraction automatically. If you encounter issues, the subtitle files might be in an unsupported archive format.

## Development

### Testing

Run the test script to verify components:
```bash
node test.js
```

### Debug

Run the debug script to inspect subsunacs.net responses:
```bash
node debug-subsunacs.js
```

This will save the HTML response to `debug-response.html` for inspection.

## API Endpoints

When the addon is running, it exposes these endpoints:

- `GET /manifest.json` - Addon manifest
- `GET /subtitles/:type/:id.json` - Get subtitles for a movie/series

Example:
```bash
# Get subtitles for The Matrix (tt0133093)
curl http://127.0.0.1:7000/subtitles/movie/tt0133093.json
```

## License

ISC

## Credits

- Subtitles provided by [subsunacs.net](https://subsunacs.net/)
- Built with [Stremio Addon SDK](https://github.com/Stremio/stremio-addon-sdk)
