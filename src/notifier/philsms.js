const axios = require('axios');

const PHILSMS_API_TOKEN = String(process.env.PHILSMS_API_TOKEN || '').trim();
const PHILSMS_SENDER = String(process.env.PHILSMS_SENDER || 'PhilSMS').trim();
const PHILSMS_RECIPIENT = String(process.env.PHILSMS_RECIPIENT || '').trim();
const PHILSMS_ENABLED = Boolean(PHILSMS_API_TOKEN && PHILSMS_RECIPIENT);

const PHILSMS_ENDPOINT = 'https://app.philsms.com/api/v3/sms/send';

function buildMessageBody(message) {
  return {
    recipient: PHILSMS_RECIPIENT,
    sender_id: PHILSMS_SENDER,
    type: 'plain',
    message
  };
}

function buildShortSmsPayload(currentlyOpenWithTime) {
  const header = 'SHUTTLE BOT NOTIFICATION';
  const lines = [header];

  currentlyOpenWithTime.slice(0, 5).forEach((dateInfo) => {
    const time = dateInfo.firstSeenAt
      ? new Date(dateInfo.firstSeenAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
      : '';
    const date = dateInfo.date || 'Unknown date';
    lines.push(`${date} | ${time}`);
  });

  return lines.join('\n');
}

async function sendSms(currentlyOpenWithTime) {
  if (!PHILSMS_ENABLED) {
    return { success: false, error: 'PhilSMS disabled or credentials missing' };
  }

  const payload = buildMessageBody(buildShortSmsPayload(currentlyOpenWithTime));

  try {
    const response = await axios.post(PHILSMS_ENDPOINT, payload, {
      headers: {
        Authorization: `Bearer ${PHILSMS_API_TOKEN}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 8000
    });

    if (response.status >= 200 && response.status < 300) {
      return { success: true, response: response.data };
    }

    return { success: false, error: `HTTP ${response.status}: ${JSON.stringify(response.data)}` };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
}

module.exports = { sendSms, PHILSMS_ENABLED };
