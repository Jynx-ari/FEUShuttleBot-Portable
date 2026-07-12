const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.shuttlebot');
const STORAGE_FILE = path.join(DATA_DIR, 'alerted-dates-db.json');

function ensureStorage() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STORAGE_FILE)) {
      fs.writeFileSync(STORAGE_FILE, JSON.stringify({ alerted_dates: {} }, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('Storage init error:', err.message);
  }
}

function readStorage() {
  try {
    const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return { alerted_dates: {} };
  }
}

function writeStorage(data) {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed writing storage file:', err.message);
  }
}

function init() {
  ensureStorage();
}

function getAllDates() {
  const data = readStorage();
  return Object.keys(data.alerted_dates || {});
}

function upsertDates(dates, seenAt) {
  if (!Array.isArray(dates) || !dates.length) return;
  const data = readStorage();
  data.alerted_dates = data.alerted_dates || {};

  for (const date of dates) {
    const existing = data.alerted_dates[date] || {};
    data.alerted_dates[date] = {
      first_seen_at: existing.first_seen_at || seenAt,
      last_seen_at: seenAt,
      notified_at: existing.notified_at || null
    };
  }

  writeStorage(data);
}

function markNotified(dates, notifiedAt) {
  if (!Array.isArray(dates) || !dates.length) return;
  const data = readStorage();
  data.alerted_dates = data.alerted_dates || {};

  for (const date of dates) {
    if (!data.alerted_dates[date]) {
      data.alerted_dates[date] = { first_seen_at: notifiedAt, last_seen_at: notifiedAt, notified_at: notifiedAt };
    } else {
      data.alerted_dates[date].notified_at = notifiedAt;
    }
  }

  writeStorage(data);
}

function getDatesWithTimestamps(dates) {
  const data = readStorage();
  data.alerted_dates = data.alerted_dates || {};
  return dates.map((date) => ({
    date,
    firstSeenAt: data.alerted_dates[date] ? data.alerted_dates[date].first_seen_at : null
  }));
}

module.exports = { init, getAllDates, upsertDates, markNotified, getDatesWithTimestamps };
