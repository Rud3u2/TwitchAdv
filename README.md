# TwitchAdv.user

Twitch ad blocker userscript by **Rud3u2**.

It removes Twitch preroll, midroll, and stitched HLS ads, hides display/banner ad nodes, and keeps your selected stream quality during ad breaks.

## Requirements

- A modern browser: Chrome, Edge, Brave, Opera, etc.
- Violentmonkey (recommended) or Tampermonkey
- The `TwitchAdv.user.js` file from this repository

uBlock Origin is optional. The script already hides Twitch display ads. Keep uBlock Origin enabled if you also want general tracker blocking.

## Install — beginner path

1. Install a userscript manager:
   - Violentmonkey: https://violentmonkey.github.io/get-it/
   - Tampermonkey: https://www.tampermonkey.net/
2. Open this repository on GitHub.
3. Click `TwitchAdv.user.js`.
4. Click **Raw**.
5. Violentmonkey should show an **Install** prompt. Click it.
6. If no prompt appears, open Violentmonkey dashboard, click **+**, choose **Install from URL**, paste the Raw URL, and confirm.
7. Close every Twitch tab.
8. Open Twitch again and hard refresh with **Ctrl+Shift+R**.

The installed script should appear in Violentmonkey as **TwitchAdv.user**.

## Remove the old script first

If **TWITCH NOMADS** or any other Twitch ad script is still enabled, disable or delete it. Two blockers running together make this one skip itself.

In Violentmonkey:

1. Open the dashboard.
2. Find the old Twitch script.
3. Toggle it off, or click delete.
4. Restart your browser.

## Verify it is working

1. Open a Twitch stream that normally plays ads.
2. Press **F12**, then click **Console**.
3. Start playback and watch through an ad break.

Green lines:

```text
hookWorkerFetch (vaft)
Blocking ads (embed)
Finished blocking ads
Reloading Twitch player
```

A brief quality flicker or player reload at the ad boundary is the clean-stream swap doing its job.

## Update

GitHub Raw installs can update from the script metadata. If a new version is posted:

1. Open Violentmonkey dashboard.
2. Click **Check for updates**.
3. Restart your browser.

If that fails, repeat the install steps with the latest Raw URL. Existing settings are not stored outside the script, so overwriting the old entry is safe.

## Troubleshooting

| Problem | Fix |
|---|---|
| Script does not appear in Violentmonkey | Install Violentmonkey first, then reinstall from the Raw URL |
| Console shows nothing | Hard refresh Twitch, close other ad scripts, check that TwitchAdv.user is enabled |
| `skipping vaft as there's another script active` | Disable every other Twitch ad blocker |
| Ads still play | Make sure you opened the Raw URL, not the GitHub file preview page |
| Quality drops | Confirm version 2.0.0 or later; do not use the `autoplay` fallback |
| Player error `#2000` | Close Twitch, reopen the tab, hard refresh; let the watchdog recover once |
| Nothing works after switching browsers | Reinstall the script in that browser's userscript manager |

## Publish this repository

For the maintainer:

1. Create a new GitHub repository.
2. Upload `TwitchAdv.user.js` and `README.md`.
3. Commit to the `main` branch.
4. Copy the Raw URL for `TwitchAdv.user.js`.
5. Replace the placeholder in the install section with your actual Raw URL.

Raw URL shape:

```text
https://raw.githubusercontent.com/<YOUR-GITHUB-USERNAME>/<REPO-NAME>/main/TwitchAdv.user.js
```

## Files

- `TwitchAdv.user.js` — the userscript
- `README.md` — this download and install guide

Creator: **Rud3u2**
