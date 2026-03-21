const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: ['https://dmv-assistant.vercel.app', 'https://dmvassistants.com', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'DMV Assistant API running',
    time: new Date(),
    env: process.env.SUPABASE_URL ? 'configured' : 'missing vars'
  });
});

// Routes
try {
  app.use('/api/auth', require('./routes/auth'));
  console.log('Auth routes loaded');
} catch(e) {
  console.log('Auth routes error:', e.message);
}

try {
  app.use('/api/alerts', require('./routes/alerts'));
  console.log('Alerts routes loaded');
} catch(e) {
  console.log('Alerts routes error:', e.message);
}

try {
  app.use('/api/renewals', require('./routes/renewals'));
  console.log('Renewals routes loaded');
} catch(e) {
  console.log('Renewals routes error:', e.message);
}

try {
  app.use('/api/billing', require('./routes/billing'));
  console.log('Billing routes loaded');
} catch(e) {
  console.log('Billing routes error:', e.message);
}

try {
  app.use('/api/family', require('./routes/family'));
  console.log('Family routes loaded');
} catch(e) {
  console.log('Family routes error:', e.message);
}

try {
  app.use('/api/documents', require('./routes/documents'));
  console.log('Documents routes loaded');
} catch(e) {
  console.log('Documents routes error:', e.message);
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found: ' + req.path });
});

// Cron jobs
if (process.env.SUPABASE_URL) {
  try {
    const cron = require('node-cron');
    const checkDMVSlots = require('./jobs/checkDMVSlots');
    const checkRenewals = require('./jobs/checkRenewals');

    cron.schedule('*/30 * * * *', () => { checkDMVSlots(); });
    cron.schedule('0 9 * * *', () => { checkRenewals(); });

    console.log('Cron jobs started!');
  } catch(e) {
    console.log('Cron error:', e.message);
  }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`DMV Assistant API running on port ${PORT}`);
});
