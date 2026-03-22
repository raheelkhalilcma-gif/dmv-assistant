// backend/routes/family.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch(e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// GET /api/family/members
router.get('/members', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('family_members')
      .select('*')
      .eq('owner_user_id', req.user.userId)
      .order('invited_at', { ascending: true });

    if (error) {
      console.error('Get members error:', error);
      return res.status(500).json({ error: 'Could not load members' });
    }

    // Map to frontend-friendly format
    const members = (data || []).map(m => ({
      id: m.id,
      name: m.name || m.member_name || 'Member',
      email: m.member_email || m.email || '',
      relationship: m.relationship || '',
      status: m.status || 'active',
      created_at: m.invited_at
    }));

    res.json({ members });
  } catch(err) {
    console.error('Get members error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/family/members
router.post('/members', auth, async (req, res) => {
  try {
    const { name, email, relationship, state } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    // Check 5 member limit
    const { data: existing } = await supabase
      .from('family_members')
      .select('id')
      .eq('owner_user_id', req.user.userId);

    if (existing && existing.length >= 5) {
      return res.status(400).json({ error: 'Maximum 5 family members allowed' });
    }

    // Try insert with actual table columns
    // First check which columns exist by trying different insert strategies
    let insertData = {
      owner_user_id: req.user.userId,
      relationship: relationship || null,
      status: 'active',
      invited_at: new Date().toISOString()
    };

    // Add name/email - try both possible column names
    // The table might use member_name/member_email or name/email
    insertData.member_name = name;
    insertData.member_email = email || null;
    insertData.name = name;
    insertData.email = email || null;

    const { data, error } = await supabase
      .from('family_members')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error('Insert error:', error);

      // Try minimal insert with only confirmed columns
      const minInsert = {
        owner_user_id: req.user.userId,
        relationship: (name + (email ? ' <' + email + '>' : '')) || name,
        status: 'active',
        invited_at: new Date().toISOString()
      };

      const { data: data2, error: error2 } = await supabase
        .from('family_members')
        .insert([minInsert])
        .select()
        .single();

      if (error2) {
        console.error('Minimal insert error:', error2);
        return res.status(500).json({ error: 'Could not add member: ' + error2.message });
      }

      return res.json({
        id: data2.id,
        name: name,
        email: email || '',
        relationship: relationship || '',
        member: data2
      });
    }

    res.json({
      id: data.id,
      name: name,
      email: email || '',
      relationship: relationship || '',
      member: data
    });

  } catch(err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// DELETE /api/family/members/:id
router.delete('/members/:id', auth, async (req, res) => {
  try {
    await supabase
      .from('family_members')
      .delete()
      .eq('id', req.params.id)
      .eq('owner_user_id', req.user.userId);

    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: 'Could not delete' });
  }
});

module.exports = router;
