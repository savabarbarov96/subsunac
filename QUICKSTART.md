# Quick Start Guide

Get Bulgarian subtitles from subsunacs.net in Stremio in 3 easy steps!

## Step 1: Start the Addon

```bash
npm start
```

You should see:
```
╔═══════════════════════════════════════════════════════════╗
║   Subsunacs Bulgarian Subtitles Addon for Stremio        ║
╚═══════════════════════════════════════════════════════════╝

Addon is running at:
  → http://127.0.0.1:7000/manifest.json
```

## Step 2: Install in Stremio

1. Open **Stremio** on your computer
2. Click the **⚙️ Settings** icon (top right)
3. Go to **Addons** tab
4. In the "Install from URL" field, paste:
   ```
   http://127.0.0.1:7000/manifest.json
   ```
5. Click **Install**

You should see "Subsunacs Bulgarian Subtitles" appear in your installed addons list.

## Step 3: Use It!

1. Play any movie or TV show in Stremio
2. Click the **CC** (closed captions) button at the bottom
3. Look for **Bulgarian** subtitles
4. Select one and enjoy!

## Tips

- **Multiple options**: You'll see several subtitle options with different FPS values. Choose one that matches your video's FPS for best sync.
- **Uploader info**: Each subtitle shows who uploaded it (e.g., "haskotoo", "Phoenix")
- **Keep it running**: The addon needs to stay running in your terminal/console for Stremio to access it

## Troubleshooting

**"No subtitles available"**
- Make sure the addon is still running (check your terminal)
- Not all content has Bulgarian subtitles on subsunacs.net
- Try searching for the same movie/show on subsunacs.net directly to verify

**Addon not appearing in Stremio**
- Make sure you used the correct URL: `http://127.0.0.1:7000/manifest.json`
- Check that the addon is running (terminal should show "Addon is running...")
- Try restarting Stremio

**Subtitles won't load**
- This is normal! Stremio handles encoding and archive extraction automatically
- Wait a few seconds for Stremio to process the subtitle file
- If it still doesn't work, try a different subtitle from the list

## Running on Startup (Optional)

### Windows
Create a batch file `start-addon.bat`:
```batch
@echo off
cd /d C:\Users\Aneta\OneDrive\Desktop\subsunac
npm start
```

### macOS/Linux
Add to your shell profile (`~/.bashrc` or `~/.zshrc`):
```bash
alias start-subsunacs="cd /path/to/subsunac && npm start"
```

## Stopping the Addon

Press `Ctrl+C` in the terminal where the addon is running.

---

Enjoy your Bulgarian subtitles! 🎬🇧🇬
