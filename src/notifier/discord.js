const { WebhookClient } = require('discord.js');
const axios = require('axios');

const dcWebhook = process.env.DISCORDWEBHOOK_URL;
const dcTestWebhook = process.env.DISCORD_TEST_WEBHOOK_URL;
const DISCORD_ENABLED = String(process.env.DISCORD_ENABLED || 'true').toLowerCase() === 'true';
const DISCORD_USE_TEST_WEBHOOK = String(process.env.DISCORD_USE_TEST_WEBHOOK || 'false').toLowerCase() === 'true';
const DISCORD_PING = String(process.env.DISCORD_PING || 'false').toLowerCase() === 'true';
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
      await new Promise((resolve) => setTimeout(resolve, backoff * Math.pow(2, i)));
    }
  }
}

function buildDiscordPayload(currentlyOpenWithTime, shouldPing) {
  const now = new Date();
  const titleDate = now.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
  const titleTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  const title = `*                 SHUTTLE NOTIFICATION!!\n*         :calendar_spiral: (${titleDate})         :clock1: ${titleTime}\n\n**OPEN DATES:**`;

  const fields = currentlyOpenWithTime.length > 0
    ? currentlyOpenWithTime.map((dateInfo) => ({
        name: `${dateInfo.date}   |   Added on: ${new Date(dateInfo.firstSeenAt).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}   [${new Date(dateInfo.firstSeenAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}]`,
        value: '--------------------------------------------------------'
      }))
    : [{ name: 'EMPTY', value: '--------------------------------------------------------' }];

  fields.push({ name: 'BOOK HERE:', value: '[CLICK ME](https://feua.kliquep2p.com/client/booking-now)' });

  const pingPrefix = DEBUG ? `<@${DISCORD_DEBUG_MENTION_ID}>` : (shouldPing || DISCORD_PING ? `<@&${DISCORD_ROLE_ID}>` : '');

  return {
    embeds: [{ title, color: 16763904, fields }],
    content: pingPrefix || null,
    allowedMentions: DEBUG ? { users: [DISCORD_DEBUG_MENTION_ID] } : undefined
  };
}

async function sendDiscord(currentlyOpenWithTime, shouldPing = false) {
  if (!DISCORD_ENABLED || !discordClient) return { success: false, error: 'Discord disabled or webhook missing' };

  const payload = buildDiscordPayload(currentlyOpenWithTime, shouldPing);
  try {
    await discordClient.send(payload);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
}

module.exports = { sendDiscord };
