// backend/routes/family.js — COMPLETE FIXED
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const sgMail = require('@sendgrid/mail');
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
    if (error) return res.status(500).json({ error: 'Could not load members' });
    const members = (data || []).map(m => ({
      id: m.id,
      name: m.name || 'Member',
      email: m.email || '',
      relationship: m.relationship || '',
      status: m.invite_status || m.status || 'direct',
      tracking_data: m.tracking_data ? JSON.parse(m.tracking_data) : null
    }));
    res.json({ members });
  } catch(err) {
    console.error('Get members error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/family/members — add member directly
router.post('/members', auth, async (req, res) => {
  try {
    const { name, email, relationship, state } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const { data, error } = await supabase.from('family_members').insert([{
      owner_user_id: req.user.userId,
      name, email: email || null,
      relationship: relationship || '',
      state: state || null,
      invite_status: 'direct',
      invited_at: new Date().toISOString()
    }]).select().single();
    if (error) return res.status(500).json({ error: 'Could not add member: ' + error.message });
    res.json({ success: true, member: { id: data.id, name: data.name, email: data.email, relationship: data.relationship, status: 'direct' }});
  } catch(err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/family/invite — send email invite
router.post('/invite', auth, async (req, res) => {
  try {
    const { email, name, relationship } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const cleanEmail = email.toLowerCase().trim();

    // Check plan
    const { data: owner } = await supabase.from('users').select('plan,first_name,last_name').eq('id', req.user.userId).single();
    if (!owner || owner.plan !== 'family') return res.status(403).json({ error: 'Family plan required to invite members' });

    // Check member limit (5 max)
    const { data: existing } = await supabase.from('family_members').select('id').eq('owner_user_id', req.user.userId);
    if (existing && existing.length >= 5) return res.status(400).json({ error: 'Maximum 5 family members allowed' });

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    // Upsert member record
    const { data: member, error: memberErr } = await supabase.from('family_members').upsert([{
      owner_user_id: req.user.userId,
      email: cleanEmail,
      name: name || '',
      relationship: relationship || 'Family Member',
      invite_token: inviteToken,
      invite_expiry: expiry,
      invite_status: 'invited',
      invited_at: new Date().toISOString()
    }], { onConflict: 'owner_user_id,email' }).select().single();

    if (memberErr) return res.status(500).json({ error: 'Could not create invite: ' + memberErr.message });

    const ownerName = `${owner.first_name || ''} ${owner.last_name || ''}`.trim() || 'Your family member';
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.dmvassistants.com';
    const inviteLink = `${frontendUrl}?invite=${inviteToken}&email=${encodeURIComponent(cleanEmail)}`;

    try {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      await sgMail.send({
        to: cleanEmail,
        from: { email: process.env.FROM_EMAIL || 'alerts@dmvassistants.com', name: 'DMV Assistant' },
        subject: `${ownerName} invited you to DMV Assistant Family Plan`,
        html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:2rem;background:#f8fafc;border-radius:12px">
          <div style="text-align:center;margin-bottom:1.5rem">
            <div style="width:60px;height:60px;background:linear-gradient(135deg,#1a56e8,#0d3fa8);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:1.8rem">🏛</div>
          </div>
          <h2 style="color:#0f172a;margin-bottom:0.5rem">You're invited to DMV Assistant!</h2>
          <p style="color:#475569;margin-bottom:1.5rem"><strong>${ownerName}</strong> has invited you to join their Family Plan — get full access to all DMV tools, reminders, and alerts.</p>
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:1.25rem;margin-bottom:1.5rem">
            <div style="font-size:0.85rem;color:#0f172a;font-weight:700;margin-bottom:0.75rem">✅ What you get with Family Plan:</div>
            <div style="font-size:0.82rem;color:#475569;line-height:1.8">
              ✅ Unlimited renewal reminders<br/>
              ✅ Appointment slot alerts (instant email + SMS)<br/>
              ✅ AI DMV Assistant<br/>
              ✅ 5 GB Document Vault<br/>
              ✅ Your own personal dashboard<br/>
              ✅ <strong>No payment needed</strong> — covered by ${ownerName}
            </div>
          </div>
          <a href="${inviteLink}" style="display:block;text-align:center;padding:0.875rem 2rem;background:linear-gradient(135deg,#1a56e8,#0d3fa8);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:1rem;margin-bottom:1.25rem">Accept Invitation →</a>
          <p style="font-size:0.75rem;color:#94a3b8;text-align:center">Link expires in 7 days. Or copy: ${inviteLink}</p>
        </div>`
      });
    } catch(emailErr) {
      console.error('Invite email error:', emailErr.message);
    }

    res.json({ success: true, message: `Invite sent to ${cleanEmail}` });
  } catch(err) {
    console.error('Invite error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// POST /api/family/accept-invite — invited member creates account & gets dashboard
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, email, password, name } = req.body;
    if (!token || !email || !password) return res.status(400).json({ error: 'Missing required fields' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const cleanEmail = email.toLowerCase().trim();

    const { data: invite } = await supabase.from('family_members')
      .select('*').eq('invite_token', token).eq('email', cleanEmail).maybeSingle();

    if (!invite) return res.status(400).json({ error: 'Invalid or expired invite link' });
    if (new Date() > new Date(invite.invite_expiry)) return res.status(400).json({ error: 'Invite expired — ask owner to resend' });

    // Check if user already exists
    const { data: existingUser } = await supabase.from('users').select('id,plan').eq('email', cleanEmail).maybeSingle();

    let userId, userPlan = 'family';

    if (existingUser) {
      // Update existing user to family plan
      userId = existingUser.id;
      await supabase.from('users').update({ plan: 'family' }).eq('id', userId);
    } else {
      // Create new user
      const passwordHash = await bcrypt.hash(password, 12);
      const nameParts = (name || '').trim().split(' ');
      const { data: newUser, error: createErr } = await supabase.from('users').insert([{
        first_name: nameParts[0] || name,
        last_name: nameParts.slice(1).join(' ') || '',
        email: cleanEmail,
        password: passwordHash,
        plan: 'family',
        created_at: new Date().toISOString()
      }]).select().single();

      if (createErr) {
        if (createErr.message.includes('duplicate')) return res.status(400).json({ error: 'Account already exists. Please sign in.' });
        return res.status(500).json({ error: 'Could not create account: ' + createErr.message });
      }
      userId = newUser.id;
    }

    // Mark invite as accepted
    await supabase.from('family_members').update({
      invite_status: 'accepted',
      member_user_id: userId,
      invite_token: null
    }).eq('id', invite.id);

    const jwtToken = jwt.sign({ userId, email: cleanEmail }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const nameParts = (name || '').trim().split(' ');

    res.json({
      success: true,
      token: jwtToken,
      user: {
        id: userId,
        name: name,
        first_name: nameParts[0] || name,
        last_name: nameParts.slice(1).join(' ') || '',
        email: cleanEmail,
        plan: 'family',
        is_family_member: true
      }
    });
  } catch(err) {
    console.error('Accept invite error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// POST /api/family/members/:id/tracking — save member tracking data
router.post('/members/:id/tracking', auth, async (req, res) => {
  try {
    const { error } = await supabase.from('family_members')
      .update({ tracking_data: JSON.stringify(req.body) })
      .eq('id', req.params.id).eq('owner_user_id', req.user.userId);
    if (error) return res.status(500).json({ error: 'Could not save tracking data' });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/family/members/:id
router.delete('/members/:id', auth, async (req, res) => {
  try {
    await supabase.from('family_members').delete()
      .eq('id', req.params.id).eq('owner_user_id', req.user.userId);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: 'Could not delete' }); }
});

module.exports = router;
