// Load .env conditionally:
// - In `production` (PM2 production env) skip dotenv to avoid its tip messages.
// - In `debug` enable dotenv with debug tips so you can see helpful messages.
const _NODE_ENV = String(process.env.NODE_ENV || '').toLowerCase();
if (_NODE_ENV === 'debug') {
    require('dotenv').config({ debug: true });
} else if (_NODE_ENV !== 'production') {
    require('dotenv').config();
}
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { notify } = require('./src/notifier');
const storage = require('./storage');




// Configuration from .env
const {USER_EMAIL, USER_PASSWORD, FEUA_SESSION_COOKIE, USE_SESSION_COOKIE} = process.env;
const ENABLE_SESSION_COOKIE = String(process.env.USE_SESSION_COOKIE || 'false').toLowerCase() === 'true';
const ENABLE_PING = process.argv.some(arg => ['-with_ping', '--with_ping', '--with-ping'].includes(arg));
const {LOGIN_URL, BOOKING_URL} = {
    LOGIN_URL: 'https://feua.kliquep2p.com',
    BOOKING_URL: 'https://feua.kliquep2p.com/client/booking-now'
};



const LOGGED_IN_SELECTOR = '.flatpickr-day';



// Store runtime data outside the project tree to avoid triggering PM2 watch restarts
const DATA_DIR = path.join(os.homedir(), '.shuttlebot');
try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {
    console.error('Failed to create data directory:', e.message);
}
const ALERTED_DAYS_FILE = path.join(DATA_DIR, 'alerted-days.json');
const OLD_ALERTED_DAYS_FILE = path.join(DATA_DIR, 'alerted-days-old.json');
const BROWSER_PROFILE_DIR = path.join(DATA_DIR, 'chrome-profile');



let alertedDays = [];
let lastUpdated = null;
let browser;
let page;
const MEMORY_LIMIT_MB = parseInt(process.env.MEMORY_LIMIT_MB, 10) || 300;
let _restartingBrowser = false;

const DEBUG = String(process.env.DEBUG).toLowerCase() === 'true';
const HEADLESS = (typeof process.env.HEADLESS !== 'undefined')
    ? String(process.env.HEADLESS).toLowerCase() === 'true'
    : !DEBUG; // default: headless when not debugging


async function readPersisted(filePath) {
    const raw = await readJsonFile(filePath);
    if (Array.isArray(raw)) return { days: raw, lastUpdated: null };
    if (raw && typeof raw === 'object') {
        return { days: Array.isArray(raw.days) ? raw.days : [], lastUpdated: raw.lastUpdated || null };
    }
    return { days: [], lastUpdated: null };
}

async function readJsonFile(filePath) {
    try {
        const raw = await fs.promises.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return [];
    }
}

async function writeJsonFile(filePath, data) {
    try {
        await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`Failed to write ${filePath}:`, e.message);
    }
}

// notifier.js handles Teams/Discord notifications and retries

function buildLaunchOptions(userDataDir, executablePath) {
    return {
        executablePath: executablePath || undefined,
        userDataDir,
        headless: HEADLESS,
        defaultViewport: null,
        args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    };
}

function getFallbackProfileDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'shuttlebot-chrome-profile-'));
}

// Helper to scrape current available days from the calendar
async function getAvailableDays(page) {
    try {
        await page.waitForSelector(LOGGED_IN_SELECTOR, { timeout: 5000 });
        const availableDays = await page.evaluate(() => {
            return Array.from(
                document.querySelectorAll('.flatpickr-day:not(.flatpickr-disabled)')
            ).map(d => d.getAttribute('aria-label'));
        });
        return Array.from(new Set(availableDays || []));
    } catch (e) {
        console.error('Failed to read available days:', e.message);
        return [];
    }
}

/**
 * Sets the session cookie instead of performing email/password login
 */
async function setSessionCookie(page) {
    if (!FEUA_SESSION_COOKIE) {
        console.error('FEUA_SESSION_COOKIE not found in environment variables');
        return false;
    }
    try {
        await page.setCookie({
            name: 'feua_session',
            value: FEUA_SESSION_COOKIE,
            domain: 'feua.kliquep2p.com',
            path: '/',
            httpOnly: true,
            secure: true
        });
        console.log('Session cookie set successfully.');
        return true;
    } catch (e) {
        console.error('Failed to set session cookie:', e.message);
        return false;
    }
}

/**
 * Performs the actual login interaction (kept for fallback)
 */
async function performLogin(page) {
    await page.waitForSelector('.btn_signIn', { visible: true });
    await page.click('.btn_signIn');
    
    await page.type('input[name="email1"]', String(USER_EMAIL), { delay: 50 });
    await page.type('input[name="password1"]', String(USER_PASSWORD), { delay: 50 });

    await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);
    console.log('Login successful.');
}

/**
 * Checks if session is active; logs in if not
 */
async function ensureLoggedIn(page) {
    await page.goto(BOOKING_URL, { waitUntil: 'networkidle2' });
    const loggedInElement = await page.$(LOGGED_IN_SELECTOR);

    if (!loggedInElement) {
        console.log('Session expired or not found. Saving current updates and logging in...');

        // Save current alertedDays as the "old" snapshot (include timestamp)
        await writeJsonFile(OLD_ALERTED_DAYS_FILE, { days: alertedDays || [], lastUpdated: lastUpdated || new Date().toISOString() });

        if (ENABLE_SESSION_COOKIE) {
            // Try to use session cookie first, fallback to password login if cookie not available
            const cookieSet = await setSessionCookie(page);
            if (!cookieSet && USER_EMAIL && USER_PASSWORD) {
                console.log('Cookie not available, falling back to email/password login...');
                await performLogin(page);
            } else if (!cookieSet) {
                console.error('No session cookie or login credentials available!');
                return;
            }
        } else if (USER_EMAIL && USER_PASSWORD) {
            console.log('Session cookie login disabled; using email/password login.');
            await performLogin(page);
        } else {
            console.error('Session cookie login disabled and no email/password credentials available!');
            return;
        }

        await page.goto(BOOKING_URL, { waitUntil: 'networkidle2' });

        // After login, grab the current available days and replace alertedDays
        try {
            await page.waitForSelector(LOGGED_IN_SELECTOR, { timeout: 5000 });
            const availableDays = await page.evaluate(() => {
                return Array.from(
                    document.querySelectorAll('.flatpickr-day:not(.flatpickr-disabled)')
                ).map(d => d.getAttribute('aria-label'));
            });

            const oldPersisted = await readPersisted(OLD_ALERTED_DAYS_FILE);
            const oldDays = oldPersisted.days || [];

            // Replace in-memory alertedDays with the freshly fetched days (deduplicated)
            alertedDays = Array.from(new Set(availableDays || []));

            // Compare old vs new
            const added = alertedDays.filter(d => !oldDays.includes(d));
            const removed = oldDays.filter(d => !alertedDays.includes(d));

            if (added.length > 0) {
                added.forEach(day => console.log(`🚨 AFTER-LOGIN ADDED: ${day}`));
            }
            if (removed.length > 0) {
                removed.forEach(day => console.log(`🗑️ AFTER-LOGIN REMOVED: ${day}`));
            }
            if (added.length === 0 && removed.length === 0) {
                console.log('No changes detected after re-login.');
            }

            // Persist the replaced alertedDays with timestamp (file + DB)
            lastUpdated = new Date().toISOString();
            await writeJsonFile(ALERTED_DAYS_FILE, { days: alertedDays, lastUpdated });
            try { await storage.upsertDates(alertedDays, lastUpdated); } catch (e) { console.error('DB persist failed:', e.message); }
        } catch (e) {
            console.error('Error reading calendar after login:', e.message);
        }
    } else {
        console.log('Session active.');
    }
}

/**
 * Scrapes the calendar for available dates
 */
async function checkCalendars(page, { notify = true } = {}) {
    console.log('Checking for available dates...');
    try {
        await page.waitForSelector(LOGGED_IN_SELECTOR, { timeout: 5000 });
        
        const availableDays = await page.evaluate(() => {
            return Array.from(
                document.querySelectorAll('.flatpickr-day:not(.flatpickr-disabled)')
            ).map(d => d.getAttribute('aria-label'));
        });

        const deduped = Array.from(new Set(availableDays || []));
        const newDays = deduped.filter(d => !alertedDays.includes(d));

        if (newDays.length > 0) {
            const detectionTime = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
            newDays.forEach(day => console.log(`🚨 ALERT: New date found: ${day} at ${detectionTime}`));
            alertedDays = Array.from(new Set([...alertedDays, ...newDays]));

            // Persist merged alertedDays with timestamp (file + DB)
            lastUpdated = new Date().toISOString();
            await writeJsonFile(ALERTED_DAYS_FILE, { days: alertedDays, lastUpdated });
            try { await storage.upsertDates(alertedDays, lastUpdated); } catch (e) { console.error('DB persist failed:', e.message); }

            // Notify via MS Teams and Discord about the new dates
            if (notify) {
                try {
                    await sendMessage(deduped, newDays, ENABLE_PING);
                } catch (notifyErr) {
                    console.error('Failed to send notifications:', notifyErr.message);
                }
            }

        } else {
            console.log(`No new updates as of ${new Date().toLocaleTimeString()}`);
        }
        return newDays;
    } catch (e) {
        console.error("Error reading calendar:", e.message);
        return [];
    }
}

async function sendMessage(currentlyOpen, newDates, shouldPing = false){
    // Persist current availability and mark new dates as seen
    const seenAt = new Date().toISOString();
    if (Array.isArray(currentlyOpen) && currentlyOpen.length) {
        storage.upsertDates(currentlyOpen, seenAt);
    }

    if (Array.isArray(newDates) && newDates.length) {
        // newDates may include descriptions like "(released ...)"; extract date tokens
        const dateTokens = newDates.map(d => typeof d === 'string' ? d.split(' (')[0] : d);
        storage.upsertDates(dateTokens, seenAt);
        storage.markNotified(dateTokens, new Date().toISOString());
    }

    const currentlyOpenWithTime = storage.getDatesWithTimestamps(currentlyOpen);
    await notify({ discord: true, sms: true, shouldPing, currentlyOpenWithTime });
}


/**
 * Main Runner
 */
(async () => {
    console.log("MODE: ", process.env.MODE); // "normal"

    function resolveBrowserExecutable() {
        const envPaths = [
            process.env.CHROME_PATH,
            process.env.PUPPETEER_EXECUTABLE_PATH,
            process.env.CHROME_EXECUTABLE_PATH,
            process.env.BROWSER_PATH
        ].filter(Boolean);

        const candidatePaths = [
            ...envPaths,
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\Chromium\\Application\\chrome.exe',
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/usr/bin/brave-browser',
            '/usr/bin/microsoft-edge',
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
        ];

        for (const candidate of candidatePaths) {
            if (!candidate) continue;
            try {
                if (fs.existsSync(candidate)) return candidate;
            } catch (err) {
                // ignore permission errors while probing
            }
        }
        return null;
    }

    const browserExecutable = resolveBrowserExecutable();
    if (browserExecutable) {
        console.log(`Using browser executable: ${browserExecutable}`);
    } else {
        console.warn('No explicit browser executable found; Puppeteer will use its default bundled Chromium if available.');
    }

    const defaultProfileDir = BROWSER_PROFILE_DIR;
    const LAUNCH_OPTIONS = buildLaunchOptions(defaultProfileDir, browserExecutable);

    try {
        browser = await puppeteer.launch(LAUNCH_OPTIONS);
    } catch (launchError) {
        const message = String(launchError.message || launchError);
        if (/profile appears to be in use|profile.*locked/i.test(message)) {
            console.warn('Chromium profile is locked; retrying with a temporary browser profile.');
            const fallbackProfileDir = getFallbackProfileDir();
            const fallbackLaunchOptions = buildLaunchOptions(fallbackProfileDir, browserExecutable);
            browser = await puppeteer.launch(fallbackLaunchOptions);
        } else {
            throw launchError;
        }
    }

    page = await browser.newPage();

    // Load persisted alerts (if any)
   try {
    storage.init();
    const persisted = await storage.getAllDates();
    if (Array.isArray(persisted) && persisted.length) {
        alertedDays = Array.from(new Set(persisted));
        lastUpdated = 'unknown';
        console.log(`Loaded ${alertedDays.length} persisted alerted days from DB.`);
    }
} catch (e) {
    console.error('Failed to load persisted alerted days:', e.message);
}


    // Initial Run
    await ensureLoggedIn(page);

    // Fetch currently open dates and run the calendar check (suppress automatic notify so we only send one message)
    const currentlyOpen = await getAvailableDays(page);
    const newDates = await checkCalendars(page, { notify: false });

    console.log('DEBUG: currentlyOpen=', currentlyOpen);
    console.log('DEBUG: newDates=', newDates);

    await sendMessage(currentlyOpen, newDates, ENABLE_PING);



    // Periodic Check (Every 10 Minutes)
    setInterval(async () => {
        console.log('\n--- Running Scheduled Check ---');
        try {
            await ensureLoggedIn(page);
            await checkCalendars(page);
        } catch (err) {
            console.error('Interval Loop Error:', err);
        }
    }, 5 * 60 * 1000);
    //10 * 60 * 1000 10 mins

    // Memory monitor: restart browser if Node's heap grows too large
    setInterval(async () => {
        try {
            const heapMb = process.memoryUsage().heapUsed / 1024 / 1024;
            if (heapMb > MEMORY_LIMIT_MB && !_restartingBrowser) {
                _restartingBrowser = true;
                console.warn(`High memory usage detected: ${Math.round(heapMb)}MB > ${MEMORY_LIMIT_MB}MB — restarting browser`);
                try {
                    if (browser) await browser.close();
                } catch (e) {
                    console.error('Error closing browser during memory restart:', e.message);
                }
                try {
                    browser = await puppeteer.launch(LAUNCH_OPTIONS);
                    page = await browser.newPage();
                    await ensureLoggedIn(page);
                } catch (e) {
                    console.error('Failed to relaunch browser after memory restart:', e.message);
                }
                _restartingBrowser = false;
            }
        } catch (e) {
            console.error('Memory monitor error:', e.message);
        }
    },15 * 60 * 1000);
})();

process.on('SIGINT', async () => {
    console.log('SIGNAL INT');
    if (browser) await browser.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('SIGNAL TERMINATED');
    if (browser) await browser.close();
    process.exit(0);
});