-- ============================================
-- DMV ASSISTANT — DATABASE SCHEMA
-- File: database/schema.sql
-- 
-- HOW TO USE:
-- 1. Go to supabase.com → Your Project
-- 2. Click "SQL Editor" in left menu
-- 3. Paste this entire file
-- 4. Click "Run"
-- Done! All tables will be created.
-- ============================================

-- USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  state VARCHAR(50),
  is_veteran BOOLEAN DEFAULT FALSE,
  plan VARCHAR(20) DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'family')),
  subscription_id VARCHAR(255),
  plan_updated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ALERTS TABLE (DMV appointment monitoring)
CREATE TABLE IF NOT EXISTS alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  state VARCHAR(50) NOT NULL,
  office VARCHAR(255) NOT NULL,
  service_type VARCHAR(100) NOT NULL,
  preferred_date_from DATE,
  notify_via VARCHAR(20) DEFAULT 'email',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  last_checked TIMESTAMP WITH TIME ZONE,
  last_slot_found VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- REMINDERS TABLE (renewal reminders)
CREATE TABLE IF NOT EXISTS reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  expiry_date DATE NOT NULL,
  plate_or_id VARCHAR(100),
  vehicle_name VARCHAR(255),
  notify_via VARCHAR(20) DEFAULT 'email',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ALERT HISTORY TABLE (log of all alerts sent)
CREATE TABLE IF NOT EXISTS alert_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
  reminder_id UUID REFERENCES reminders(id) ON DELETE SET NULL,
  type VARCHAR(50) DEFAULT 'slot_found',
  days_left INTEGER,
  message TEXT,
  slot_date VARCHAR(255),
  office VARCHAR(255),
  service_type VARCHAR(100),
  channels VARCHAR(50),
  notified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- DOCUMENTS TABLE (document vault)
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  expiry_date DATE,
  status VARCHAR(20) DEFAULT 'valid',
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- FAMILY MEMBERS TABLE
CREATE TABLE IF NOT EXISTS family_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  member_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  relationship VARCHAR(50),
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'removed'))
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- Users can only see their own data
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own records
CREATE POLICY "Users own data" ON users
  FOR ALL USING (auth.uid()::text = id::text);

CREATE POLICY "Users own alerts" ON alerts
  FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users own reminders" ON reminders
  FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users own history" ON alert_history
  FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users own documents" ON documents
  FOR ALL USING (auth.uid()::text = user_id::text);

-- ============================================
-- SAMPLE DATA (for testing)
-- ============================================

-- Test user (password: test1234)
INSERT INTO users (first_name, last_name, email, password, state, plan)
VALUES ('John', 'Doe', 'demo@dmvassistants.com', 
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2SWQIVS3eC',
  'California', 'pro')
ON CONFLICT (email) DO NOTHING;

SELECT 'DMV Assistant database setup complete! ✅' AS status;
