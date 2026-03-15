const { createClient } = require('@supabase/supabase-js');
const sendEmail = require('../services/sendEmail');
const sendSMS = require('../services/sendSMS');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkDMVSlots() {
  try {
    console.log('Checking DMV slots at', new Date().toLocaleTimeString());
    
    const { data: alerts, error } = await supabase
      .from('alerts')
      .select('*, users(email, phone, plan, name)')
      .eq('status', 'active');

    if (error) {
      console.log('DB error:', error.message);
      return;
    }

    if (!alerts || alerts.length === 0) {
      console.log('No active alerts');
      return;
    }

    console.log(`Found ${alerts.length} active alerts`);

    // NOTE: Real DMV scraping requires puppeteer
    // For now we log - puppeteer will be added later
    for (const alert of alerts) {
      console.log(`Monitoring: ${alert.state} - ${alert.office}`);
    }

  } catch (error) {
    console.error('checkDMVSlots error:', error.message);
  }
}

module.exports = checkDMVSlots;