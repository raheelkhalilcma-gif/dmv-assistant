const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const sgMail = require('@sendgrid/mail');

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification email
async function sendVerificationEmail(email, name, code) {
  if (!process.env.SENDGRID_API_KEY) {
    console.log(`[DEV] Verification code for ${email}: ${code}`);
    return;
  }
  try {
    await sgMail.send({
      to: email,
      from: process.env.FROM_EMAIL || 'alerts@dmvassistants.com',
      subject: 'DMV Assistant — Your verification code',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px">
          <div style="background:#1d6ae5;padding:24px;border-radius:10px 10px 0 0;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:22px">🏛 DMV Assistant</h1>
          </div>
          <div style="background:#f8fafc;padding:28px;border:1px solid #e2e8f0;border-radius:0 0 10px 10px">
            <p style="font-size:15px;color:#1e293b;margin:0 0 12px">Hi ${name},</p>
            <p style="font-size:15px;color:#334155;margin:0 0 24px">Your verification code is:</p>
            <div style="background:#fff;border:2px solid #1d6ae5;border-radius:10px;padding:20px;text-align:center;margin:0 0 24px">
              <div style="font-size:40px;font-weight:900;letter-spacing:12px;color:#1d6ae5;font-family:monospace">${code}</div>
            </div>
            <p style="font-size:13px;color:#64748b;margin:0">This code expires in <strong>10 minutes</strong>. Never share it with anyone.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
            <p style="font-size:12px;color:#94a3b8;text-align:center;margin:0">DMV Assistant · dmvassistants.com · Not affiliated with any government DMV</p>
          </div>
        </div>
      `
    });
  } catch (err) {
    console.error('Email send error:', err.message);
  }
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password, state, isVeteran } = req.body;

    if (!firstName || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if email already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Email already registered. Please sign in.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    // Create user (unverified)
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        first_name: firstName,
        last_name: lastName || '',
        name: `${firstName} ${lastName || ''}`.trim(),
        email: email.toLowerCase(),
        password: hashedPassword,
        state: state || '',
        is_veteran: isVeteran || false,
        plan: 'free',
        verified: false,
        otp_code: otp,
        otp_expiry: otpExpiry,
      })
      .select()
      .single();

    if (error) {
      console.error('Signup DB error:', error.message);
      return res.status(500).json({ error: 'Signup failed — please try again' });
    }

    // Send verification email
    await sendVerificationEmail(email, firstName, otp);

    // Return token (but user is unverified — frontend will show verify screen)
    const token = jwt.sign(
      { userId: user.id, email: user.email, plan: 'free' },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        state: user.state,
        plan: 'free',
        verified: false,
        is_veteran: user.is_veteran,
      }
    });

  } catch (err) {
    console.error('Signup error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/verify
router.post('/verify', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code required' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Check OTP
    if (user.otp_code !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Check expiry
    if (user.otp_expiry && new Date() > new Date(user.otp_expiry)) {
      return res.status(400).json({ error: 'Code expired — request a new one' });
    }

    // Mark verified
    await supabase
      .from('users')
      .update({ verified: true, otp_code: null, otp_expiry: null })
      .eq('id', user.id);

    const token = jwt.sign(
      { userId: user.id, email: user.email, plan: user.plan || 'free' },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        state: user.state,
        plan: user.plan || 'free',
        verified: true,
        is_veteran: user.is_veteran,
      }
    });

  } catch (err) {
    console.error('Verify error:', err.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /api/auth/resend-code
router.post('/resend-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (!user) return res.status(400).json({ error: 'User not found' });

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabase
      .from('users')
      .update({ otp_code: otp, otp_expiry: otpExpiry })
      .eq('id', user.id);

    await sendVerificationEmail(email, user.first_name || 'User', otp);

    res.json({ success: true, message: 'New code sent' });

  } catch (err) {
    console.error('Resend error:', err.message);
    res.status(500).json({ error: 'Could not resend code' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Email not found. Please sign up first.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Wrong password. Try again.' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, plan: user.plan || 'free' },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        state: user.state,
        plan: user.plan || 'free',
        verified: user.verified || false,
        is_veteran: user.is_veteran,
      }
    });

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
