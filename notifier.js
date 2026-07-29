const axios = require('axios');
const { WebhookClient } = require('discord.js');
const storage = require('./storage');

const msTeamsWebhook = process.env.MSTEAMSWEBHOOK_URL;
const dcWebhook = process.env.DISCORDWEBHOOK_URL;
const dcTestWebhook = process.env.DISCORD_TEST_WEBHOOK_URL;
const DISCORD_ENABLED = String(process.env.DISCORD_ENABLED || 'true').toLowerCase() === 'true';
const TEAMS_ENABLED = String(process.env.TEAMS_ENABLED || 'true').toLowerCase() === 'true';
const DISCORD_USE_TEST_WEBHOOK = String(process.env.DISCORD_USE_TEST_WEBHOOK || 'false').toLowerCase() === 'true';
const DISCORD_PING = String(process.env.DISCORD_PING || 'true').toLowerCase() === 'true';
const DISCORD_ROLE_ID = String(process.env.DISCORD_ROLE_ID || '1471243274617360434').trim();
const DISCORD_DEBUG_MENTION_ID = '1525866696898777179';
const DEBUG = String(process.env.DEBUG).toLowerCase() === 'true';

const discordWebhookUrl = DISCORD_USE_TEST_WEBHOOK && dcTestWebhook ? dcTestWebhook : dcWebhook;
const discordClient = (DISCORD_ENABLED && discordWebhookUrl) ? new WebhookClient({ url: discordWebhookUrl }) : null;

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

async function sendDiscord(payload) {
  if (!DISCORD_ENABLED || !discordClient) return;
  if (typeof payload === 'string' || payload === null) {
    await discordClient.send({ content: payload });
    return;
  }
  await discordClient.send(payload);
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

function formatDebugFieldLabel(dateInfo) {
  if (!dateInfo.firstSeenAt) {
    return `${dateInfo.date}   |   Added on: unknown`;
  }
  const addedDate = new Date(dateInfo.firstSeenAt);
  const addedDateShort = addedDate.toLocaleDateString('en-PH', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit'
  });
  const addedDateLong = addedDate.toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  const addedTime = addedDate.toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  return `${addedDateLong}   |   Added on: ${addedDateShort}   [${addedTime}]`;
}

function buildDebugEmbed(currentlyOpenWithTime) {
  const now = new Date();
  const titleDate = now.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit'
  });
  const titleTime = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  const title = `*                 SHUTTLE NOTIFICATION!!\n*         :calendar_spiral: (${titleDate})         :clock1: ${titleTime}\n\n**OPEN DATES:**`;

  const fields = currentlyOpenWithTime.length > 0
    ? currentlyOpenWithTime.map((dateInfo) => ({
        name: formatDebugFieldLabel(dateInfo),
        value: '--------------------------------------------------------'
      }))
    : [{ name: 'EMPTY', value: '--------------------------------------------------------' }];

  fields.push({
    name: 'BOOK HERE:',
    value: '[CLICK ME](https://feua.kliquep2p.com/client/booking-now)'
  });

  return {
    embeds: [
      {
        title,
        color: 16763904,
        fields
      }
    ],
    content: null,
    attachments: []
  };
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

  const pingPrefix = DISCORD_PING ? `<@&${DISCORD_ROLE_ID}>` : '';
  const discordPayload = buildDebugEmbed(currentlyOpenWithTime);

  discordPayload.content = DEBUG ? `<@${DISCORD_DEBUG_MENTION_ID}>` : pingPrefix || null;
  if (DEBUG) {
    discordPayload.allowedMentions = { users: [DISCORD_DEBUG_MENTION_ID] };
  }

  await Promise.allSettled([
    sendMsTeams(message),
    sendDiscord(discordPayload)
  ]);
}

module.exports = { notifyAll };
