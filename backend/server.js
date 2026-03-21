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

try {
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/alerts', require('./routes/alerts'));
  app.use('/api/renewals', require('./routes/renewals'));
  app.use('/api/billing', require('./routes/billing'));
  console.log('All routes loaded');
} catch(e) {
  console.log('Routes error:', e.message);
}

if (process.env.SUPABASE_URL) {
  try {
    const cron = require('node-cron');
    const checkDMVSlots = require('./jobs/checkDMVSlots');
    const checkRenewals = require('./jobs/checkRenewals');
    
    cron.schedule('*/30 * * * *', () => {
      checkDMVSlots();
    });
    
    cron.schedule('0 9 * * *', () => {
      checkRenewals();
    });
    
    console.log('Cron jobs started!');
  } catch(e) {
    console.log('Cron error:', e.message);
  }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`DMV Assistant API running on port ${PORT}`);
});
const familyRoutes = require('./routes/family');
app.use('/api/family', familyRoutes);

// Also add DELETE routes for alerts and renewals in their files:
// backend/routes/alerts.js mein:
// router.delete('/:id', auth, async (req,res)=>{
//   await supabase.from('alerts').delete().eq('id',req.params.id).eq('user_id',req.user.userId);
//   res.json({success:true});
// });

// backend/routes/renewals.js mein:
// router.delete('/:id', auth, async (req,res)=>{
//   await supabase.from('reminders').delete().eq('id',req.params.id).eq('user_id',req.user.userId);
//   res.json({success:true});
// });
// const familyRoutes = require('./routes/family');
// app.use('/api/family', familyRoutes);