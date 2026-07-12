const axios = require('axios');
const { WebhookClient } = require('discord.js');
const storage = require('./storage');

const msTeamsWebhook = process.env.MSTEAMSWEBHOOK_URL;
const dcWebhook = process.env.DISCORDWEBHOOK_URL;
const DEBUG = String(process.env.DEBUG).toLowerCase() === 'true';
const DISCORD_ENABLED = String(process.env.DISCORD_ENABLED || 'true').toLowerCase() === 'true';
const TEAMS_ENABLED = String(process.env.TEAMS_ENABLED || 'true').toLowerCase() === 'true';
const DISCORD_PING = String(process.env.DISCORD_PING || 'true').toLowerCase() === 'true';
const DISCORD_ROLE_ID = String(process.env.DISCORD_ROLE_ID || '').trim();

const discordClient = (DISCORD_ENABLED && dcWebhook) ? new WebhookClient({ url: dcWebhook }) : null;

async function postWithRetry(url, payload, retries = 3, backoff = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      await axios.post(url, payload, { timeout: 5000 });
      return true;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, backoff * Math.pow(2, i)));
    }
  }
}

async function sendMsTeams(text) {
  if (!TEAMS_ENABLED || !msTeamsWebhook) return;
  await postWithRetry(msTeamsWebhook, { text });
}

async function sendDiscord(text) {
  if (!DISCORD_ENABLED || !discordClient) return;
  await discordClient.send({ content: text });
}

function formatDateWithTime(dateInfo) {
  if (!dateInfo.firstSeenAt) {
    return dateInfo.date;
  }
  const addedTime = new Date(dateInfo.firstSeenAt).toLocaleString('en-PH', { 
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  return `${dateInfo.date} (added ${addedTime})`;
}

async function notifyAll(currentlyOpen, newDates) {
  // Extract date strings from the newDates array (may include "(released ...)" format)
  const dateStrings = newDates.map(d => typeof d === 'string' ? d.split(' (')[0] : d);
  const currentlyOpenStrings = currentlyOpen.map(d => typeof d === 'string' ? d.split(' (')[0] : d);
  
  // Get timestamps from database
  const currentlyOpenWithTime = storage.getDatesWithTimestamps(currentlyOpenStrings);
  const newDatesWithTime = storage.getDatesWithTimestamps(dateStrings);
  
  // Format the dates with their added times
  const currentlyOpenFormatted = currentlyOpenWithTime.map(formatDateWithTime);
  const newDatesFormatted = newDatesWithTime.map(formatDateWithTime);
  
  const safeList = arr => (Array.isArray(arr) && arr.length) ? arr.join('\n- ') : 'None';
  const timestamp = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
  const message = `As of ${timestamp}\n\nCurrently open dates:\n- ${safeList(currentlyOpenFormatted)}\n\nNew dates:\n- ${safeList(newDatesFormatted)}`;

  const basePayload = DEBUG
    ? `**DEBUG MODE ======= SHUTTLE INFO:** \n ${message}`
    : `**SHUTTLE INFO:** \n ${message}`;

  const pingPrefix = (!DEBUG && DISCORD_PING)
    ? (DISCORD_ROLE_ID ? `<@&${DISCORD_ROLE_ID}>` : `<@&1471243274617360434>`)
    : '';

  const discordPayload = `${pingPrefix}${basePayload}`;

  await Promise.allSettled([
    sendMsTeams(message),
    sendDiscord(discordPayload)
  ]);
}

module.exports = { notifyAll };
