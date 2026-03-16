const { createClient } = require('@supabase/supabase-js');
const sendEmail = require('../services/sendEmail');
const sendSMS = require('../services/sendSMS');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// CA DMV Office IDs
const CA_DMV_OFFICES = {
  'Los Angeles — Culver City': '548',
  'Los Angeles — Van Nuys': '531',
  'Los Angeles — Santa Monica': '608',
  'San Francisco — Fell St': '632',
  'San Diego — Normal St': '507',
  'Sacramento — Broadway': '683',
  'San Jose': '516',
  'Oakland — Claremont': '574',
  'Pasadena': '580',
  'Long Beach': '548',
};

// Check CA DMV slots via HTTP POST
async function checkCADMVSlots(officeId, officeName) {
  try {
    const axios = require('axios');
    const response = await axios.post(
      'https://www.dmv.ca.gov/wasapp/foa/findOfficeVisit.do',
      new URLSearchParams({
        officeId: officeId,
        requestedTask: 'DL',
        numberOfCustomers: '1',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
          'Referer': 'https://www.dmv.ca.gov/portal/appointments/',
        },
        timeout: 15000,
      }
    );

    const html = response.data;
    const hasSlots =
      html.includes('appointmentDate') ||
      html.includes('Select Date') ||
      html.includes('available') && !html.includes('no appointments available');

    const dateMatches = html.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
    const uniqueDates = [...new Set(dateMatches)].slice(0, 3);

    return { available: hasSlots, dates: uniqueDates };
  } catch (err) {
    console.log(`CA DMV check failed for ${officeName}:`, err.message);
    return { available: false, dates: [] };
  }
}

// Send email + SMS alert
async function sendSlotAlert(user, alert, slotInfo) {
  const userName = user.name ||
    (user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'there');

  const datesText = slotInfo.dates.length > 0
    ? slotInfo.dates.join(', ')
    : 'Check now';

  // Email
  if (user.email) {
    try {
      await sendEmail({
        to: user.email,
        subject: `🎯 DMV Slot Available — ${alert.office}, ${alert.state}!`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <div style="background:#1d6ae5;padding:20px;border-radius:8px 8px 0 0;text-align:center">
              <h1 style="color:#fff;margin:0">🎯 DMV Slot Found!</h1>
            </div>
            <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 8px 8px">
              <p>Hi ${userName},</p>
              <p>A <strong>${alert.service_type || 'DMV'}</strong> appointment slot is now 
                <strong style="color:#16a34a">AVAILABLE</strong> at:</p>
              <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0">
                <strong>Office:</strong> ${alert.office}<br/>
                <strong>State:</strong> ${alert.state}<br/>
                <strong>Dates:</strong> ${datesText}
              </div>
              <div style="text-align:center;margin:20px 0">
                <a href="https://www.dmv.ca.gov/wasapp/foa/searchAppts.do"
                   style="background:#1d6ae5;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">
                  Book Now →
                </a>
              </div>
              <p style="font-size:13px;color:#64748b;text-align:center">
                Act fast — slots fill quickly!<br/>
                DMV Assistant · dmvassistants.com
              </p>
            </div>
          </div>
        `,
      });
      console.log(`Email sent to ${user.email}`);
    } catch (e) {
      console.log('Email error:', e.message);
    }
  }

  // SMS — Pro/Family only
  if (user.phone && ['pro', 'family'].includes(user.plan)) {
    try {
      await sendSMS({
        to: user.phone,
        body: `DMV Assistant: Slot AVAILABLE at ${alert.office}, ${alert.state}! Dates: ${datesText}. Book: dmv.ca.gov`,
      });
      console.log(`SMS sent to ${user.phone}`);
    } catch (e) {
      console.log('SMS error:', e.message);
    }
  }

  // Log in history
  await supabase.from('alert_history').insert({
    user_id: user.id,
    alert_id: alert.id,
    type: 'slot_found',
    message: `Slot found at ${alert.office}, ${alert.state}. Dates: ${datesText}`,
    sent_at: new Date().toISOString(),
  });

  // Update last_alerted
  await supabase.from('alerts').update({
    last_alerted: new Date().toISOString()
  }).eq('id', alert.id);
}

// MAIN — runs every 30 min via cron
async function checkDMVSlots() {
  try {
    console.log('=== DMV Slot Check:', new Date().toLocaleTimeString(), '===');

    const { data: alerts, error } = await supabase
      .from('alerts')
      .select(`*, users(id, email, phone, plan, first_name, last_name, name)`)
      .eq('status', 'active');

    if (error) { console.log('DB error:', error.message); return; }
    if (!alerts || alerts.length === 0) { console.log('No active alerts'); return; }

    console.log(`Found ${alerts.length} active alerts`);

    for (const alert of alerts) {
      const user = alert.users;
      if (!user) continue;

      // Skip if alerted < 2 hours ago
      if (alert.last_alerted) {
        const hrs = (Date.now() - new Date(alert.last_alerted)) / 3600000;
        if (hrs < 2) { console.log(`Skip — alerted ${hrs.toFixed(1)}h ago`); continue; }
      }

      console.log(`Checking ${alert.state} - ${alert.office || 'Any'}...`);

      let slotInfo = { available: false, dates: [] };

      if (alert.state === 'California') {
        const officeId = CA_DMV_OFFICES[alert.office] || '548';
        slotInfo = await checkCADMVSlots(officeId, alert.office);
      } else {
        // Other states — coming soon
        console.log(`  ${alert.state} scraper coming soon`);
        continue;
      }

      if (slotInfo.available) {
        console.log(`  ✅ SLOT FOUND at ${alert.office}!`);
        await sendSlotAlert(user, alert, slotInfo);
      } else {
        console.log(`  No slots at ${alert.office}`);
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('=== Check complete ===');
  } catch (err) {
    console.error('Fatal error:', err.message);
  }
}

module.exports = checkDMVSlots;
