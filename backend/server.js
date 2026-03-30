const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'DMV Assistant API running', 
    time: new Date(),
    env: process.env.SUPABASE_URL ? 'configured' : 'missing vars'
  });
});

// ── Load all routes ──────────────────────────────────────
try {
  app.use('/api/auth',      require('./routes/auth'));
  app.use('/api/alerts',    require('./routes/alerts'));
  app.use('/api/renewals',  require('./routes/renewals'));
  app.use('/api/billing',   require('./routes/billing'));
  app.use('/api/family',    require('./routes/family'));
  app.use('/api/documents', require('./routes/documents'));
  console.log('All routes loaded successfully');
} catch(e) {
  console.error('Routes load error:', e.message);
}

// ── Cron jobs ────────────────────────────────────────────
if (process.env.SUPABASE_URL) {
  try {
    const cron = require('node-cron');
    const checkDMVSlots = require('./jobs/checkDMVSlots');
    const checkRenewals = require('./jobs/checkRenewals');
    
    // Check DMV slots every 30 minutes
    cron.schedule('*/30 * * * *', () => { checkDMVSlots(); });
    // Check renewal reminders every day at 9 AM
    cron.schedule('0 9 * * *', () => { checkRenewals(); });
    
    console.log('Cron jobs started!');
  } catch(e) {
    console.error('Cron error:', e.message);
  }
}

// ── Start server ─────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('DMV Assistant API running on port', PORT);
});
