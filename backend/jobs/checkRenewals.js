const { createClient } = require('@supabase/supabase-js');
const sendEmail = require('../services/sendEmail');
const sendSMS = require('../services/sendSMS');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkRenewals() {
  try {
    console.log('Checking renewals at', new Date().toDateString());

    const { data: renewals, error } = await supabase
      .from('renewals')
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
      console.log('Renewals DB error:', error.message);
      return;
    }

    if (!renewals || renewals.length === 0) {
      console.log('No active renewals to check');
      return;
    }

    console.log(`Found ${renewals.length} renewal reminders`);

    const today = new Date();

    for (const renewal of renewals) {
      const user = renewal.users;
      if (!user) continue;

      // Get user name safely
      const userName = user.name ||
        (user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'User');

      const expiryDate = new Date(renewal.expiry_date);
      const daysLeft = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

      console.log(`${renewal.type} expires in ${daysLeft} days for ${userName}`);

      // Send reminders at 60, 30, 7 days
      if ([60, 30, 7].includes(daysLeft)) {
        console.log(`Sending ${daysLeft}-day reminder to ${user.email}`);

        // Send email reminder
        if (user.email) {
          try {
            await sendEmail({
              to: user.email,
              subject: `⏰ Reminder: Your ${renewal.type} expires in ${daysLeft} days`,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                  <h2 style="color:#1d6ae5">DMV Assistant Reminder</h2>
                  <p>Hi ${userName},</p>
                  <p>Your <strong>${renewal.type}</strong> expires in <strong style="color:#dc2626">${daysLeft} days</strong>.</p>
                  <p><strong>Expiry Date:</strong> ${expiryDate.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}</p>
                  ${renewal.notes ? `<p><strong>Notes:</strong> ${renewal.notes}</p>` : ''}
                  <p>Please renew it as soon as possible to avoid late fees or penalties.</p>
                  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
                  <p style="font-size:12px;color:#94a3b8">DMV Assistant · Not affiliated with any government DMV agency</p>
                </div>
              `
            });
            console.log(`Email sent to ${user.email} for ${renewal.type}`);
          } catch (emailErr) {
            console.log('Email error:', emailErr.message);
          }
        }

        // Send SMS for Pro/Family plan users
        if (user.phone && (user.plan === 'pro' || user.plan === 'family')) {
          try {
            await sendSMS({
              to: user.phone,
              body: `DMV Assistant: Your ${renewal.type} expires in ${daysLeft} days (${expiryDate.toLocaleDateString()}). Please renew soon!`
            });
            console.log(`SMS sent to ${user.phone}`);
          } catch (smsErr) {
            console.log('SMS error:', smsErr.message);
          }
        }

        // Log alert in Supabase
        await supabase.from('alert_history').insert({
          user_id: user.id,
          renewal_id: renewal.id,
          type: 'renewal_reminder',
          message: `${renewal.type} expires in ${daysLeft} days`,
          sent_at: new Date().toISOString()
        }).then(({ error: logError }) => {
          if (logError) console.log('Log error:', logError.message);
        });
      }
    }

    console.log('Renewal check complete');

  } catch (err) {
    console.error('checkRenewals error:', err.message);
  }
}

module.exports = checkRenewals;
