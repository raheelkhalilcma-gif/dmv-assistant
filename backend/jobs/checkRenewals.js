// ============================================
// RENEWAL REMINDER CHECKER — RUNS DAILY 9 AM
// File: backend/jobs/checkRenewals.js
//
// Every day at 9 AM this automatically checks
// who has a renewal coming up in 60, 30, or 7 days
// and sends them email + SMS reminders.
// FULLY AUTOMATIC — no manual work needed.
// ============================================

const { createClient } = require('@supabase/supabase-js');
const sendEmail = require('../services/sendEmail');
const sendSMS = require('../services/sendSMS');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkRenewals() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all active reminders from database
    const { data: reminders, error } = await supabase
      .from('reminders')
      .select('*, users(email, phone, plan, name)')
      .eq('status', 'active');

    if (error) throw error;
    if (!reminders || reminders.length === 0) return;

    console.log(`Checking ${reminders.length} renewal reminders...`);

    for (const reminder of reminders) {
      const expiryDate = new Date(reminder.expiry_date);
      const daysUntilExpiry = Math.ceil(
        (expiryDate - today) / (1000 * 60 * 60 * 24)
      );

      // Send reminders at exactly 60, 30, and 7 days before
      if ([60, 30, 7].includes(daysUntilExpiry)) {
        console.log(
          `⏰ Sending ${daysUntilExpiry}-day reminder to ${reminder.users.email}`
        );
        await sendRenewalAlert(reminder, daysUntilExpiry);
      }
    }

    console.log('✅ Renewal check complete');
  } catch (error) {
    console.error('checkRenewals error:', error.message);
  }
}

async function sendRenewalAlert(reminder, daysLeft) {
  const user = reminder.users;
  const urgency = daysLeft <= 7 ? 'URGENT' : daysLeft <= 30 ? 'Soon' : 'Upcoming';
  const emoji = daysLeft <= 7 ? '🚨' : daysLeft <= 30 ? '⚠️' : '⏰';

  // Send Email to ALL users (free + pro)
  await sendEmail({
    type: 'renewal',
    to: user.email,
    subject: `${emoji} ${urgency}: ${reminder.type} expires in ${daysLeft} days`,
    name: user.name,
    reminderType: reminder.type,
    daysLeft: daysLeft,
    expiryDate: reminder.expiry_date,
    plateOrId: reminder.plate_or_id,
    vehicleName: reminder.vehicle_name
  });

  // Send SMS to Pro + Family users only
  if (user.plan !== 'free' && user.phone) {
    const urgencyMsg = daysLeft <= 7
      ? `URGENT: expires in ${daysLeft} days!`
      : `expires in ${daysLeft} days`;

    await sendSMS({
      to: user.phone,
      message: `${emoji} DMV Assistant: ${reminder.type} ${urgencyMsg} (${reminder.expiry_date}). Visit dmvassistants.com to renew.`
    });
  }

  // Save to alert history
  await supabase.from('alert_history').insert({
    user_id: reminder.user_id,
    reminder_id: reminder.id,
    type: 'renewal_reminder',
    days_left: daysLeft,
    message: `${reminder.type} expires in ${daysLeft} days`,
    notified_at: new Date().toISOString(),
    channels: user.plan !== 'free' && user.phone ? 'email,sms' : 'email'
  });
}

module.exports = checkRenewals;
