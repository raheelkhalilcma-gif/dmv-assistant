// backend/routes/auth.js — COMPLETE FIXED VERSION
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const sgMail = require('@sendgrid/mail');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function authMiddleware(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch(e) { res.status(401).json({ error: 'Invalid token' }); }
}

// In-memory OTP store (resets on restart - acceptable for MVP)
global._otpStore = global._otpStore || {};

// ── SIGNUP ─────────────────────────────────────────────────
// OTP is ONLY sent on signup, NOT on login
router.post('/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password, state, isVeteran } = req.body;
    if (!firstName || !email || !password)
      return res.status(400).json({ error: 'Name, email and password required' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const cleanEmail = email.toLowerCase().trim();

    // Check duplicate email
    const { data: existing } = await supabase
      .from('users').select('id').eq('email', cleanEmail).maybeSingle();
    if (existing)
      return res.status(400).json({ error: 'An account with this email already exists. Please sign in.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data: user, error: createErr } = await supabase.from('users').insert([{
      first_name: firstName,
      last_name: lastName || '',
      email: cleanEmail,
      password: passwordHash,
      state: state || null,
      is_veteran: isVeteran || false,
      plan: 'free',
      created_at: new Date().toISOString()
    }]).select().single();

    if (createErr) {
      if (createErr.message.toLowerCase().includes('duplicate') || createErr.message.toLowerCase().includes('unique'))
        return res.status(400).json({ error: 'An account with this email already exists. Please sign in.' });
      return res.status(500).json({ error: 'Could not create account: ' + createErr.message });
    }

    // Store OTP in memory
    global._otpStore[cleanEmail] = { otp, expiry: otpExpiry, userId: user.id };

    // Send verification email
    try {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      await sgMail.send({
        to: cleanEmail,
        from: { email: process.env.FROM_EMAIL || 'alerts@dmvassistants.com', name: 'DMV Assistant' },
        subject: 'Verify your DMV Assistant account',
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:2rem;background:#f8fafc;border-radius:12px">
          <h2 style="color:#0f172a">Verify your email</h2>
          <p style="color:#475569">Enter this code to complete your account setup:</p>
          <div style="text-align:center;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:2rem;margin:1.5rem 0">
            <div style="font-size:2.5rem;font-weight:900;letter-spacing:0.2em;color:#2563eb;font-family:monospace">${otp}</div>
            <div style="font-size:0.8rem;color:#64748b;margin-top:0.5rem">Expires in 10 minutes</div>
          </div>
          <p style="color:#94a3b8;font-size:0.75rem">If you didn't create this account, ignore this email.</p>
        </div>`
      });
    } catch(emailErr) {
      console.error('Email send error:', emailErr.message);
      // Don't fail signup if email fails - still return token
    }

    const token = jwt.sign({ userId: user.id, email: cleanEmail, pending: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({
      token,
      user: { id: user.id, email: cleanEmail, name: firstName, plan: 'free' }
    });
  } catch(err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ── LOGIN ── Direct login, NO OTP sent ─────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' });

    const cleanEmail = email.toLowerCase().trim();

    const { data: user } = await supabase
      .from('users').select('*').eq('email', cleanEmail).single();

    if (!user)
      return res.status(401).json({ error: 'No account found with this email' });

    // Support both 'password' and 'password_hash' column names
    const storedHash = user.password || user.password_hash;
    if (!storedHash)
      return res.status(401).json({ error: 'Account setup incomplete. Please reset your password.' });

    const valid = await bcrypt.compare(password, storedHash);
    if (!valid)
      return res.status(401).json({ error: 'Incorrect password — try again or reset it' });

    // Update last login
    await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', user.id);

    // NO OTP — return token directly
    const token = jwt.sign({ userId: user.id, email: cleanEmail }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({
      token,
      user: {
        id: user.id,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.name || 'User',
        first_name: user.first_name,
        last_name: user.last_name,
        email: cleanEmail,
        state: user.state,
        phone: user.phone,
        plan: user.plan || 'free',
        is_veteran: user.is_veteran
      }
    });
  } catch(err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── VERIFY OTP ─────────────────────────────────────────────
router.post('/verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    const cleanEmail = email?.toLowerCase().trim();
    const stored = global._otpStore[cleanEmail];

    if (!stored)
      return res.status(400).json({ error: 'No verification code found — request a new one' });
    if (new Date() > new Date(stored.expiry)) {
      delete global._otpStore[cleanEmail];
      return res.status(400).json({ error: 'Code expired — request a new one' });
    }
    if (stored.otp !== code.toString())
      return res.status(400).json({ error: 'Incorrect code — try again' });

    delete global._otpStore[cleanEmail];

    const { data: user } = await supabase.from('users').select('*').eq('id', stored.userId).single();
    const token = jwt.sign({ userId: user.id, email: cleanEmail }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: {
        id: user.id,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        first_name: user.first_name,
        last_name: user.last_name,
        email: cleanEmail,
        state: user.state,
        plan: user.plan || 'free',
        is_veteran: user.is_veteran
      }
    });
  } catch(err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── RESEND OTP ─────────────────────────────────────────────
router.post('/resend-code', async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = email?.toLowerCase().trim();
    const { data: user } = await supabase.from('users').select('id,first_name').eq('email', cleanEmail).single();
    if (!user) return res.status(404).json({ error: 'No account found' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    global._otpStore[cleanEmail] = {
      otp,
      expiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      userId: user.id
    };

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send({
      to: cleanEmail,
      from: { email: process.env.FROM_EMAIL || 'alerts@dmvassistants.com', name: 'DMV Assistant' },
      subject: 'Your new DMV Assistant verification code',
      html: `<div style="font-family:Arial;padding:2rem;background:#f8fafc;border-radius:12px;max-width:480px;margin:0 auto">
        <h2 style="color:#0f172a">New verification code</h2>
        <div style="text-align:center;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:2rem;margin:1.5rem 0">
          <div style="font-size:2.5rem;font-weight:900;letter-spacing:0.2em;color:#2563eb;font-family:monospace">${otp}</div>
          <div style="font-size:0.8rem;color:#64748b;margin-top:0.5rem">Expires in 10 minutes</div>
        </div>
      </div>`
    });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: 'Could not resend' }); }
});

// ── GET ME ─────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('*').eq('id', req.user.userId).single();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      user: {
        id: user.id, email: user.email, plan: user.plan || 'free',
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        first_name: user.first_name, last_name: user.last_name,
        state: user.state, phone: user.phone, is_veteran: user.is_veteran
      }
    });
  } catch(err) { res.status(500).json({ error: 'Server error' }); }
});

// ── UPDATE PROFILE ─────────────────────────────────────────
router.put('/update-profile', authMiddleware, async (req, res) => {
  try {
    const { firstName, lastName, phone, state, isVeteran } = req.body;
    const { error } = await supabase.from('users').update({
      first_name: firstName, last_name: lastName || '',
      phone: phone || null, state: state || null,
      is_veteran: isVeteran || false
    }).eq('id', req.user.userId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: 'Server error' }); }
});

// ── CHANGE PASSWORD ────────────────────────────────────────
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'Both passwords required' });
    if (newPassword.length < 8)
      return res.status(400).json({ error: 'New password must be at least 8 characters' });

    // Fetch user with both possible column names
    const { data: user, error: fetchErr } = await supabase
      .from('users')
      .select('id, password, password_hash')
      .eq('id', req.user.userId)
      .single();

    if (fetchErr || !user) {
      console.error('Change-pw fetch error:', fetchErr);
      return res.status(404).json({ error: 'User not found' });
    }

    const storedHash = user.password || user.password_hash;
    if (!storedHash)
      return res.status(400).json({ error: 'No password set on account. Use forgot password.' });

    const valid = await bcrypt.compare(currentPassword, storedHash);
    if (!valid)
      return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 12);

    // Update whichever column(s) exist
    const updateObj = {};
    if (user.password !== undefined) updateObj.password = newHash;
    if (user.password_hash !== undefined) updateObj.password_hash = newHash;

    const { error: updateErr } = await supabase
      .from('users')
      .update(updateObj)
      .eq('id', req.user.userId);

    if (updateErr) {
      console.error('Change-pw update error:', updateErr);
      return res.status(500).json({ error: 'Could not save new password: ' + updateErr.message });
    }

    console.log(`Password changed for user ${req.user.userId}`);
    res.json({ success: true, message: 'Password updated successfully' });
  } catch(err) {
    console.error('Change-pw error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ── FORGOT PASSWORD ────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const cleanEmail = email.toLowerCase().trim();

    const { data: user } = await supabase.from('users').select('id,first_name').eq('email', cleanEmail).maybeSingle();
    if (!user) return res.json({ success: true }); // Don't reveal if email exists

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await supabase.from('users').update({
      reset_token: resetToken,
      reset_token_expiry: expiry
    }).eq('id', user.id);

    const resetLink = `${process.env.FRONTEND_URL || 'https://dmvassistants.com'}?reset=${resetToken}&email=${encodeURIComponent(cleanEmail)}`;

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send({
      to: cleanEmail,
      from: { email: process.env.FROM_EMAIL || 'alerts@dmvassistants.com', name: 'DMV Assistant' },
      subject: 'Reset your DMV Assistant password',
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:2rem;background:#f8fafc;border-radius:12px">
        <h2 style="color:#0f172a">Reset your password</h2>
        <p style="color:#475569">Click below to set a new password. Link expires in 30 minutes.</p>
        <a href="${resetLink}" style="display:block;text-align:center;margin:1.5rem 0;padding:0.875rem 2rem;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:0.95rem">Reset Password →</a>
        <p style="color:#94a3b8;font-size:0.75rem">If you didn't request this, ignore this email.</p>
        <p style="color:#94a3b8;font-size:0.72rem;margin-top:1rem">Or copy: ${resetLink}</p>
      </div>`
    });

    res.json({ success: true });
  } catch(err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Could not send reset email' });
  }
});

// ── RESET PASSWORD ─────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword)
      return res.status(400).json({ error: 'Missing required fields' });
    if (newPassword.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const cleanEmail = email.toLowerCase().trim();
    const { data: user } = await supabase.from('users')
      .select('id,reset_token,reset_token_expiry')
      .eq('email', cleanEmail).single();

    if (!user || user.reset_token !== token)
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    if (new Date() > new Date(user.reset_token_expiry))
      return res.status(400).json({ error: 'Reset link expired. Please request a new one.' });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await supabase.from('users').update({
      password: passwordHash,
      password_hash: passwordHash,
      reset_token: null,
      reset_token_expiry: null
    }).eq('id', user.id);

    res.json({ success: true });
  } catch(err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
