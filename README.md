# ShuttleBot

A portable FEUA Shuttle booking monitoring bot that works on Windows, Linux, and ARM-based Linux devices such as Raspberry Pi.

## Compatibility

This portable folder is designed to work with:
- Windows 10 / 11
- Linux desktop distros
- Raspberry Pi OS and other ARM Linux systems
- Node.js 20/22/24/25 (recommended)

## Setup Overview

1. Copy `.env.example` to `.env`.
2. Edit `.env` for login and notification settings.
3. Install dependencies.
4. Launch the bot.

## Installation: Linux / ARM / Raspberry Pi

### 1. Install Node.js and npm

Use a supported Node.js version:
- Node 20/22/24/25 is recommended.

On Debian/Ubuntu/Raspbian:
```bash
sudo apt update
sudo apt install -y nodejs npm
```

On Raspberry Pi OS, you may prefer NodeSource or nvm if the default repo is older.

### 2. Install Chromium

On Debian/Ubuntu/Raspbian:
```bash
sudo apt install -y chromium-browser
```

On Raspberry Pi OS / Raspberry Pi 4:
```bash
sudo apt install -y chromium-browser
```

On Arch Linux:
```bash
sudo pacman -Syu chromium
```

If Chromium is installed in a custom location, set `CHROME_PATH` in `.env`.

### 3. Install PM2 (optional, recommended for Raspberry Pi)

Install PM2 globally so the bot can run as a background service and restart automatically:
```bash
sudo npm install -g pm2
```

If you use `nvm` or a non-root Node installation, install it without `sudo`:
```bash
npm install -g pm2
```

Then use PM2 to start and manage the bot (see the PM2 section below).

### 3. Prepare environment

Copy the example file:
```bash
cp .env.example .env
```

Edit `.env` and set your credentials and webhooks.

### 4. Install packages

```bash
npm install
```

### 5. Start the bot

```bash
npm start
```

## Installation: Windows

### 1. Install Node.js

Download and install Node.js from the official site:
- https://nodejs.org/en/download/

Use Node 20/22/24/25 if possible.

### 2. Install Chrome or Chromium

Install Google Chrome or Chromium for Windows.

If Chrome is installed in a nonstandard location, set `CHROME_PATH` in `.env`.

### 3. Prepare environment

Copy `.env.example` to `.env` and edit it.

### 4. Install packages

Open PowerShell or CMD in this folder and run:
```cmd
npm install
```

### 5. Start the bot

In CMD:
```cmd
start.cmd
```

In PowerShell:
```powershell
.
start.ps1
```

## Environment Configuration

Set the following in `.env`:
- `USER_EMAIL` and `USER_PASSWORD` (default login method)
- `FEUA_SESSION_COOKIE` (optional; enable with `USE_SESSION_COOKIE=true`)
- `USE_SESSION_COOKIE=false` to force email/password login
- `MSTEAMSWEBHOOK_URL`
- `DISCORDWEBHOOK_URL`
- `DISCORD_ENABLED=true` to enable Discord notifications
- `DISCORD_PING=true` to enable role pings on Discord
- `DISCORD_ROLE_ID=1471243274617360434` to set a custom Discord role mention ID
- `TEAMS_ENABLED=true` to enable Microsoft Teams notifications
- `DEBUG=true` for safe debugging mode (no Discord role ping)
- `HEADLESS=false` to launch a visible browser window

## Running the bot

Start normally:
```bash
npm start
```

For debugging:
```bash
npm run debug
```

## Running with PM2 (recommended for Linux/Raspberry Pi)

If you want the bot to keep running after logout or reboot, use PM2.

Install PM2 globally on Raspberry Pi / Debian-based Linux:
```bash
sudo npm install -g pm2
```

If you manage Node with `nvm`, install it without `sudo`:
```bash
npm install -g pm2
```

Start the bot with PM2:
```bash
pm2 start ecosystem.config.js --name shuttlebot
```

Save the process list so it restarts automatically after reboot:
```bash
pm2 save
pm2 startup
```

If `pm2 startup` prints a command, run that command exactly to finish setup.

Check logs:
```bash
pm2 logs shuttlebot
```

Stop the bot:
```bash
pm2 stop shuttlebot
```

## Notes

- The app stores runtime state in `~/.shuttlebot/alerted-dates-db.json` on Linux/macOS.
- Windows will also store runtime state under the user home directory.
- `better-sqlite3` was removed to avoid native build issues on Linux and ARM.
