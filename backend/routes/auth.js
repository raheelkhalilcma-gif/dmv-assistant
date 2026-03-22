const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const sgMail = require('@sendgrid/mail');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const otpStore = new Map();

async function sendOTP(email, name) {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(email.toLowerCase(), { code, expiry: Date.now() + 10*60*1000, attempts: 0, sentAt: Date.now() });
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  await sgMail.send({
    to: email,
    from: { email: process.env.FROM_EMAIL || 'alerts@dmvassistants.com', name: 'DMV Assistant' },
    subject: `${code} — Your DMV Assistant Verification Code`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:2rem;background:#07090f;color:#f1f5f9;border-radius:12px">
      <h2 style="color:#f1f5f9">Verify your email${name ? ', ' + name : ''}</h2>
      <div style="background:#111827;border-radius:12px;padding:1.5rem;text-align:center;margin:1rem 0">
        <div style="font-size:2.8rem;font-weight:900;letter-spacing:0.4em;color:#60a5fa;font-family:monospace">${code}</div>
        <div style="font-size:0.78rem;color:#475569;margin-top:0.5rem">Expires in 10 minutes</div>
      </div>
      <p style="color:#475569;font-size:0.75rem">If you did not request this, ignore this email.</p>
    </div>`
  });
  return code;
}

// ─── SIGNUP ────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password, state, isVeteran } = req.body;
    if (!firstName || !email || !password) return res.status(400).json({ error: 'First name, email, and password are required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const cleanEmail = email.toLowerCase().trim();
    const { data: existing } = await supabase.from('users').select('id').eq('email', cleanEmail).single();
    if (existing) return res.status(400).json({ error: 'Account already exists. Please sign in.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const name = `${firstName} ${lastName || ''}`.trim();
    const { data: user, error } = await supabase.from('users').insert([{
      name, email: cleanEmail, password_hash: passwordHash,
      state: state || null, is_veteran: isVeteran || false,
      plan: 'free', email_verified: false, created_at: new Date().toISOString()
    }]).select().single();
    if (error) return res.status(500).json({ error: 'Account creation failed' });
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    try { await sendOTP(cleanEmail, firstName); } catch(e) { console.error('OTP error:', e.message); }
    res.json({ requiresVerification: true, token, user: { id: user.id, name: user.name, email: user.email, plan: 'free', state: user.state } });
  } catch(err) { console.error('Signup error:', err); res.status(500).json({ error: 'Server error' }); }
});

// ─── LOGIN ─────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const cleanEmail = email.toLowerCase().trim();
    const { data: user, error } = await supabase.from('users').select('*').eq('email', cleanEmail).single();
    if (error || !user) return res.status(401).json({ error: 'No account found with this email' });
    const validPass = await bcrypt.compare(password, user.password_hash);
    if (!validPass) return res.status(401).json({ error: 'Incorrect password' });
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    try { await sendOTP(cleanEmail, user.name ? user.name.split(' ')[0] : ''); } catch(e) { console.error('Login OTP error:', e.message); }
    res.json({ requiresVerification: true, token, user: { id: user.id, name: user.name, email: user.email, plan: user.plan || 'free', state: user.state } });
  } catch(err) { console.error('Login error:', err); res.status(500).json({ error: 'Server error' }); }
});

// ─── VERIFY OTP ────────────────────────────────────────────
router.post('/verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code required' });
    const cleanEmail = email.toLowerCase().trim();
    const stored = otpStore.get(cleanEmail);
    if (!stored) return res.status(400).json({ error: 'No verification pending. Click Resend.' });
    if (Date.now() > stored.expiry) { otpStore.delete(cleanEmail); return res.status(400).json({ error: 'Code expired — click Resend' }); }
    if (stored.attempts >= 5) { otpStore.delete(cleanEmail); return res.status(400).json({ error: 'Too many attempts — request a new code' }); }
    if (stored.code !== code.toString().trim()) {
      stored.attempts += 1;
      return res.status(400).json({ error: `Wrong code — ${5-stored.attempts} attempts left` });
    }
    otpStore.delete(cleanEmail);
    const { data: user } = await supabase.from('users').update({ email_verified: true, last_login: new Date().toISOString() }).eq('email', cleanEmail).select().single();
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, plan: user.plan || 'free', state: user.state, isVeteran: user.is_veteran } });
  } catch(err) { console.error('Verify error:', err); res.status(500).json({ error: 'Server error' }); }
});

// ─── RESEND CODE ───────────────────────────────────────────
router.post('/resend-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const cleanEmail = email.toLowerCase().trim();
    const existing = otpStore.get(cleanEmail);
    if (existing && (Date.now() - existing.sentAt) < 60000) return res.status(429).json({ error: 'Wait 1 minute before requesting another code' });
    const { data: user } = await supabase.from('users').select('name').eq('email', cleanEmail).single();
    await sendOTP(cleanEmail, user ? user.name.split(' ')[0] : '');
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: 'Could not send — try again' }); }
});

// ─── FORGOT PASSWORD ───────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const cleanEmail = email.toLowerCase().trim();
    const { data: user } = await supabase.from('users').select('id,name').eq('email', cleanEmail).single();
    if (!user) return res.json({ success: true }); // Don't reveal if email exists
    
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 30*60*1000).toISOString(); // 30 min
    
    await supabase.from('users').update({ reset_token: resetToken, reset_token_expiry: expiry }).eq('id', user.id);
    
    const resetLink = `${process.env.FRONTEND_URL || 'https://dmv-assistant.vercel.app'}?reset=${resetToken}&email=${encodeURIComponent(cleanEmail)}`;
    
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send({
      to: cleanEmail,
      from: { email: process.env.FROM_EMAIL || 'alerts@dmvassistants.com', name: 'DMV Assistant' },
      subject: 'Reset your DMV Assistant password',
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:2rem;background:#07090f;color:#f1f5f9;border-radius:12px">
        <h2 style="color:#f1f5f9">Reset your password</h2>
        <p style="color:#94a3b8">Click the button below to set a new password. This link expires in 30 minutes.</p>
        <a href="${resetLink}" style="display:inline-block;margin:1.5rem 0;padding:0.875rem 2rem;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:0.95rem">Reset Password →</a>
        <p style="color:#475569;font-size:0.75rem">If you did not request this, ignore this email. Your password will not change.</p>
        <p style="color:#475569;font-size:0.72rem;margin-top:1rem">Or copy this link: ${resetLink}</p>
      </div>`
    });
    
    res.json({ success: true });
  } catch(err) { console.error('Forgot password error:', err); res.status(500).json({ error: 'Could not send reset email' }); }
});

// ─── RESET PASSWORD ────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) return res.status(400).json({ error: 'Missing required fields' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    
    const cleanEmail = email.toLowerCase().trim();
    const { data: user } = await supabase.from('users').select('id,reset_token,reset_token_expiry').eq('email', cleanEmail).single();
    
    if (!user) return res.status(400).json({ error: 'Invalid reset link' });
    if (user.reset_token !== token) return res.status(400).json({ error: 'Invalid or expired reset link' });
    if (!user.reset_token_expiry || new Date() > new Date(user.reset_token_expiry)) return res.status(400).json({ error: 'Reset link expired — request a new one' });
    
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await supabase.from('users').update({ password_hash: passwordHash, reset_token: null, reset_token_expiry: null }).eq('id', user.id);
    
    res.json({ success: true, message: 'Password reset successfully' });
  } catch(err) { console.error('Reset password error:', err); res.status(500).json({ error: 'Could not reset password' }); }
});

// ─── ME ────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data: user } = await supabase.from('users').select('id,name,email,plan,state,is_veteran').eq('id', decoded.userId).single();
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ user: { ...user, isVeteran: user.is_veteran } });
  } catch(err) { res.status(401).json({ error: 'Invalid token' }); }
});

module.exports = router;
