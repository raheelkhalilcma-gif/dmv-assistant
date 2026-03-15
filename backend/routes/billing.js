// ============================================
// BILLING ROUTES — Lemon Squeezy
// File: backend/routes/billing.js
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

// POST /api/billing/checkout — Create Lemon Squeezy checkout
router.post('/checkout', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body; // 'pro' or 'family'

    const variantId = plan === 'family'
      ? process.env.LS_FAMILY_VARIANT_ID
      : process.env.LS_PRO_VARIANT_ID;

    // Get user info
    const { data: user } = await supabase
      .from('users')
      .select('email, first_name, is_veteran')
      .eq('id', req.user.userId)
      .single();

    // Create Lemon Squeezy checkout
    const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
        'Content-Type': 'application/vnd.api+json',
        'Accept': 'application/vnd.api+json'
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {
              email: user.email,
              name: user.first_name,
              custom: { user_id: req.user.userId }
            },
            // If veteran — apply 50% discount code automatically
            discount_code: user.is_veteran ? 'VET50' : undefined
          },
          relationships: {
            store: {
              data: { type: 'stores', id: process.env.LS_STORE_ID }
            },
            variant: {
              data: { type: 'variants', id: variantId }
            }
          }
        }
      })
    });

    const checkout = await response.json();
    const checkoutUrl = checkout.data?.attributes?.url;

    if (!checkoutUrl) throw new Error('Failed to create checkout');

    res.json({ checkoutUrl });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/billing/webhook — Lemon Squeezy webhook
// This runs automatically when someone pays!
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const event = JSON.parse(req.body);
    const eventName = event.meta?.event_name;
    const userId = event.meta?.custom_data?.user_id;
    const variantId = event.data?.attributes?.variant_id;

    console.log(`💳 Lemon Squeezy event: ${eventName} for user ${userId}`);

    if (eventName === 'subscription_created' || eventName === 'subscription_updated') {
      // Determine plan from variant ID
      const plan = variantId == process.env.LS_FAMILY_VARIANT_ID ? 'family' : 'pro';

      // Update user's plan in database
      await supabase
        .from('users')
        .update({
          plan,
          subscription_id: event.data?.id,
          plan_updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      console.log(`✅ User ${userId} upgraded to ${plan}`);
    }

    if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
      // Downgrade to free
      await supabase
        .from('users')
        .update({ plan: 'free' })
        .eq('id', userId);

      console.log(`📉 User ${userId} downgraded to free`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
