// backend/routes/family.js — COMPLETE WITH INVITE + TRACKING
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
      status: m.status || 'active',
      invite_status: m.invite_status || 'direct',
      tracking: m.tracking_data ? JSON.parse(m.tracking_data) : null,
      created_at: m.invited_at
    }));
    res.json({ members });
  } catch(err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/family/members — add directly
router.post('/members', auth, async (req, res) => {
  try {
    const { name, email, relationship } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const { data: existing } = await supabase.from('family_members').select('id').eq('owner_user_id', req.user.userId);
    if (existing && existing.length >= 5) return res.status(400).json({ error: 'Maximum 5 family members allowed' });
    const { data, error } = await supabase.from('family_members')
      .insert([{ owner_user_id: req.user.userId, name, email: email||null, relationship: relationship||null, status: 'active', invite_status: 'direct', invited_at: new Date().toISOString() }])
      .select().single();
    if (error) return res.status(500).json({ error: 'Could not add: ' + error.message });
    res.json({ id: data.id, name, email: email||'', relationship: relationship||'', member: data });
  } catch(err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/family/invite — send email invite
router.post('/invite', auth, async (req, res) => {
  try {
    const { email, name, relationship } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const { data: existing } = await supabase.from('family_members').select('id').eq('owner_user_id', req.user.userId);
    if (existing && existing.length >= 5) return res.status(400).json({ error: 'Maximum 5 family members allowed' });
    const { data: alreadyInvited } = await supabase.from('family_members').select('id').eq('owner_user_id', req.user.userId).eq('email', email.toLowerCase()).maybeSingle();
    if (alreadyInvited) return res.status(400).json({ error: 'This email is already in your family plan' });
    const { data: owner } = await supabase.from('users').select('first_name,last_name,email').eq('id', req.user.userId).single();
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpiry = new Date(Date.now() + 7*24*60*60*1000).toISOString();
    const { data: member, error: insertError } = await supabase.from('family_members')
      .insert([{ owner_user_id: req.user.userId, name: name||email.split('@')[0], email: email.toLowerCase(), relationship: relationship||'Family Member', status: 'pending', invite_status: 'pending', invite_token: inviteToken, invite_expiry: inviteExpiry, invited_at: new Date().toISOString() }])
      .select().single();
    if (insertError) return res.status(500).json({ error: 'Could not create invite: ' + insertError.message });
    const ownerName = owner ? `${owner.first_name||''} ${owner.last_name||''}`.trim() : 'Your family member';
    const inviteLink = `${process.env.FRONTEND_URL||'https://dmv-assistant.vercel.app'}?invite=${inviteToken}&email=${encodeURIComponent(email)}`;
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send({
      to: email, from: { email: process.env.FROM_EMAIL||'alerts@dmvassistants.com', name: 'DMV Assistant' },
      subject: `${ownerName} invited you to DMV Assistant Family Plan`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:2rem;background:#07090f;color:#f1f5f9;border-radius:12px">
        <h2>You've been invited! 🎉</h2>
        <p style="color:#94a3b8"><strong style="color:#f1f5f9">${ownerName}</strong> invited you to their DMV Assistant Family Plan — includes appointment alerts, renewal reminders, VIN decoder, AI assistant & document vault.</p>
        <a href="${inviteLink}" style="display:block;text-align:center;padding:0.875rem 2rem;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;margin:1.5rem 0">Accept Invite & Create Account →</a>
        <p style="color:#475569;font-size:0.75rem;text-align:center">This invite expires in 7 days.</p>
      </div>`
    });
    res.json({ success: true, message: 'Invite sent to ' + email });
  } catch(err) { console.error('Invite error:', err); res.status(500).json({ error: 'Could not send invite: ' + err.message }); }
});

// POST /api/family/accept-invite — member creates account
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, email, password, name } = req.body;
    if (!token || !email || !password) return res.status(400).json({ error: 'Missing required fields' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const cleanEmail = email.toLowerCase().trim();
    const { data: invite } = await supabase.from('family_members').select('*').eq('invite_token', token).eq('email', cleanEmail).maybeSingle();
    if (!invite) return res.status(400).json({ error: 'Invalid or expired invite link' });
    if (new Date() > new Date(invite.invite_expiry)) return res.status(400).json({ error: 'Invite expired — ask owner to resend' });
    const passwordHash = await bcrypt.hash(password, 12);
    const nameParts = (name||'').trim().split(' ');
    const { data: newUser, error: createError } = await supabase.from('users')
      .insert([{ first_name: nameParts[0]||name, last_name: nameParts.slice(1).join(' ')||'', email: cleanEmail, password: passwordHash, plan: 'family', created_at: new Date().toISOString() }])
      .select().single();
    if (createError) {
      if (createError.message.includes('duplicate')) return res.status(400).json({ error: 'An account with this email already exists. Please sign in.' });
      return res.status(500).json({ error: 'Could not create account: ' + createError.message });
    }
    await supabase.from('family_members').update({ status: 'active', invite_status: 'accepted', member_user_id: newUser.id, invite_token: null }).eq('id', invite.id);
    const jwtToken = jwt.sign({ userId: newUser.id, email: cleanEmail }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const nameParts = (name||'').trim().split(' ');
    res.json({ 
      success: true, 
      token: jwtToken, 
      user: { 
        id: newUser.id, 
        name: name,
        first_name: nameParts[0] || name,
        last_name: nameParts.slice(1).join(' ') || '',
        email: cleanEmail, 
        plan: 'family',
        is_family_member: true
      } 
    });
  } catch(err) { console.error('Accept invite error:', err); res.status(500).json({ error: 'Server error: ' + err.message }); }
});

// POST /api/family/members/:id/tracking — save member tracking data
router.post('/members/:id/tracking', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const trackingData = req.body;
    const { error } = await supabase.from('family_members')
      .update({ tracking_data: JSON.stringify(trackingData) })
      .eq('id', id).eq('owner_user_id', req.user.userId);
    if (error) return res.status(500).json({ error: 'Could not save tracking data' });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/family/members/:id
router.delete('/members/:id', auth, async (req, res) => {
  try {
    await supabase.from('family_members').delete().eq('id', req.params.id).eq('owner_user_id', req.user.userId);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: 'Could not delete' }); }
});

module.exports = router;
