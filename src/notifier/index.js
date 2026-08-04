const { sendDiscord } = require('./discord');
const { sendSms } = require('./philsms');

async function notify({ discord = false, sms = false, shouldPing = false, currentlyOpenWithTime = [] }) {
  const results = { discord: null, sms: null };

  if (discord) {
    results.discord = await sendDiscord(currentlyOpenWithTime, shouldPing);
  }

  if (sms) {
    results.sms = await sendSms(currentlyOpenWithTime);
  }

  return results;
}

module.exports = { notify };
