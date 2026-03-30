// ============================================
// ALERTS ROUTES — DMV Appointment Monitoring
// File: backend/routes/alerts.js
// ============================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Middleware: verify JWT token
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// GET /api/alerts — Get user's alerts
router.get('/', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('user_id', req.user.userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ alerts: data });
});

// POST /api/alerts — Create new alert
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { state, office, serviceType, preferredDateFrom, notifyVia, phone } = req.body;

    // Check plan limits
    const { count } = await supabase
      .from('alerts')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.userId)
      .eq('status', 'active');

    if (req.user.plan === 'free' && count >= 2) {
      return res.status(403).json({
        error: 'Free plan limited to 2 alerts. Upgrade to Pro for unlimited.',
        upgradeRequired: true
      });
    }

    // Save phone if provided (for SMS)
    if (phone) {
      await supabase
        .from('users')
        .update({ phone })
        .eq('id', req.user.userId);
    }

    const { data, error } = await supabase
      .from('alerts')
      .insert({
        user_id: req.user.userId,
        state,
        office,
        service_type: serviceType,
        preferred_date_from: preferredDateFrom,
        notify_via: notifyVia || 'email',
        status: 'active',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, alert: data });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/alerts/:id — Delete alert
router.delete('/:id', authMiddleware, async (req, res) => {
  const { error } = await supabase
    .from('alerts')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
router.delete('/:id', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    await supabase.from('alerts').delete()
      .eq('id', req.params.id)
      .eq('user_id', decoded.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete' });
  }
});