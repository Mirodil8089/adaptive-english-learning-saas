-- ============================================================================
-- MINDQUEST AI — Production PostgreSQL Schema & Initial Migration (v1.0.0)
-- Target Engine: PostgreSQL 15+
-- Includes RBAC, Subscriptions, Multi-Provider Payments, AI Usage Ledger,
-- Mood Mode, Simulator RPG, Detective Cases, Unified Intelligence & Audit Logs
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ROLES & PERMISSIONS
CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id VARCHAR(64) PRIMARY KEY,
  role_id VARCHAR(32) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key VARCHAR(100) NOT NULL,
  UNIQUE(role_id, permission_key)
);

-- 2. USERS & PROFILES
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'learner' REFERENCES roles(id),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token VARCHAR(128),
  reset_token VARCHAR(128),
  reset_token_expires_at TIMESTAMPTZ,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  two_factor_secret VARCHAR(128),
  age_bracket VARCHAR(24) NOT NULL DEFAULT '18_plus', -- 'under_13', '13_17', '18_plus'
  parent_email VARCHAR(255),
  parental_consent_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(24) NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'deleted'
  referral_code VARCHAR(32) NOT NULL UNIQUE,
  referred_by_user_id UUID REFERENCES users(id),
  preferred_locale VARCHAR(8) NOT NULL DEFAULT 'en',
  preferred_currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);

CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cefr_level VARCHAR(8) NOT NULL DEFAULT 'B1', -- A1, A2, B1, B2, C1
  current_mood VARCHAR(32) DEFAULT 'Curious',
  daily_goal_minutes INTEGER NOT NULL DEFAULT 20,
  xp INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_activity_date DATE,
  retention_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  grammar_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  speaking_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  pronunciation_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  reading_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  personalized_plan_json JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. SESSIONS & LOGIN HISTORY
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  csrf_token VARCHAR(128) NOT NULL,
  ip_address VARCHAR(64),
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email_attempted VARCHAR(255) NOT NULL,
  ip_address VARCHAR(64),
  user_agent TEXT,
  outcome VARCHAR(32) NOT NULL, -- 'success', 'failed_password', 'suspended', '2fa_required'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id, created_at DESC);

-- 4. PLANS & SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS plans (
  id VARCHAR(32) PRIMARY KEY, -- 'FREE', 'BASIC', 'PREMIUM', 'PRO', 'YEARLY', 'TEAM'
  name VARCHAR(64) NOT NULL,
  tagline VARCHAR(180) NOT NULL,
  billing_interval VARCHAR(16) NOT NULL, -- 'month', 'year'
  price_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_uzs NUMERIC(14,0) NOT NULL DEFAULT 0,
  annual_discount_pct INTEGER NOT NULL DEFAULT 20,
  trial_days INTEGER NOT NULL DEFAULT 0,
  daily_vocab_limit INTEGER NOT NULL DEFAULT 5,
  daily_story_limit INTEGER NOT NULL DEFAULT 1,
  daily_simulator_turns INTEGER NOT NULL DEFAULT 5,
  daily_detective_cases INTEGER NOT NULL DEFAULT 1,
  daily_ai_teacher_msgs INTEGER NOT NULL DEFAULT 0,
  monthly_voice_minutes INTEGER NOT NULL DEFAULT 0,
  monthly_ai_credits INTEGER NOT NULL DEFAULT 50,
  has_ai_teacher BOOLEAN NOT NULL DEFAULT FALSE,
  has_voice_mode BOOLEAN NOT NULL DEFAULT FALSE,
  has_advanced_analytics BOOLEAN NOT NULL DEFAULT FALSE,
  has_personalized_plan BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan_id VARCHAR(32) NOT NULL REFERENCES plans(id),
  status VARCHAR(24) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','trialing','past_due','canceled','expired','pending','unpaid')),
  provider VARCHAR(24) NOT NULL DEFAULT 'internal', -- 'internal', 'stripe', 'payme', 'click', 'gift', 'team'
  external_subscription_id VARCHAR(128),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL,
  trial_ends_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  scheduled_downgrade_plan_id VARCHAR(32) REFERENCES plans(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status, plan_id);

-- 5. PAYMENTS, INVOICES, REFUNDS & PROMO / REFERRAL / AFFILIATE / GIFT
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL UNIQUE,
  discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
  max_uses INTEGER NOT NULL DEFAULT 100,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id),
  plan_id VARCHAR(32) NOT NULL REFERENCES plans(id),
  provider VARCHAR(24) NOT NULL, -- 'stripe', 'payme', 'click'
  provider_tx_id VARCHAR(128) UNIQUE,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  amount_usd NUMERIC(10,2) NOT NULL,
  amount_uzs NUMERIC(14,0) NOT NULL,
  currency VARCHAR(8) NOT NULL,
  provider_fee_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  promo_code_id UUID REFERENCES promo_codes(id),
  status VARCHAR(24) NOT NULL DEFAULT 'pending', -- 'pending', 'succeeded', 'failed', 'refunded', 'canceled'
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_user_status ON payments(user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(40) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id),
  plan_id VARCHAR(32) NOT NULL,
  subtotal_usd NUMERIC(10,2) NOT NULL,
  discount_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_usd NUMERIC(10,2) NOT NULL,
  total_uzs NUMERIC(14,0) NOT NULL,
  currency VARCHAR(8) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'paid', -- 'draft', 'open', 'paid', 'void', 'refunded'
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_usd NUMERIC(10,2) NOT NULL,
  reason TEXT NOT NULL,
  provider_refund_id VARCHAR(128),
  status VARCHAR(24) NOT NULL DEFAULT 'succeeded',
  processed_by_admin_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'registered', -- 'registered', 'converted', 'rewarded'
  reward_credits INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type VARCHAR(32) NOT NULL, -- 'referral', 'achievement', 'gift', 'admin_grant'
  credits_granted INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gift_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL UNIQUE,
  purchaser_user_id UUID NOT NULL REFERENCES users(id),
  recipient_email VARCHAR(255),
  redeemed_by_user_id UUID REFERENCES users(id),
  plan_id VARCHAR(32) NOT NULL REFERENCES plans(id),
  duration_days INTEGER NOT NULL DEFAULT 30,
  status VARCHAR(24) NOT NULL DEFAULT 'available', -- 'available', 'redeemed', 'expired'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redeemed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS team_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name VARCHAR(140) NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES users(id),
  plan_id VARCHAR(32) NOT NULL REFERENCES plans(id),
  seat_limit INTEGER NOT NULL DEFAULT 10,
  seats_used INTEGER NOT NULL DEFAULT 1,
  invite_code VARCHAR(40) NOT NULL UNIQUE,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  affiliate_code VARCHAR(40) NOT NULL UNIQUE,
  commission_rate_pct INTEGER NOT NULL DEFAULT 20,
  status VARCHAR(24) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  clicks_count INTEGER NOT NULL DEFAULT 0,
  conversions_count INTEGER NOT NULL DEFAULT 0,
  approved_commission_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  pending_commission_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. AI CREDITS, USAGE & COST TRACKING
CREATE TABLE IF NOT EXISTS credits (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  monthly_allowance INTEGER NOT NULL DEFAULT 50,
  monthly_used INTEGER NOT NULL DEFAULT 0,
  bonus_credits INTEGER NOT NULL DEFAULT 0,
  daily_vocab_used INTEGER NOT NULL DEFAULT 0,
  daily_story_used INTEGER NOT NULL DEFAULT 0,
  daily_simulator_used INTEGER NOT NULL DEFAULT 0,
  daily_detective_used INTEGER NOT NULL DEFAULT 0,
  daily_teacher_used INTEGER NOT NULL DEFAULT 0,
  monthly_voice_seconds_used INTEGER NOT NULL DEFAULT 0,
  last_daily_reset DATE NOT NULL DEFAULT CURRENT_DATE,
  last_monthly_reset VARCHAR(7) NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM')
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_mode VARCHAR(32) NOT NULL, -- 'mood_vocab','mood_story','simulator','detective','ai_teacher','tts','stt'
  model_name VARCHAR(64) NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  audio_seconds NUMERIC(8,2) NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  credits_charged INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(24) NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_date ON usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_mode ON usage_logs(feature_mode, created_at DESC);

-- 7. LEARNING CONTENT & UNIFIED INTELLIGENCE
CREATE TABLE IF NOT EXISTS vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word VARCHAR(80) NOT NULL,
  phonetic VARCHAR(80) NOT NULL,
  part_of_speech VARCHAR(32) NOT NULL,
  cefr_level VARCHAR(8) NOT NULL,
  mood_tag VARCHAR(32) NOT NULL,
  definition_en TEXT NOT NULL,
  translation_uz VARCHAR(180) NOT NULL,
  translation_ru VARCHAR(180) NOT NULL,
  example_en TEXT NOT NULL,
  example_uz TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vocabulary_mood_level ON vocabulary(mood_tag, cefr_level);

CREATE TABLE IF NOT EXISTS user_vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vocabulary_id UUID NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  mastery_level INTEGER NOT NULL DEFAULT 1 CHECK (mastery_level BETWEEN 0 AND 5),
  used_in_simulator_count INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, vocabulary_id)
);

CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(180) NOT NULL,
  mood_tag VARCHAR(32) NOT NULL,
  cefr_level VARCHAR(8) NOT NULL,
  content_en TEXT NOT NULL,
  summary_uz TEXT NOT NULL,
  vocabulary_json JSONB NOT NULL,
  questions_json JSONB NOT NULL,
  is_curated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scenarios (
  id VARCHAR(48) PRIMARY KEY,
  category VARCHAR(32) NOT NULL, -- airport, hotel, restaurant, interview, university, shopping, travel, business, everyday
  title VARCHAR(140) NOT NULL,
  role_ai VARCHAR(100) NOT NULL,
  role_user VARCHAR(100) NOT NULL,
  cefr_level VARCHAR(8) NOT NULL,
  setting_description TEXT NOT NULL,
  opening_line TEXT NOT NULL,
  objectives_json JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_id VARCHAR(48) NOT NULL REFERENCES scenarios(id),
  target_vocab_json JSONB NOT NULL,
  messages_json JSONB NOT NULL,
  grammar_score NUMERIC(5,2),
  vocabulary_score NUMERIC(5,2),
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detective_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(180) NOT NULL,
  grammar_topic VARCHAR(48) NOT NULL, -- tenses, articles, prepositions, pronouns, conditionals, passive_voice, reported_speech, modal_verbs, sentence_structure
  cefr_level VARCHAR(8) NOT NULL,
  premise TEXT NOT NULL,
  timeline_json JSONB NOT NULL,
  suspects_json JSONB NOT NULL,
  culprit_id VARCHAR(32) NOT NULL,
  grammar_smoking_gun TEXT NOT NULL,
  explanation_en TEXT NOT NULL,
  explanation_uz TEXT NOT NULL,
  source_mistake_id UUID,
  is_curated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES detective_cases(id) ON DELETE CASCADE,
  label VARCHAR(120) NOT NULL,
  statement_with_clue TEXT NOT NULL,
  has_grammar_contradiction BOOLEAN NOT NULL DEFAULT FALSE,
  grammar_note TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mistakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_mode VARCHAR(32) NOT NULL, -- 'simulator', 'detective', 'ai_teacher'
  grammar_topic VARCHAR(48) NOT NULL,
  original_text TEXT NOT NULL,
  corrected_text TEXT NOT NULL,
  explanation_en TEXT NOT NULL,
  explanation_uz TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  converted_case_id UUID REFERENCES detective_cases(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mistakes_user_resolved ON mistakes(user_id, resolved);

CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_key VARCHAR(64) NOT NULL,
  title VARCHAR(120) NOT NULL,
  xp_awarded INTEGER NOT NULL DEFAULT 50,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, badge_key)
);

-- 8. NOTIFICATIONS, AUDIT LOGS & AI ADMIN SETTINGS
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL, -- 'quota', 'billing', 'achievement', 'security', 'system'
  title VARCHAR(140) NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(48) NOT NULL,
  entity_id VARCHAR(128),
  details_json JSONB,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS ai_settings (
  key VARCHAR(64) PRIMARY KEY,
  value_text TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
