# ShuttleBot

This project monitors FEUA booking availability and sends notifications via Microsoft Teams/Discord.

## Linux / Raspberry Pi Setup

1. Install Node.js and npm.
   - Use Node 20/22/24/25 if possible.
   - Node 26 can work, but some packages may require additional compatibility checks.

2. Install Chromium or Chrome.
   - On Debian/Ubuntu/Raspbian: `sudo apt install -y chromium-browser`
   - On Arch: `sudo pacman -S chromium`

3. Copy the environment example.
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` and set at least one login option:
   - `FEUA_SESSION_COOKIE`
   - or `USER_EMAIL` / `USER_PASSWORD`

   Also configure notification webhooks:
   - `MSTEAMSWEBHOOK_URL`
   - `DISCORDWEBHOOK_URL`
   - `DISCORD_TEST_WEBHOOK_URL` (optional for safe testing)
   - `DISCORD_USE_TEST_WEBHOOK=false` to use the main webhook
   - `DISCORD_USE_TEST_WEBHOOK=true` to send Discord output to the test webhook
   - `DISCORD_ENABLED=true` to enable Discord notifications
   - `DISCORD_PING=true` to allow role pinging on Discord
   - `DISCORD_ROLE_ID` to customize the role mention ID
   - `TEAMS_ENABLED=true` to enable Teams notifications

5. If Chromium is installed in a nonstandard location, set `CHROME_PATH` in `.env`.
   ```bash
   CHROME_PATH=/usr/bin/chromium-browser
   ```

6. Install dependencies.
   ```bash
   npm install
   ```

7. Start the bot.
   ```bash
   npm start
   ```

8. For debugging:
   ```bash
   DEBUG=true npm start
   ```

## Raspberry Pi Notes

- Use `CHROME_PATH=/usr/bin/chromium-browser` or the path for your RPi install.
- If you run into Puppeteer missing dependencies, install the browser support libraries for your distro.
- The project now stores runtime data in `~/.shuttlebot/alerted-dates-db.json`, so the app is portable between OS installs.

## Cross-Platform Launch

- `package.json` now includes:
  - `npm start`
  - `npm run debug`

- `main.js` resolves browser executables on Windows, macOS, and Linux.

## Notes

- `better-sqlite3` has been removed to avoid native build issues on Linux and ARM.
- Persistent data is now stored in JSON under `~/.shuttlebot`.
- If you want PM2 or another process manager, use `ecosystem.config.js` or run `npm start` directly.
