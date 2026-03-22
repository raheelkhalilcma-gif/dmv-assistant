// backend/routes/family.js — COMPLETE WITH INVITE SYSTEM
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const sgMail = require('@sendgrid/mail');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch(e) { res.status(401).json({ error: 'Invalid token' }); }
}

// ─── GET members ────────────────────────────────────────────
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
      invite_status: m.invite_status || null,
      created_at: m.invited_at
    }));

    res.json({ members });
  } catch(err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST add member directly ────────────────────────────────
router.post('/members', auth, async (req, res) => {
  try {
    const { name, email, relationship, state } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const { data: existing } = await supabase
      .from('family_members').select('id').eq('owner_user_id', req.user.userId);
    if (existing && existing.length >= 5)
      return res.status(400).json({ error: 'Maximum 5 family members allowed' });

    const { data, error } = await supabase
      .from('family_members')
      .insert([{
        owner_user_id: req.user.userId,
        name: name,
        email: email || null,
        relationship: relationship || null,
        status: 'active',
        invite_status: 'direct',
        invited_at: new Date().toISOString()
      }])
      .select().single();

    if (error) return res.status(500).json({ error: 'Could not add: ' + error.message });
    res.json({ id: data.id, name, email: email || '', relationship: relationship || '', member: data });
  } catch(err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ─── POST send invite ─────────────────────────────────────────
router.post('/invite', auth, async (req, res) => {
  try {
    const { email, name, relationship } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    // Check limit
    const { data: existing } = await supabase
      .from('family_members').select('id').eq('owner_user_id', req.user.userId);
    if (existing && existing.length >= 5)
      return res.status(400).json({ error: 'Maximum 5 family members allowed' });

    // Check if already invited
    const { data: alreadyInvited } = await supabase
      .from('family_members')
      .select('id').eq('owner_user_id', req.user.userId).eq('email', email.toLowerCase()).single();
    if (alreadyInvited)
      return res.status(400).json({ error: 'This email is already in your family plan' });

    // Get owner info
    const { data: owner } = await supabase
      .from('users').select('name, email').eq('id', req.user.userId).single();

    // Create invite token
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    // Add as pending member
    const { data: member, error: insertError } = await supabase
      .from('family_members')
      .insert([{
        owner_user_id: req.user.userId,
        name: name || email.split('@')[0],
        email: email.toLowerCase(),
        relationship: relationship || 'Family Member',
        status: 'pending',
        invite_status: 'pending',
        invite_token: inviteToken,
        invite_expiry: inviteExpiry,
        invited_at: new Date().toISOString()
      }])
      .select().single();

    if (insertError) return res.status(500).json({ error: 'Could not create invite: ' + insertError.message });

    // Send invite email
    const inviteLink = `${process.env.FRONTEND_URL || 'https://dmv-assistant.vercel.app'}?invite=${inviteToken}&email=${encodeURIComponent(email)}`;
    const ownerName = owner ? owner.name : 'Your family member';

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send({
      to: email,
      from: { email: process.env.FROM_EMAIL || 'alerts@dmvassistants.com', name: 'DMV Assistant' },
      subject: `${ownerName} invited you to join their DMV Assistant Family Plan`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:2rem;background:#07090f;color:#f1f5f9;border-radius:12px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:1.5rem">
            <div style="width:40px;height:40px;border-radius:9px;background:linear-gradient(135deg,#1d6ae5,#0d47a1);display:flex;align-items:center;justify-content:center;font-size:1.1rem">🏛</div>
            <div style="font-size:1.1rem;font-weight:900">DMV Assistant</div>
          </div>
          <h2 style="color:#f1f5f9;margin-bottom:0.5rem">You've been invited! 🎉</h2>
          <p style="color:#94a3b8;font-size:0.9rem;line-height:1.6;margin-bottom:1.5rem">
            <strong style="color:#f1f5f9">${ownerName}</strong> has invited you to join their DMV Assistant Family Plan.
            You'll get access to appointment alerts, renewal reminders, and DMV tools — all covered under their plan.
          </p>
          <div style="background:#111827;border:1px solid #1e293b;border-radius:12px;padding:1.25rem;margin-bottom:1.5rem">
            <div style="font-size:0.8rem;color:#475569;margin-bottom:0.75rem">What you get with Family Plan:</div>
            <div style="font-size:0.85rem;color:#94a3b8;line-height:2">
              ✅ Appointment slot alerts<br/>
              ✅ Renewal reminders<br/>
              ✅ VIN Decoder & DMV tools<br/>
              ✅ Document Vault<br/>
              ✅ AI DMV Assistant
            </div>
          </div>
          <a href="${inviteLink}" style="display:block;text-align:center;padding:0.875rem 2rem;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:0.95rem;margin-bottom:1rem">
            Accept Invite & Create Account →
          </a>
          <p style="color:#475569;font-size:0.75rem;text-align:center">This invite expires in 7 days.</p>
        </div>
      `
    });

    res.json({ success: true, message: 'Invite sent to ' + email });
  } catch(err) {
    console.error('Invite error:', err);
    res.status(500).json({ error: 'Could not send invite: ' + err.message });
  }
});

// ─── POST accept invite ───────────────────────────────────────
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, email, password, name } = req.body;
    if (!token || !email || !password) return res.status(400).json({ error: 'Missing required fields' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const cleanEmail = email.toLowerCase().trim();

    // Find the invite
    const { data: invite } = await supabase
      .from('family_members')
      .select('*, owner_user_id')
      .eq('invite_token', token)
      .eq('email', cleanEmail)
      .single();

    if (!invite) return res.status(400).json({ error: 'Invalid or expired invite link' });
    if (new Date() > new Date(invite.invite_expiry)) return res.status(400).json({ error: 'Invite has expired — ask owner to resend' });

    // Get owner's plan to give member same plan
    const { data: owner } = await supabase
      .from('users').select('plan').eq('id', invite.owner_user_id).single();

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users').select('id').eq('email', cleanEmail).single();

    let userId;
    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create new user account
      const passwordHash = await bcrypt.hash(password, 12);
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([{
          name: name || invite.name,
          email: cleanEmail,
          password_hash: passwordHash,
          plan: owner ? owner.plan : 'family',
          email_verified: true,
          family_owner_id: invite.owner_user_id,
          created_at: new Date().toISOString()
        }])
        .select().single();

      if (createError) return res.status(500).json({ error: 'Could not create account: ' + createError.message });
      userId = newUser.id;
    }

    // Update invite status
    await supabase.from('family_members')
      .update({ 
        status: 'active', 
        invite_status: 'accepted',
        member_user_id: userId,
        invite_token: null
      })
      .eq('id', invite.id);

    // Generate login token
    const jwtToken = jwt.sign({ userId, email: cleanEmail }, process.env.JWT_SECRET, { expiresIn: '30d' });

    const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
    res.json({
      success: true,
      token: jwtToken,
      user: { id: userId, name: user.name, email: cleanEmail, plan: user.plan || 'family' }
    });

  } catch(err) {
    console.error('Accept invite error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ─── DELETE member ────────────────────────────────────────────
router.delete('/members/:id', auth, async (req, res) => {
  try {
    await supabase.from('family_members').delete()
      .eq('id', req.params.id).eq('owner_user_id', req.user.userId);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: 'Could not delete' }); }
});

module.exports = router;
