// ============================================
// EMAIL SERVICE — SENDGRID
// File: backend/services/sendEmail.js
// ============================================

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendEmail(options) {
  const { type = 'slot', to, subject, name } = options;

  let htmlContent = '';

  if (type === 'renewal') {
    // Renewal Reminder Email Template
    const { reminderType, daysLeft, expiryDate, plateOrId, vehicleName } = options;
    const urgencyColor = daysLeft <= 7 ? '#dc2626' : daysLeft <= 30 ? '#d97706' : '#2563eb';
    const urgencyText = daysLeft <= 7 ? 'ACTION REQUIRED' : daysLeft <= 30 ? 'Reminder' : 'Upcoming';

    htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background:#0d1117;padding:24px 32px;display:flex;align-items:center;">
      <div style="width:36px;height:36px;background:linear-gradient(135deg,#1d6ae5,#0d47a1);border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-right:10px;font-size:18px;">🏛</div>
      <span style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-0.5px;">DMV Assistant</span>
    </div>
    
    <!-- Alert Badge -->
    <div style="background:${urgencyColor};padding:12px 32px;">
      <span style="color:white;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">⏰ ${urgencyText} — ${daysLeft} Days Remaining</span>
    </div>
    
    <!-- Body -->
    <div style="padding:32px;">
      <h2 style="font-size:22px;font-weight:800;color:#0d1117;margin:0 0 8px;letter-spacing:-0.5px;">
        ${reminderType} Expires Soon
      </h2>
      <p style="color:#64748b;font-size:15px;margin:0 0 24px;">Hi ${name || 'there'}, your ${reminderType} is coming up for renewal.</p>
      
      <!-- Details Box -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Document</td>
            <td style="padding:6px 0;color:#0d1117;font-size:14px;font-weight:700;text-align:right;">${reminderType}</td>
          </tr>
          ${plateOrId ? `<tr><td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">ID / Plate</td><td style="padding:6px 0;color:#0d1117;font-size:14px;font-weight:700;text-align:right;">${plateOrId}</td></tr>` : ''}
          ${vehicleName ? `<tr><td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Vehicle</td><td style="padding:6px 0;color:#0d1117;font-size:14px;font-weight:700;text-align:right;">${vehicleName}</td></tr>` : ''}
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Expires</td>
            <td style="padding:6px 0;color:${urgencyColor};font-size:14px;font-weight:800;text-align:right;">${expiryDate}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Days Left</td>
            <td style="padding:6px 0;color:${urgencyColor};font-size:20px;font-weight:900;text-align:right;">${daysLeft} days</td>
          </tr>
        </table>
      </div>
      
      <!-- CTA Button -->
      <a href="https://dmvassistants.com/" style="display:block;background:#1d6ae5;color:white;text-align:center;padding:14px 24px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:700;margin-bottom:16px;">
        View Dashboard & Renew →
      </a>
      
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">
        You're receiving this because you set up a renewal reminder on DMV Assistant.<br/>
        <a href="https://dmvassistants.com/unsubscribe" style="color:#94a3b8;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  } else {
    // Slot Found Email Template
    const { service, office, state, slotDate, bookingUrl } = options;

    htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background:#0d1117;padding:24px 32px;">
      <div style="display:inline-flex;align-items:center;">
        <div style="width:36px;height:36px;background:linear-gradient(135deg,#1d6ae5,#0d47a1);border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-right:10px;font-size:18px;">🏛</div>
        <span style="color:#ffffff;font-size:18px;font-weight:800;">DMV Assistant</span>
      </div>
    </div>
    
    <!-- Success Badge -->
    <div style="background:#16a34a;padding:12px 32px;">
      <span style="color:white;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">🎯 DMV Slot Available — Book Now!</span>
    </div>
    
    <!-- Body -->
    <div style="padding:32px;">
      <h2 style="font-size:24px;font-weight:800;color:#0d1117;margin:0 0 8px;letter-spacing:-0.5px;">
        Appointment Slot Found!
      </h2>
      <p style="color:#64748b;font-size:15px;margin:0 0 24px;">Hi ${name || 'there'}, great news! A DMV appointment just became available. <strong>Book immediately — slots fill up fast!</strong></p>
      
      <!-- Slot Details -->
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Service</td>
            <td style="padding:6px 0;color:#0d1117;font-size:14px;font-weight:700;text-align:right;">${service}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Office</td>
            <td style="padding:6px 0;color:#0d1117;font-size:14px;font-weight:700;text-align:right;">${office}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">State</td>
            <td style="padding:6px 0;color:#0d1117;font-size:14px;font-weight:700;text-align:right;">${state}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Available Date</td>
            <td style="padding:6px 0;color:#16a34a;font-size:16px;font-weight:900;text-align:right;">${slotDate}</td>
          </tr>
        </table>
      </div>
      
      <!-- Book Now Button -->
      <a href="${bookingUrl}" style="display:block;background:#16a34a;color:white;text-align:center;padding:16px 24px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:800;margin-bottom:12px;">
        🗓 Book This Appointment Now →
      </a>
      <a href="https://dmvassistants.com/" style="display:block;background:#f8fafc;color:#475569;text-align:center;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;border:1px solid #e2e8f0;margin-bottom:20px;">
        View Your Dashboard
      </a>
      
      <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
        <p style="color:#92400e;font-size:13px;margin:0;font-weight:600;">⚡ Act Fast: This slot may be claimed by others. Open the booking link within the next few minutes.</p>
      </div>
      
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">
        DMV Assistant · dmvassistants.com<br/>
        <a href="https://dmvassistants.com/unsubscribe" style="color:#94a3b8;">Unsubscribe from alerts</a>
      </p>
    </div>
  </div>
</body>
</html>`;
  }

  await sgMail.send({
    to: to,
    from: {
      email: 'alerts@dmvassistants.com',
      name: 'DMV Assistant'
    },
    subject: subject,
    html: htmlContent
  });

  console.log(`📧 Email sent to ${to}`);
}

module.exports = sendEmail;
