// ============================================
// DMV ASSISTANT — BACKEND SERVER
// File: backend/server.js
// Run: node server.js
// ============================================

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ---- ROUTES ----
const authRoutes = require('./routes/auth');
const alertRoutes = require('./routes/alerts');
const renewalRoutes = require('./routes/renewals');
const billingRoutes = require('./routes/billing');

app.use('/api/auth', authRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/renewals', renewalRoutes);
app.use('/api/billing', billingRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'DMV Assistant API running', time: new Date() });
});

// ---- CRON JOBS (Automatic — runs without you doing anything) ----

// Job 1: Check DMV slots every 30 minutes
const checkDMVSlots = require('./jobs/checkDMVSlots');
cron.schedule('*/30 * * * *', () => {
  console.log('🔍 Checking DMV slots...', new Date().toLocaleTimeString());
  checkDMVSlots();
});

// Job 2: Check renewal reminders every day at 9 AM
const checkRenewals = require('./jobs/checkRenewals');
cron.schedule('0 9 * * *', () => {
  console.log('⏰ Checking renewal reminders...', new Date().toDateString());
  checkRenewals();
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ DMV Assistant API running on port ${PORT}`);
  console.log(`📧 Email: SendGrid connected`);
  console.log(`💬 SMS: Twilio connected`);
  console.log(`🗄️  Database: Supabase connected`);
});
