// ============================================
// DMV SLOT CHECKER — RUNS EVERY 30 MINUTES
// File: backend/jobs/checkDMVSlots.js
//
// This is the HEART of DMV Assistant.
// It automatically checks DMV websites,
// finds available slots, and sends alerts.
// YOU DON'T NEED TO DO ANYTHING — it runs itself.
// ============================================

const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const sendEmail = require('../services/sendEmail');
const sendSMS = require('../services/sendSMS');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// DMV website URLs for each state
const DMV_URLS = {
  'California': 'https://www.dmv.ca.gov/portal/appointments/select-appointment-type/',
  'Texas': 'https://www.dps.texas.gov/DriverLicense/appointmentSystem.htm',
  'Florida': 'https://www.flhsmv.gov/driver-licenses-id-cards/appointments/',
  'New York': 'https://dmv.ny.gov/office-visit/schedule-appointment-visit-dmv-office',
  'Arizona': 'https://azmvdnow.gov/home',
  'Virginia': 'https://www.dmv.virginia.gov/general/#appointment.asp',
  'Washington': 'https://www.dol.wa.gov/appointments/',
  'Colorado': 'https://mycolorado.gov/dmv-appointment',
  'Georgia': 'https://dds.georgia.gov/online-services/appointments',
  'Illinois': 'https://www.ilsos.gov/facilityfinder/facility',
  // Add all 50 states here
};

async function checkDMVSlots() {
  try {
    // 1. Get all active monitoring alerts from database
    const { data: alerts, error } = await supabase
      .from('alerts')
      .select('*, users(email, phone, plan, name)')
      .eq('status', 'active');

    if (error) throw error;
    if (!alerts || alerts.length === 0) {
      console.log('No active alerts to check');
      return;
    }

    console.log(`Checking ${alerts.length} active alerts...`);

    for (const alert of alerts) {
      try {
        const slotsFound = await scrapeDMVSlots(alert);

        if (slotsFound && slotsFound.length > 0) {
          console.log(`✅ SLOT FOUND for user ${alert.users.email}`);
          await notifyUser(alert, slotsFound[0]);
        }
      } catch (alertError) {
        console.error(`Error checking alert ${alert.id}:`, alertError.message);
        // Continue with next alert even if one fails
      }
    }
  } catch (error) {
    console.error('checkDMVSlots error:', error.message);
  }
}

// Scrapes DMV website to find available appointment slots
async function scrapeDMVSlots(alert) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  try {
    const page = await browser.newPage();

    // Set real browser headers to avoid being blocked
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );

    const dmvUrl = DMV_URLS[alert.state] || DMV_URLS['California'];
    await page.goto(dmvUrl, { waitUntil: 'networkidle0', timeout: 30000 });

    // Wait for page to load
    await page.waitForTimeout(2000);

    // Look for available dates on the page
    // These CSS selectors vary by state — customize per state
    const slots = await page.evaluate(() => {
      const availableSlots = [];

      // Common patterns DMV sites use for available slots
      const selectors = [
        '.available-date',
        '.slot-available',
        '[data-available="true"]',
        '.appointment-slot:not(.disabled)',
        'td.available',
        '.open-slot'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (el.textContent.trim()) {
            availableSlots.push(el.textContent.trim());
          }
        });
      }

      return availableSlots;
    });

    await browser.close();
    return slots;

  } catch (error) {
    await browser.close();
    console.error('Scraping error:', error.message);
    return [];
  }
}

// Sends email + SMS to user when slot is found
async function notifyUser(alert, slotDate) {
  const user = alert.users;

  // Send Email (ALL users — free and pro)
  await sendEmail({
    to: user.email,
    subject: `🎯 DMV Slot Available — ${alert.service_type} at ${alert.office}`,
    name: user.name,
    service: alert.service_type,
    office: alert.office,
    state: alert.state,
    slotDate: slotDate,
    bookingUrl: DMV_URLS[alert.state]
  });

  // Send SMS (Pro and Family users only)
  if (user.plan === 'pro' || user.plan === 'family') {
    if (user.phone) {
      await sendSMS({
        to: user.phone,
        message: `🎯 DMV Assistant: Slot found! ${alert.service_type} at ${alert.office} on ${slotDate}. Book now: ${DMV_URLS[alert.state]}`
      });
    }
  }

  // Save alert to history in database
  await supabase.from('alert_history').insert({
    alert_id: alert.id,
    user_id: alert.user_id,
    slot_date: slotDate,
    office: alert.office,
    service_type: alert.service_type,
    notified_at: new Date().toISOString(),
    channels: user.plan !== 'free' ? 'email,sms' : 'email'
  });

  // Update alert status
  await supabase
    .from('alerts')
    .update({ last_slot_found: slotDate, last_checked: new Date().toISOString() })
    .eq('id', alert.id);
}

module.exports = checkDMVSlots;
