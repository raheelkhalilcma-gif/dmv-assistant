// backend/routes/family.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch(e) { res.status(401).json({ error: 'Invalid token' }); }
}

// GET /api/family/members
router.get('/members', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('family_members')
      .select('*')
      .eq('owner_user_id', req.user.userId)
      .order('invited_at', { ascending: true });
    if (error) { console.error('Get members error:', error); return res.status(500).json({ error: 'Could not load members' }); }
    const members = (data || []).map(m => ({
      id: m.id,
      name: m.name || m.relationship || 'Member',
      email: m.email || '',
      relationship: m.relationship || '',
      status: m.status || 'active',
      created_at: m.invited_at
    }));
    res.json({ members });
  } catch(err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/family/members
router.post('/members', auth, async (req, res) => {
  try {
    const { name, email, relationship, state } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const { data: existing } = await supabase.from('family_members').select('id').eq('owner_user_id', req.user.userId);
    if (existing && existing.length >= 5) return res.status(400).json({ error: 'Maximum 5 family members allowed' });

    const { data, error } = await supabase
      .from('family_members')
      .insert([{
        owner_user_id: req.user.userId,
        name: name,
        email: email || null,
        relationship: relationship || null,
        status: 'active',
        invited_at: new Date().toISOString()
      }])
      .select().single();

    if (error) { console.error('Insert error:', error); return res.status(500).json({ error: 'Could not add: ' + error.message }); }
    res.json({ id: data.id, name: name, email: email || '', relationship: relationship || '', member: data });
  } catch(err) { res.status(500).json({ error: 'Server error: ' + err.message }); }
});

// DELETE /api/family/members/:id
router.delete('/members/:id', auth, async (req, res) => {
  try {
    await supabase.from('family_members').delete().eq('id', req.params.id).eq('owner_user_id', req.user.userId);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: 'Could not delete' }); }
});

module.exports = router;
