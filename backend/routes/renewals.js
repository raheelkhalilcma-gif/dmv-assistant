// ============================================
// RENEWALS ROUTES
// File: backend/routes/renewals.js
// ============================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

// GET /api/renewals
router.get('/', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', req.user.userId)
    .order('expiry_date', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ reminders: data });
});

// POST /api/renewals
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { type, expiryDate, plateOrId, vehicleName, notifyVia } = req.body;

    const { count } = await supabase
      .from('reminders')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.userId)
      .eq('status', 'active');

    if (req.user.plan === 'free' && count >= 2) {
      return res.status(403).json({
        error: 'Free plan limited to 2 reminders. Upgrade to Pro.',
        upgradeRequired: true
      });
    }

    const { data, error } = await supabase
      .from('reminders')
      .insert({
        user_id: req.user.userId,
        type,
        expiry_date: expiryDate,
        plate_or_id: plateOrId,
        vehicle_name: vehicleName,
        notify_via: notifyVia || 'email',
        status: 'active',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, reminder: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/renewals/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  const { error } = await supabase
    .from('reminders')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;