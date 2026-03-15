// ============================================
// SMS SERVICE — TWILIO
// File: backend/services/sendSMS.js
// ============================================

const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function sendSMS({ to, message }) {
  try {
    // Make sure phone number has country code
    const formattedPhone = to.startsWith('+') ? to : `+1${to.replace(/\D/g, '')}`;

    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER, // Your Twilio number e.g. +15551234567
      to: formattedPhone
    });

    console.log(`💬 SMS sent to ${formattedPhone} — SID: ${result.sid}`);
    return result;
  } catch (error) {
    console.error('SMS error:', error.message);
    // Don't throw — if SMS fails, email still works
  }
}

module.exports = sendSMS;
