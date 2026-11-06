import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlitePath = process.env.SQLITE_PATH
  ? path.resolve(process.cwd(), process.env.SQLITE_PATH)
  : path.join(dataDir, 'mindquest.sqlite');

export const db = new Database(sqlitePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Optional PostgreSQL pool when DATABASE_URL is configured for cloud deployments
export const pgPool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : null;

export function uuid(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonthStr(): string {
  return new Date().toISOString().slice(0, 7);
}

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_key TEXT NOT NULL,
      UNIQUE(role_id, permission_key)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'learner' REFERENCES roles(id),
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      reset_token TEXT,
      reset_token_expires_at TEXT,
      two_factor_enabled INTEGER NOT NULL DEFAULT 0,
      two_factor_secret TEXT,
      age_bracket TEXT NOT NULL DEFAULT '18_plus',
      parent_email TEXT,
      parental_consent_verified INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      referral_code TEXT NOT NULL UNIQUE,
      referred_by_user_id TEXT REFERENCES users(id),
      preferred_locale TEXT NOT NULL DEFAULT 'en',
      preferred_currency TEXT NOT NULL DEFAULT 'USD',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);

    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      cefr_level TEXT NOT NULL DEFAULT 'B1',
      current_mood TEXT NOT NULL DEFAULT 'Curious',
      daily_goal_minutes INTEGER NOT NULL DEFAULT 20,
      xp INTEGER NOT NULL DEFAULT 0,
      streak_days INTEGER NOT NULL DEFAULT 0,
      last_activity_date TEXT,
      retention_score REAL NOT NULL DEFAULT 0,
      grammar_score REAL NOT NULL DEFAULT 0,
      speaking_score REAL NOT NULL DEFAULT 0,
      pronunciation_score REAL NOT NULL DEFAULT 0,
      reading_score REAL NOT NULL DEFAULT 0,
      personalized_plan_json TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS login_history (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      email_attempted TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      outcome TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      billing_interval TEXT NOT NULL,
      price_usd REAL NOT NULL DEFAULT 0,
      price_uzs INTEGER NOT NULL DEFAULT 0,
      annual_discount_pct INTEGER NOT NULL DEFAULT 20,
      trial_days INTEGER NOT NULL DEFAULT 0,
      daily_vocab_limit INTEGER NOT NULL DEFAULT 5,
      daily_story_limit INTEGER NOT NULL DEFAULT 1,
      daily_simulator_turns INTEGER NOT NULL DEFAULT 5,
      daily_detective_cases INTEGER NOT NULL DEFAULT 1,
      daily_ai_teacher_msgs INTEGER NOT NULL DEFAULT 0,
      monthly_voice_minutes INTEGER NOT NULL DEFAULT 0,
      monthly_ai_credits INTEGER NOT NULL DEFAULT 50,
      has_ai_teacher INTEGER NOT NULL DEFAULT 0,
      has_voice_mode INTEGER NOT NULL DEFAULT 0,
      has_advanced_analytics INTEGER NOT NULL DEFAULT 0,
      has_personalized_plan INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      plan_id TEXT NOT NULL REFERENCES plans(id),
      status TEXT NOT NULL DEFAULT 'active',
      provider TEXT NOT NULL DEFAULT 'internal',
      external_subscription_id TEXT,
      current_period_start TEXT NOT NULL,
      current_period_end TEXT NOT NULL,
      trial_ends_at TEXT,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      scheduled_downgrade_plan_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS promo_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      discount_percent INTEGER NOT NULL,
      max_uses INTEGER NOT NULL DEFAULT 100,
      used_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subscription_id TEXT REFERENCES subscriptions(id),
      plan_id TEXT NOT NULL REFERENCES plans(id),
      provider TEXT NOT NULL,
      provider_tx_id TEXT UNIQUE,
      idempotency_key TEXT NOT NULL UNIQUE,
      amount_usd REAL NOT NULL,
      amount_uzs INTEGER NOT NULL,
      currency TEXT NOT NULL,
      provider_fee_usd REAL NOT NULL DEFAULT 0,
      promo_code_id TEXT REFERENCES promo_codes(id),
      status TEXT NOT NULL DEFAULT 'pending',
      is_sandbox INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payment_id TEXT REFERENCES payments(id),
      plan_id TEXT NOT NULL,
      subtotal_usd REAL NOT NULL,
      discount_usd REAL NOT NULL DEFAULT 0,
      total_usd REAL NOT NULL,
      total_uzs INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'paid',
      is_sandbox INTEGER NOT NULL DEFAULT 0,
      issued_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refunds (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_usd REAL NOT NULL,
      reason TEXT NOT NULL,
      provider_refund_id TEXT,
      status TEXT NOT NULL DEFAULT 'succeeded',
      processed_by_admin_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'registered',
      reward_credits INTEGER NOT NULL DEFAULT 50,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rewards (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      credits_granted INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gift_subscriptions (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      purchaser_user_id TEXT NOT NULL REFERENCES users(id),
      recipient_email TEXT,
      redeemed_by_user_id TEXT REFERENCES users(id),
      plan_id TEXT NOT NULL REFERENCES plans(id),
      duration_days INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'available',
      created_at TEXT NOT NULL,
      redeemed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS team_licenses (
      id TEXT PRIMARY KEY,
      organization_name TEXT NOT NULL,
      owner_user_id TEXT NOT NULL REFERENCES users(id),
      plan_id TEXT NOT NULL REFERENCES plans(id),
      seat_limit INTEGER NOT NULL DEFAULT 10,
      seats_used INTEGER NOT NULL DEFAULT 1,
      invite_code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS affiliates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      affiliate_code TEXT NOT NULL UNIQUE,
      commission_rate_pct INTEGER NOT NULL DEFAULT 20,
      status TEXT NOT NULL DEFAULT 'pending',
      clicks_count INTEGER NOT NULL DEFAULT 0,
      conversions_count INTEGER NOT NULL DEFAULT 0,
      approved_commission_usd REAL NOT NULL DEFAULT 0,
      pending_commission_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credits (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      monthly_allowance INTEGER NOT NULL DEFAULT 50,
      monthly_used INTEGER NOT NULL DEFAULT 0,
      bonus_credits INTEGER NOT NULL DEFAULT 0,
      daily_vocab_used INTEGER NOT NULL DEFAULT 0,
      daily_story_used INTEGER NOT NULL DEFAULT 0,
      daily_simulator_used INTEGER NOT NULL DEFAULT 0,
      daily_detective_used INTEGER NOT NULL DEFAULT 0,
      daily_teacher_used INTEGER NOT NULL DEFAULT 0,
      monthly_voice_seconds_used INTEGER NOT NULL DEFAULT 0,
      last_daily_reset TEXT NOT NULL,
      last_monthly_reset TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      feature_mode TEXT NOT NULL,
      model_name TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      audio_seconds REAL NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      credits_charged INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_logs(user_id, created_at);

    CREATE TABLE IF NOT EXISTS vocabulary (
      id TEXT PRIMARY KEY,
      word TEXT NOT NULL,
      phonetic TEXT NOT NULL,
      part_of_speech TEXT NOT NULL,
      cefr_level TEXT NOT NULL,
      mood_tag TEXT NOT NULL,
      definition_en TEXT NOT NULL,
      translation_uz TEXT NOT NULL,
      translation_ru TEXT NOT NULL,
      example_en TEXT NOT NULL,
      example_uz TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_vocabulary (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vocabulary_id TEXT NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
      mastery_level INTEGER NOT NULL DEFAULT 1,
      used_in_simulator_count INTEGER NOT NULL DEFAULT 0,
      last_reviewed_at TEXT NOT NULL,
      UNIQUE(user_id, vocabulary_id)
    );

    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      mood_tag TEXT NOT NULL,
      cefr_level TEXT NOT NULL,
      content_en TEXT NOT NULL,
      summary_uz TEXT NOT NULL,
      vocabulary_json TEXT NOT NULL,
      questions_json TEXT NOT NULL,
      is_curated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      role_ai TEXT NOT NULL,
      role_user TEXT NOT NULL,
      cefr_level TEXT NOT NULL,
      setting_description TEXT NOT NULL,
      opening_line TEXT NOT NULL,
      objectives_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scenario_id TEXT NOT NULL REFERENCES scenarios(id),
      target_vocab_json TEXT NOT NULL,
      messages_json TEXT NOT NULL,
      grammar_score REAL,
      vocabulary_score REAL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS detective_cases (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      grammar_topic TEXT NOT NULL,
      cefr_level TEXT NOT NULL,
      premise TEXT NOT NULL,
      timeline_json TEXT NOT NULL,
      suspects_json TEXT NOT NULL,
      culprit_id TEXT NOT NULL,
      grammar_smoking_gun TEXT NOT NULL,
      explanation_en TEXT NOT NULL,
      explanation_uz TEXT NOT NULL,
      source_mistake_id TEXT,
      is_curated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES detective_cases(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      statement_with_clue TEXT NOT NULL,
      has_grammar_contradiction INTEGER NOT NULL DEFAULT 0,
      grammar_note TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mistakes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_mode TEXT NOT NULL,
      grammar_topic TEXT NOT NULL,
      original_text TEXT NOT NULL,
      corrected_text TEXT NOT NULL,
      explanation_en TEXT NOT NULL,
      explanation_uz TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      converted_case_id TEXT REFERENCES detective_cases(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_key TEXT NOT NULL,
      title TEXT NOT NULL,
      xp_awarded INTEGER NOT NULL DEFAULT 50,
      unlocked_at TEXT NOT NULL,
      UNIQUE(user_id, badge_key)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details_json TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_settings (
      key TEXT PRIMARY KEY,
      value_text TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      topic TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );
  `);

  seedInitialData();
}

function seedInitialData(): void {
  const now = nowIso();

  // 1. Seed RBAC Roles & Permissions
  const rolesCount = (db.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number }).c;
  if (rolesCount === 0) {
    const insertRole = db.prepare(
      'INSERT INTO roles (id, name, description, created_at) VALUES (?, ?, ?, ?)'
    );
    insertRole.run('learner', 'Learner', 'Standard registered English learner', now);
    insertRole.run('support', 'Support Specialist', 'Customer support and ticket resolution', now);
    insertRole.run('moderator', 'Content Moderator', 'Curriculum and content editor', now);
    insertRole.run('super_admin', 'Super Administrator', 'Full platform, billing, AI, and RBAC control', now);

    const insertPerm = db.prepare(
      'INSERT INTO permissions (id, role_id, permission_key) VALUES (?, ?, ?)'
    );
    const adminPerms = [
      'users.read',
      'users.manage',
      'plans.manage',
      'payments.refund',
      'ai.configure',
      'content.manage',
      'analytics.export',
      'affiliates.approve',
    ];
    for (const p of adminPerms) {
      insertPerm.run(uuid(), 'super_admin', p);
    }
    insertPerm.run(uuid(), 'moderator', 'content.manage');
    insertPerm.run(uuid(), 'support', 'users.read');
  }

  // 2. Seed Configurable Subscription Plans (FREE, BASIC, PREMIUM, PRO, YEARLY)
  const plansCount = (db.prepare('SELECT COUNT(*) as c FROM plans').get() as { c: number }).c;
  if (plansCount === 0) {
    const insertPlan = db.prepare(`
      INSERT INTO plans (
        id, name, tagline, billing_interval, price_usd, price_uzs, annual_discount_pct,
        trial_days, daily_vocab_limit, daily_story_limit, daily_simulator_turns,
        daily_detective_cases, daily_ai_teacher_msgs, monthly_voice_minutes,
        monthly_ai_credits, has_ai_teacher, has_voice_mode, has_advanced_analytics,
        has_personalized_plan, is_active, sort_order, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    insertPlan.run(
      'FREE',
      'Free Starter',
      'For exploring daily vocabulary and core modes',
      'month',
      0,
      0,
      0,
      0,
      6,
      1,
      4,
      1,
      2,
      0,
      40,
      0,
      0,
      0,
      0,
      1,
      now
    );
    insertPlan.run(
      'BASIC',
      'Basic Learner',
      'For consistent daily vocabulary, stories, and RPG practice',
      'month',
      9,
      115000,
      20,
      7,
      20,
      4,
      20,
      4,
      10,
      15,
      250,
      0,
      0,
      0,
      1,
      2,
      now
    );
    insertPlan.run(
      'PREMIUM',
      'Premium Fluency',
      'For rapid speaking fluency with AI Teacher, voice, and analytics',
      'month',
      19,
      245000,
      20,
      7,
      60,
      12,
      60,
      12,
      50,
      120,
      900,
      1,
      1,
      1,
      1,
      3,
      now
    );
    insertPlan.run(
      'PRO',
      'Pro Executive',
      'For IELTS/business mastery with highest limits and priority voice',
      'month',
      29,
      372000,
      25,
      7,
      200,
      30,
      200,
      30,
      200,
      400,
      2500,
      1,
      1,
      1,
      1,
      4,
      now
    );
    insertPlan.run(
      'YEARLY',
      'Annual Premium Pass',
      'Full Premium + Pro speaking toolkit billed annually (25% off)',
      'year',
      171,
      2195000,
      25,
      14,
      120,
      20,
      120,
      20,
      120,
      240,
      1500,
      1,
      1,
      1,
      1,
      5,
      now
    );
  }

  // 3. Seed AI Settings & Cost Guardrails
  const settingsCount = (db.prepare('SELECT COUNT(*) as c FROM ai_settings').get() as { c: number }).c;
  if (settingsCount === 0) {
    const insertSetting = db.prepare(
      'INSERT INTO ai_settings (key, value_text, updated_at) VALUES (?, ?, ?)'
    );
    insertSetting.run('text_model', process.env.AI_DEFAULT_TEXT_MODEL || 'gemini-3.8-flash', now);
    insertSetting.run('tts_model', process.env.AI_DEFAULT_TTS_MODEL || 'gemini-3.8-flash-lite-tts', now);
    insertSetting.run('transcribe_model', process.env.AI_DEFAULT_TRANSCRIBE_MODEL || 'gemini-3.5-transcribe', now);
    insertSetting.run('input_cost_per_1m_usd', '0.15', now);
    insertSetting.run('output_cost_per_1m_usd', '0.60', now);
    insertSetting.run('tts_cost_per_minute_usd', '0.015', now);
    insertSetting.run('global_daily_usd_cap', process.env.AI_GLOBAL_DAILY_USD_CAP || '50.00', now);
    insertSetting.run('usd_to_uzs_rate', process.env.DEFAULT_USD_TO_UZS_RATE || '12850', now);
    insertSetting.run('referral_reward_credits', '75', now);
    insertSetting.run(
      'teacher_system_prompt',
      'You are MindQuest AI Teacher, an encouraging, precise English linguist fluent in English, Uzbek, and Russian. Give concise grammar/pronunciation explanations with clear English examples and natural Uzbek translations. Never fabricate assessment scores.',
      now
    );
  }

  // 4. Seed Initial Promo Code
  const promoCount = (db.prepare('SELECT COUNT(*) as c FROM promo_codes').get() as { c: number }).c;
  if (promoCount === 0) {
    db.prepare(`
      INSERT INTO promo_codes (id, code, discount_percent, max_uses, used_count, expires_at, is_active, created_at)
      VALUES (?, ?, ?, ?, 0, ?, 1, ?)
    `).run(uuid(), 'WELCOME20', 20, 500, '2027-12-31T23:59:59.000Z', now);
  }

  // 5. Bootstrap Super Admin from env (never exposed to client)
  const adminExists = db
    .prepare("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1")
    .get() as { id: string } | undefined;
  if (!adminExists && process.env.SUPER_ADMIN_EMAIL && process.env.SUPER_ADMIN_INITIAL_PASSWORD) {
    const adminId = uuid();
    const hash = bcrypt.hashSync(process.env.SUPER_ADMIN_INITIAL_PASSWORD, 12);
    db.prepare(`
      INSERT INTO users (
        id, email, password_hash, full_name, role, email_verified,
        age_bracket, status, referral_code, preferred_locale, preferred_currency, created_at, updated_at
      ) VALUES (?, ?, ?, 'Platform Super Admin', 'super_admin', 1, '18_plus', 'active', ?, 'en', 'USD', ?, ?)
    `).run(adminId, process.env.SUPER_ADMIN_EMAIL.toLowerCase(), hash, 'MQADMIN01', now, now);

    db.prepare(`
      INSERT INTO profiles (user_id, cefr_level, current_mood, daily_goal_minutes, updated_at)
      VALUES (?, 'C1', 'Confident', 30, ?)
    `).run(adminId, now);

    const periodEnd = new Date(Date.now() + 365 * 86400 * 1000).toISOString();
    db.prepare(`
      INSERT INTO subscriptions (id, user_id, plan_id, status, provider, current_period_start, current_period_end, created_at, updated_at)
      VALUES (?, ?, 'PRO', 'active', 'internal', ?, ?, ?, ?)
    `).run(uuid(), adminId, now, periodEnd, now, now);

    db.prepare(`
      INSERT INTO credits (user_id, monthly_allowance, last_daily_reset, last_monthly_reset)
      VALUES (?, 2500, ?, ?)
    `).run(adminId, todayDateStr(), currentMonthStr());
  }

  // 6. Seed Emotion-Adaptive Mood Vocabulary (All 8 Moods with Uzbek & Russian translations)
  const vocabCount = (db.prepare('SELECT COUNT(*) as c FROM vocabulary').get() as { c: number }).c;
  if (vocabCount === 0) {
    const insertVocab = db.prepare(`
      INSERT INTO vocabulary (
        id, word, phonetic, part_of_speech, cefr_level, mood_tag,
        definition_en, translation_uz, translation_ru, example_en, example_uz, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedWords = [
      ['radiant', '/ˈreɪ.di.ənt/', 'adjective', 'B2', 'Happy', 'Shining brightly with joy or energy', 'nurli, quvonchga to‘la', 'сияющий, радостный', 'She gave a radiant smile after passing her speaking exam.', 'U suhbat imtihonidan o‘tgach, quvonchga to‘la tabassum qildi.'],
      ['exhilarated', '/ɪɡˈzɪl.ə.reɪ.tɪd/', 'adjective', 'C1', 'Happy', 'Feeling thrilled, animated, and deeply cheerful', 'ruhlangan, juda xursand', 'воодушевлённый', 'The team felt exhilarated when the international client approved the pitch.', 'Xalqaro mijoz loyihani tasdiqlaganida jamoa juda ruhlandi.'],
      ['cherish', '/ˈtʃer.ɪʃ/', 'verb', 'B2', 'Happy', 'To hold something dear and appreciate it deeply', 'qadrlamoq, ardoqlamoq', 'дорожить, ценить', 'We cherish quiet conversations over morning coffee.', 'Biz ertalabki qahva ustidagi samimiy suhbatlarni qadrlaymiz.'],
      ['solace', '/ˈsɒl.ɪs/', 'noun', 'C1', 'Sad', 'Comfort or consolation during a time of disappointment', 'taskin, yupanch', 'утешение', 'He found solace in reading classic travel stories.', 'U mumtoz sayohat hikoyalarini o‘qishdan taskin topdi.'],
      ['resilient', '/rɪˈzɪl.i.ənt/', 'adjective', 'B2', 'Sad', 'Able to recover steadily after setbacks', 'bardoshli, chidamli', 'стойкий, жизнестойкий', 'Even after a tough week, resilient learners keep moving forward.', 'Qiyin haftadan keyin ham bardoshli o‘quvchilar olg‘a intiladi.'],
      ['melancholy', '/ˈmel.əŋ.kɒl.i/', 'noun', 'C1', 'Sad', 'A gentle, thoughtful feeling of quiet sadness', 'ma’yuslik, o‘ychan g‘amginlik', 'меланхолия, грусть', 'Rainy autumn evenings sometimes bring a gentle melancholy.', 'Kuzning yomg‘irli oqshomlari ba’zan yengil ma’yuslik olib keladi.'],
      ['unwind', '/ʌnˈwaɪnd/', 'verb', 'B1', 'Tired', 'To rest and release tension after work or study', 'hordiq chiqarmoq, bo‘shashmoq', 'расслабиться, отдохнуть', 'I need twenty quiet minutes to unwind after my flight.', 'Parvozdan keyin hordiq chiqarish uchun menga yigirma daqiqa tinchlik kerak.'],
      ['replenish', '/rɪˈplen.ɪʃ/', 'verb', 'B2', 'Tired', 'To restore energy, supplies, or focus back to a full level', 'qayta to‘ldirmoq, tiklamoq', 'пополнить, восстановить', 'A short walk outdoors helps replenish mental focus.', 'Ochiq havoda qisqa sayr diqqatni tiklashga yordam beradi.'],
      ['lethargic', '/ləˈθɑː.dʒɪk/', 'adjective', 'C1', 'Tired', 'Having very little energy and feeling slow', 'holsiz, lanj', 'вялый, сонный', 'Skipping breakfast left him feeling lethargic during the seminar.', 'Nonushtani o‘tkazib yuborish uni seminarda holsiz qilib qo‘ydi.'],
      ['momentum', '/məˈmen.təm/', 'noun', 'B2', 'Motivated', 'Forward driving force gained through consistent action', 'sur’at, shiddat', 'импульс, темп', 'Completing three short lessons built strong momentum.', 'Uchta qisqa darsni yakunlash kuchli o‘sish sur’atini yaratdi.'],
      ['relentless', '/rɪˈlent.ləs/', 'adjective', 'C1', 'Motivated', 'Determined and persistent without giving up', 'tinimsiz, qat’iyatli', 'неустанный, упорный', 'Her relentless curiosity helped her master business negotiations.', 'Uning tinimsiz qiziquvchanligi biznes muzokaralarini egallashiga yordam berdi.'],
      ['milestone', '/ˈmaɪl.stəʊn/', 'noun', 'B2', 'Motivated', 'A significant stage or achievement in progress', 'muhim bosqich, marra', 'важный этап, веха', 'Holding a 15-minute English interview is a major milestone.', 'Ingliz tilida 15 daqiqalik suhbatdan o‘tish — muhim marra.'],
      ['serene', '/səˈriːn/', 'adjective', 'B2', 'Relaxed', 'Calm, peaceful, and untroubled', 'osuda, xotirjam', 'спокойный, безмятежный', 'The hotel courtyard was serene at sunrise.', 'Mehmonxona hovlisi quyosh chiqishida juda osuda edi.'],
      ['tranquil', '/ˈtræŋ.kwɪl/', 'adjective', 'B2', 'Relaxed', 'Free from commotion or disturbance', 'sokin, tinch', 'тихий, умиротворённый', 'They chose a tranquil table near the garden window.', 'Ular bog‘ derazasi yonidagi sokin stolni tanlashdi.'],
      ['leisurely', '/ˈleʒ.ə.li/', 'adverb', 'B2', 'Relaxed', 'Acting without hurry, in an unhurried manner', 'shoshilmasdan, bemalol', 'неспешно', 'We strolled leisurely through the historic university campus.', 'Biz tarixiy universitet hududi bo‘ylab shoshilmasdan sayr qildik.'],
      ['inquisitive', '/ɪnˈkwɪz.ə.tɪv/', 'adjective', 'C1', 'Curious', 'Eager to ask questions and understand how things work', 'qiziquvchan, sinchkov', 'любознательный', 'An inquisitive traveler learns local customs twice as fast.', 'Qiziquvchan sayohatchi mahalliy odatlarni ikki barobar tez o‘rganadi.'],
      ['unravel', '/ʌnˈræv.əl/', 'verb', 'C1', 'Curious', 'To investigate and solve a complicated puzzle or mystery', 'yechmoq, fosh etmoq', 'разгадать, распутать', 'Can you unravel the contradiction in the witness statement?', 'Guvoh ko‘rsatmasidagi ziddiyatni yecha olasizmi?'],
      ['itinerary', '/aɪˈtɪn.ər.ər.i/', 'noun', 'B2', 'Curious', 'A planned route or detailed schedule of a journey', 'sayohat yo‘nalishi, reja', 'маршрут поездки', 'Please double-check our flight itinerary before boarding.', 'Samolyotga chiqishdan oldin parvoz yo‘nalishimizni tekshirib ko‘ring.'],
      ['articulate', '/ɑːˈtɪk.jə.lət/', 'adjective', 'C1', 'Confident', 'Able to express thoughts clearly and persuasively', 'ravon so‘zlaydigan, aniq ifodalovchi', 'красноречивый, чёткий', 'She gave an articulate answer to the hiring manager.', 'U ishga qabul qiluvchi menejerga aniq va ravon javob berdi.'],
      ['negotiate', '/nɪˈɡəʊ.ʃi.eɪt/', 'verb', 'B2', 'Confident', 'To reach a formal agreement through professional discussion', 'muzokara olib bormoq, kelishmoq', 'вести переговоры', 'He learned how to negotiate project timelines politely.', 'U loyiha muddatlari bo‘yicha muloyim muzokara olib borishni o‘rgandi.'],
      ['poise', '/pɔɪz/', 'noun', 'C1', 'Confident', 'Calm self-assurance and graceful composure under attention', 'vazminlik, o‘ziga ishonch', 'самообладание, уверенность', 'He answered unexpected questions with remarkable poise.', 'U kutilmagan savollarga ajoyib vazminlik bilan javob berdi.'],
      ['prioritize', '/praɪˈɒr.ɪ.taɪz/', 'verb', 'B2', 'Stressed', 'To arrange tasks in order of real importance', 'ustuvorlik belgilamoq', 'расставлять приоритеты', 'When deadlines pile up, prioritize one clear action first.', 'Muddatlar ko‘payganda, avval bitta aniq vazifani ustuvor qilib oling.'],
      ['composure', '/kəmˈpəʊ.ʒər/', 'noun', 'C1', 'Stressed', 'The state of remaining calm and in control of oneself', 'og‘ir-bosiqlik, xotirjamlik', 'выдержка, спокойствие', 'Keeping composure at a busy airport gate makes rebooking easy.', 'Gavjum aeroportda xotirjamlikni saqlash chiptani almashtirishni osonlashtiradi.'],
      ['mitigate', '/ˈmɪt.ɪ.ɡeɪt/', 'verb', 'C1', 'Stressed', 'To make a problem or delay less severe', 'yumshatmoq, kamaytirmoq', 'смягчить, снизить риск', 'Clear communication helps mitigate misunderstandings in meetings.', 'Aniq muloqot yig‘ilishlardagi tushunmovchiliklarni kamaytiradi.'],
    ];

    for (const w of seedWords) {
      insertVocab.run(uuid(), w[0], w[1], w[2], w[3], w[4], w[5], w[6], w[7], w[8], w[9], now);
    }
  }

  // 7. Seed Curated Mood Stories
  const storiesCount = (db.prepare('SELECT COUNT(*) as c FROM stories').get() as { c: number }).c;
  if (storiesCount === 0) {
    const insertStory = db.prepare(`
      INSERT INTO stories (
        id, user_id, title, mood_tag, cefr_level, content_en, summary_uz,
        vocabulary_json, questions_json, is_curated, created_at
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    insertStory.run(
      uuid(),
      'The Missed Connection in Istanbul',
      'Stressed',
      'B2',
      `When Kamola landed in Istanbul, the departure board flashed red: her connecting flight to London had just closed its gates. Dozens of travelers began arguing loudly at the transfer desk, waving paper boarding passes in frustration.\n\nInstead of panicking, Kamola took a slow breath to keep her composure. She checked her digital itinerary, noticed an alternative evening flight with two open seats, and walked calmly to the airline agent. Rather than complaining, she prioritized clear, polite requests: "Good afternoon. My inbound flight was delayed by forty minutes. Could we mitigate the delay by moving my booking to flight TK-1987?"\n\nRelieved to speak with a calm passenger, the agent confirmed her seat in ninety seconds and even issued a lounge voucher so she could unwind before departure.`,
      `Kamola Istanbulda keyingi reysga kech qolganida vahimaga tushmasdan, xotirjamlik (composure) va aniq yo‘nalish rejasi (itinerary) orqali muammoni muloyimlik bilan hal qiladi.`,
      JSON.stringify([
        { word: 'composure', translation_uz: 'og‘ir-bosiqlik, xotirjamlik' },
        { word: 'itinerary', translation_uz: 'sayohat yo‘nalishi' },
        { word: 'prioritize', translation_uz: 'ustuvorlik belgilamoq' },
        { word: 'mitigate', translation_uz: 'yumshatmoq, kamaytirmoq' },
      ]),
      JSON.stringify([
        {
          question: 'How did Kamola persuade the transfer desk agent so quickly?',
          options: [
            'She demanded to speak with the airport supervisor immediately.',
            'She kept her composure and proposed a specific alternative flight politely.',
            'She purchased a brand-new ticket on her phone.',
          ],
          correctIndex: 1,
          explanation: 'Kamola stayed calm ("kept her composure") and proposed a concrete solution using flight TK-1987.',
        },
        {
          question: 'What does "mitigate the delay" mean in this context?',
          options: [
            'Make the impact of the delay smaller and less disruptive',
            'Cancel the entire international trip',
            'Ignore the departure schedule completely',
          ],
          correctIndex: 0,
          explanation: 'To mitigate means to make a problem or delay less severe.',
        },
      ]),
      now
    );

    insertStory.run(
      uuid(),
      'Lanterns Over Samarkand Tech Week',
      'Curious',
      'B2',
      `Aziz arrived early at the international startup forum, carrying an inquisitive notebook filled with questions for visiting engineers. Most attendees stayed near people they already knew, hesitant to start conversations in English.\n\nAziz decided to unravel how cross-border product teams collaborate across three time zones. Approaching a product architect from Singapore over tea, he asked thoughtful, open-ended questions rather than rehearsed textbook lines. Within ten minutes, their conversation gained natural momentum, leading to an invitation to join a remote design sprint next month.`,
      `Aziz xalqaro texnologiya forumida sinchkovlik (inquisitive) bilan savollar berib, yangi xalqaro hamkorlik imkoniyatini ochadi.`,
      JSON.stringify([
        { word: 'inquisitive', translation_uz: 'qiziquvchan, sinchkov' },
        { word: 'unravel', translation_uz: 'yechmoq, tushunib yetmoq' },
        { word: 'momentum', translation_uz: 'sur’at, rivoj' },
      ]),
      JSON.stringify([
        {
          question: 'What separated Aziz from most other forum attendees?',
          options: [
            'He only spoke with colleagues from his own office.',
            'He approached international guests with inquisitive, open-ended questions.',
            'He waited until the conference ended to send emails.',
          ],
          correctIndex: 1,
          explanation: 'His inquisitive approach started genuine dialogue.',
        },
      ]),
      now
    );
  }

  // 8. Seed All 9 Real-Life RPG Simulator Scenarios
  const scenariosCount = (db.prepare('SELECT COUNT(*) as c FROM scenarios').get() as { c: number }).c;
  if (scenariosCount === 0) {
    const insertScenario = db.prepare(`
      INSERT INTO scenarios (
        id, category, title, role_ai, role_user, cefr_level,
        setting_description, opening_line, objectives_json, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const allScenarios = [
      [
        'airport_transfer',
        'Airport',
        'International Airport Rebooking & Customs',
        'Senior Airline Gate Concierge (Claire)',
        'International Passenger with Delayed Inbound Flight',
        'B1',
        'Heathrow Terminal 5 transfer desk. Your first flight arrived 45 minutes late and your checked suitcase needs rerouting.',
        'Good afternoon! Welcome to the connections desk. May I see your boarding pass and hear how I can help with your onward journey today?',
        ['Explain why you missed the connection', 'Confirm checked baggage transfer', 'Request a window or aisle seat politely'],
      ],
      [
        'hotel_checkin',
        'Hotel',
        'Boutique Hotel Check-In & Room Upgrade',
        'Front Desk Manager (Marcus)',
        'Business Guest Arriving Early',
        'B1',
        'A quiet boutique hotel in Zurich at 10:30 AM. Standard check-in is 3:00 PM, and you have a video call in one hour.',
        'Good morning and welcome to Hotel Helvetia! Are you checking in with us today, and how was your trip into the city?',
        ['Ask if early check-in or a quiet workspace is available', 'Confirm breakfast hours and Wi-Fi access', 'Thank the manager naturally'],
      ],
      [
        'restaurant_dining',
        'Restaurant',
        'Client Dinner & Dietary Request',
        'Head Sommelier & Host (Elena)',
        'Host Ordering for International Guests',
        'B1',
        'An evening bistro in London where you are hosting a visiting partner who has a nut allergy.',
        'Good evening! Welcome to The Conservatory. Have you had a moment to look over tonight’s seasonal menu, or may I walk you through our specials?',
        ['Ask about ingredients and nut-free preparation', 'Order a main course and side dish clearly', 'Request the itemized bill politely at the end'],
      ],
      [
        'job_interview',
        'Job Interview',
        'Global Product & Engineering Interview',
        'Hiring Director (Hannah Chen)',
        'Shortlisted Candidate',
        'B2',
        'Final-round remote video interview for an international remote role based in Amsterdam.',
        'Thanks so much for joining today. To kick things off, could you tell me about a challenging project where priorities shifted suddenly and how you handled it?',
        ['Describe a concrete past challenge using past tenses accurately', 'Highlight measurable impact', 'Ask one thoughtful question about team culture'],
      ],
      [
        'university_seminar',
        'University',
        'Graduate Seminar & Advisor Office Hours',
        'Professor David Alverez',
        'International Scholarship Student',
        'B2',
        'University faculty office in Boston. You are proposing a narrower research topic before Friday’s deadline.',
        'Come on in! I read your initial abstract yesterday. Walk me through why you want to narrow your thesis scope and how you plan to gather data.',
        ['Explain your thesis focus clearly', 'Ask for a three-day feedback check-in', 'Summarize next steps accurately'],
      ],
      [
        'shopping_return',
        'Shopping',
        'Electronics Flagship Store Exchange',
        'Store Specialist (Liam)',
        'Customer Exchanging Faulty Headphones',
        'A2',
        'Downtown electronics store. The wireless headphones you bought yesterday disconnect every ten minutes.',
        'Hi there! How can I help you at the service counter today?',
        ['Describe the technical issue clearly', 'Present proof of purchase', 'Ask for an immediate replacement or refund'],
      ],
      [
        'travel_train',
        'Travel',
        'Cross-Border High-Speed Rail Inquiry',
        'Station Information Officer (Sophie)',
        'Independent Traveler',
        'B1',
        'Central railway station in Munich during a platform change announcement.',
        'Hello! Platform announcements just changed—where are you heading this afternoon?',
        ['Confirm the updated platform number', 'Verify whether seat reservations transfer automatically', 'Ask where the dining car is located'],
      ],
      [
        'business_negotiation',
        'Business',
        'SaaS Partnership & Timeline Negotiation',
        'VP of Partnerships (oliver Grant)',
        'Account Lead',
        'C1',
        'Executive quarterly planning call negotiating scope, delivery phases, and annual discount terms.',
        'Appreciate you preparing the proposal deck. Budget is tight this quarter—if we sign an annual agreement this week, how flexible can you be on rollout milestones?',
        ['Use conditional sentences accurately ("If we..., we can...")', 'Protect core pricing while offering phased onboarding', 'Confirm written summary steps'],
      ],
      [
        'everyday_neighbor',
        'Everyday',
        'Coffee Shop & Neighborhood Small Talk',
        'Friendly Local Architect (Maya)',
        'New Resident in the City',
        'A2',
        'A sunlit neighborhood roastery on Saturday morning while waiting for pour-over coffee.',
        'Morning! The weekend line is always lively here—have you tried their cardamom cold brew yet, or did you just move to the neighborhood?',
        ['Keep natural two-way small talk flowing', 'Share what brought you to the neighborhood', 'Ask for a local weekend recommendation'],
      ],
    ];

    for (const s of allScenarios) {
      insertScenario.run(s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], JSON.stringify(s[8]));
    }
  }

  // 9. Seed Validated Detective Mode Cases Across Grammar Topics
  const casesCount = (db.prepare('SELECT COUNT(*) as c FROM detective_cases').get() as { c: number }).c;
  if (casesCount === 0) {
    const insertCase = db.prepare(`
      INSERT INTO detective_cases (
        id, user_id, title, grammar_topic, cefr_level, premise,
        timeline_json, suspects_json, culprit_id, grammar_smoking_gun,
        explanation_en, explanation_uz, source_mistake_id, is_curated, created_at
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?)
    `);
    const insertEvidence = db.prepare(`
      INSERT INTO evidence (id, case_id, label, statement_with_clue, has_grammar_contradiction, grammar_note)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const case1Id = uuid();
    insertCase.run(
      case1Id,
      'The Vanishing Prototype at Gate B14',
      'tenses',
      'B2',
      'At 21:00 on Tuesday, an encrypted hardware prototype disappeared from the VIP conference room. Security badge logs froze at 20:45. One suspect’s tense usage betrays impossible knowledge of timeline sequence!',
      JSON.stringify([
        { time: '20:15', event: 'Lead Engineer locked the prototype inside the glass cabinet.' },
        { time: '20:45', event: 'Power flicker disabled corridor cameras for 15 minutes.' },
        { time: '21:05', event: 'Security discovered the cabinet unlocked—alarm had NOT sounded yet.' },
        { time: '21:20', event: 'Suspects were interviewed separately before any details were announced.' },
      ]),
      JSON.stringify([
        {
          id: 'suspect_victor',
          name: 'Victor Hale',
          occupation: 'Logistics Coordinator',
          alibi_time: '20:30 – 21:15',
          statement: 'By the time security knocked on my office door at 21:20, I had already packed the courier boxes for Wednesday.',
        },
        {
          id: 'suspect_nadia',
          name: 'Nadia Vance',
          occupation: 'External Auditor',
          alibi_time: '20:40 – 21:10',
          statement: 'When the lights flickered at 20:45, I have already returned the cabinet key since two hours, so I knew the prototype was gone.',
        },
        {
          id: 'suspect_marcus',
          name: 'Marcus Lin',
          occupation: 'Systems Analyst',
          alibi_time: '20:00 – 21:15',
          statement: 'At 20:45, I was reviewing server logs in the basement while my colleague was rebooting the backup router.',
        },
      ]),
      'suspect_nadia',
      'Nadia combines a finished past time anchor ("When the lights flickered at 20:45") with broken Present Perfect + "since two hours" ("I have already returned the cabinet key since two hours") AND reveals she already knew the prototype was gone at 20:45—twenty minutes before anyone discovered the theft!',
      'Past Perfect ("had returned") is required for an action completed before a specific past moment ("at 20:45"), and durations take "for two hours", never "since two hours". Furthermore, her timeline claim exposes impossible prior knowledge.',
      'Aniq o‘tgan zamon payti ("at 20:45") bilan Present Perfect ("have returned") emas, balki Past Perfect ("had returned") ishlatiladi va davomiylik uchun "for two hours" qo‘llanadi. Ustiga-ustak, u soat 20:45 dayoq prototip yo‘qligini bilganini fosh qilib qo‘ydi!',
      now
    );

    insertEvidence.run(
      uuid(),
      case1Id,
      'Exhibit A — Keycard Registry Note',
      'Transcript Line 14: "When the lights flickered at 20:45, I have already returned the cabinet key since two hours."',
      1,
      'Double grammar & logic contradiction: Present Perfect ("have returned") cannot pair with specific past time "at 20:45", and duration requires "for two hours", not "since".'
    );
    insertEvidence.run(
      uuid(),
      case1Id,
      'Exhibit B — Basement Server Log',
      'Transcript Line 22: "While Marcus was reviewing server logs, the router was rebooting."',
      0,
      'Grammatically sound Past Continuous parallel actions.'
    );
    insertEvidence.run(
      uuid(),
      case1Id,
      'Exhibit C — Dispatch Ledger',
      'Transcript Line 08: "By the time security knocked at 21:20, Victor had already packed the boxes."',
      0,
      'Accurate Past Perfect showing completion prior to 21:20.'
    );

    const case2Id = uuid();
    insertCase.run(
      case2Id,
      'The Forged Scholarship Endorsement',
      'conditionals',
      'B2',
      'An unauthorized approval letter was sent from the Dean’s terminal during lunch hour (13:00–13:45). Examine the suspects’ conditional statements and reported speech to uncover who fabricated their alibi.',
      JSON.stringify([
        { time: '12:55', event: 'Dean left for faculty lunch; office door remained ajar.' },
        { time: '13:18', event: 'Approval email dispatched from the desk terminal.' },
        { time: '13:50', event: 'IT flagged an irregular login session from inside the building.' },
      ]),
      JSON.stringify([
        {
          id: 'suspect_claire',
          name: 'Claire Benson',
          occupation: 'Admissions Fellow',
          alibi_time: '13:00 – 13:45',
          statement: 'If I had been in the library at 13:18, my badge would have triggered the reading room gate—and the gate log confirms my entry at 12:58.',
        },
        {
          id: 'suspect_devon',
          name: 'Devon Price',
          occupation: 'Registrar Assistant',
          alibi_time: '13:05 – 13:40',
          statement: 'If I would know the Dean’s terminal password yesterday, I will never enter his office today—besides, nobody saw me type the scholarship code!',
        },
        {
          id: 'suspect_sara',
          name: 'Sara Karimova',
          occupation: 'Lab Coordinator',
          alibi_time: '12:45 – 14:00',
          statement: 'If the network hadn’t alerted IT, nobody would have noticed the unauthorized email before Friday.',
        },
      ]),
      'suspect_devon',
      'Devon breaks conditional grammar ("If I would know... I will never enter") AND slips by mentioning "type the scholarship code", a detail never disclosed to staff!',
      'In English Second & Third Conditionals, "would" never belongs inside the "if"-clause ("If I knew..." or "If I had known..."). Devon also leaks confidential case evidence.',
      'Ingliz tilida shart ergash gaplarning "if" qismida "would" ishlatilmaydi ("If I knew" yoki "If I had known" bo‘lishi shart). Shuningdek, Devon hech kimga aytilmagan kod haqida gapirib qo‘ydi.',
      now
    );

    insertEvidence.run(
      uuid(),
      case2Id,
      'Exhibit A — Corridor Audio Snippet',
      '"If I would know the Dean’s password yesterday, I will never enter his office today!"',
      1,
      'Broken mixed conditional ("If I would know" instead of "If I had known") paired with premature knowledge of the scholarship code.'
    );
    insertEvidence.run(
      uuid(),
      case2Id,
      'Exhibit B — Library Gate Log',
      '"If I had been in the library at 13:18, my badge would have triggered the gate."',
      0,
      'Correct Third Conditional structure verified by hardware badge logs.'
    );

    const case3Id = uuid();
    insertCase.run(
      case3Id,
      'The Silent Gallery Auction Swap',
      'passive_voice',
      'B2',
      'During Friday evening’s charity auction, the authentic miniature painting was swapped with a replica between 19:00 and 19:30. Check passive voice and preposition clues across witness statements.',
      JSON.stringify([
        { time: '18:50', event: 'Curator inspected the original frame inside Vault 2.' },
        { time: '19:15', event: 'Display easel was wheeled onto the main stage.' },
        { time: '19:35', event: 'Buyer noticed fresh varnish on the replica.' },
      ]),
      JSON.stringify([
        {
          id: 'suspect_julian',
          name: 'Julian Mercer',
          occupation: 'Stage Lighting Tech',
          alibi_time: '19:00 – 19:30',
          statement: 'The main spotlights were calibrated by my assistant at 19:05 while I stayed at the sound booth.',
        },
        {
          id: 'suspect_helena',
          name: 'Helena Cross',
          occupation: 'Art Appraiser',
          alibi_time: '19:00 – 19:25',
          statement: 'The painting was been carried by nobody into Vault 2 at 19:12, because I hid the brass vault key under the velvet curtain!',
        },
        {
          id: 'suspect_timur',
          name: 'Timurbek Rakhimov',
          occupation: 'Event Photographer',
          alibi_time: '18:55 – 19:30',
          statement: 'Over forty photographs of the guests were taken in the foyer before the auction began.',
        },
      ]),
      'suspect_helena',
      'Helena uses malformed passive voice ("was been carried" instead of "was carried" / "had been carried") and confesses to hiding the brass vault key under the velvet curtain!',
      'Passive Simple Past uses "was/were + past participle" ("was carried"), never "was been + participle".',
      'Majhul nisbatning o‘tgan zamon shakli "was/were + V3" ("was carried") bo‘ladi, "was been carried" grammatik xato hisoblanadi.',
      now
    );

    insertEvidence.run(
      uuid(),
      case3Id,
      'Exhibit A — Appraiser Interview Note',
      '"The painting was been carried by nobody into Vault 2 at 19:12..."',
      1,
      'Invalid passive auxiliary combination ("was been carried") + direct admission regarding the hidden brass key.'
    );
    insertEvidence.run(
      uuid(),
      case3Id,
      'Exhibit B — Stage Booth Log',
      '"The main spotlights were calibrated by my assistant at 19:05."',
      0,
      'Valid Past Simple Passive ("were calibrated").'
    );
  }
}

export function logAudit(
  actorUserId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown>,
  ipAddress?: string
): void {
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuid(), actorUserId, action, entityType, entityId, JSON.stringify(details), ipAddress || '127.0.0.1', nowIso());
}

export function getAiSetting(key: string, fallback = ''): string {
  const row = db.prepare('SELECT value_text FROM ai_settings WHERE key = ?').get(key) as
    | { value_text: string }
    | undefined;
  return row ? row.value_text : fallback;
}
