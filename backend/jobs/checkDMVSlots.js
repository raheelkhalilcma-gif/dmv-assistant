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
      .select(`
        *,
        users (
          id,
          email,
          phone,
          plan,
          first_name,
          last_name,
          name
        )
      `)
      .eq('status', 'active');

    if (error) {
      console.log('DB error:', error.message);
      return;
    }

    if (!alerts || alerts.length === 0) {
      console.log('No active alerts to check');
      return;
    }

    console.log(`Found ${alerts.length} active alerts`);

    for (const alert of alerts) {
      const user = alert.users;
      if (!user) continue;

      // Get user name safely — works with both name and first_name columns
      const userName = user.name || 
        (user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'User');

      console.log(`Monitoring: ${alert.state} - ${alert.office || 'Any office'} for ${userName}`);

      // NOTE: Real DMV scraping logic goes here
      // For now we simulate — replace with real Cheerio scraper later
      // Example: const slots = await scrapeDMVSlots(alert.state, alert.office);
    }

    console.log('DMV slot check complete');

  } catch (err) {
    console.error('checkDMVSlots error:', err.message);
  }
}

module.exports = checkDMVSlots;
