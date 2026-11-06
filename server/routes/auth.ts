import bcrypt from 'bcryptjs';
import { Router } from 'express';
import {
  currentMonthStr,
  db,
  getAiSetting,
  logAudit,
  nowIso,
  todayDateStr,
  uuid,
} from '../db.ts';
import {
  type AuthenticatedRequest,
  clearSessionCookie,
  generateSecureToken,
  getHydratedUser,
  rateLimit,
  requireAuth,
  setSessionCookie,
  sha256,
} from '../security.ts';

export const authRouter = Router();

function createSessionForUser(userId: string, ip: string, userAgent: string) {
  const rawToken = generateSecureToken(32);
  const csrfToken = generateSecureToken(24);
  const expiresAt = new Date(Date.now() + 14 * 86400 * 1000).toISOString();
  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, csrf_token, ip_address, user_agent, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuid(), userId, sha256(rawToken), csrfToken, ip, userAgent, expiresAt, nowIso());
  return { rawToken, csrfToken };
}

// POST /api/auth/register
authRouter.post('/register', rateLimit('auth_register', 12, 60_000), (req, res) => {
  const {
    email,
    password,
    fullName,
    ageBracket = '18_plus',
    parentEmail,
    parentalConsentConfirmed,
    referralCode,
    cefrLevel = 'B1',
    preferredLocale = 'en',
    preferredCurrency = 'USD',
  } = req.body || {};

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }
  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    res.status(400).json({ error: 'Please enter your name (minimum 2 characters).' });
    return;
  }

  // Age & Parental Consent Protections
  if (ageBracket === 'under_13' || ageBracket === '13_17') {
    if (!parentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail.trim()) || !parentalConsentConfirmed) {
      res.status(400).json({
        error: 'Learners under 18 require a valid parent/guardian email and confirmed parental consent.',
      });
      return;
    }
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  let referrerId: string | null = null;
  if (referralCode && typeof referralCode === 'string' && referralCode.trim()) {
    const refUser = db
      .prepare('SELECT id FROM users WHERE referral_code = ?')
      .get(referralCode.trim().toUpperCase()) as { id: string } | undefined;
    if (refUser) {
      referrerId = refUser.id;
    }
  }

  const userId = uuid();
  const now = nowIso();
  const passwordHash = bcrypt.hashSync(password, 12);
  const verificationToken = generateSecureToken(20);
  const myReferralCode = `MQ${generateSecureToken(4).toUpperCase()}`;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO users (
        id, email, password_hash, full_name, role, email_verified, verification_token,
        age_bracket, parent_email, parental_consent_verified, status, referral_code,
        referred_by_user_id, preferred_locale, preferred_currency, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'learner', 0, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      normalizedEmail,
      passwordHash,
      fullName.trim().slice(0, 100),
      verificationToken,
      ageBracket,
      parentEmail ? parentEmail.trim().toLowerCase() : null,
      parentalConsentConfirmed ? 1 : 0,
      myReferralCode,
      referrerId,
      ['en', 'uz', 'ru'].includes(preferredLocale) ? preferredLocale : 'en',
      ['USD', 'UZS'].includes(preferredCurrency) ? preferredCurrency : 'USD',
      now,
      now
    );

    db.prepare(`
      INSERT INTO profiles (user_id, cefr_level, current_mood, daily_goal_minutes, updated_at)
      VALUES (?, ?, 'Curious', 20, ?)
    `).run(userId, ['A1', 'A2', 'B1', 'B2', 'C1'].includes(cefrLevel) ? cefrLevel : 'B1', now);

    const periodEnd = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    db.prepare(`
      INSERT INTO subscriptions (
        id, user_id, plan_id, status, provider, current_period_start, current_period_end, created_at, updated_at
      ) VALUES (?, ?, 'FREE', 'active', 'internal', ?, ?, ?, ?)
    `).run(uuid(), userId, now, periodEnd, now, now);

    const freePlan = db.prepare("SELECT monthly_ai_credits FROM plans WHERE id = 'FREE'").get() as {
      monthly_ai_credits: number;
    };
    db.prepare(`
      INSERT INTO credits (user_id, monthly_allowance, bonus_credits, last_daily_reset, last_monthly_reset)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, freePlan?.monthly_ai_credits ?? 40, referrerId ? 25 : 0, todayDateStr(), currentMonthStr());

    if (referrerId) {
      const rewardCredits = parseInt(getAiSetting('referral_reward_credits', '75'), 10) || 75;
      db.prepare(`
        INSERT INTO referrals (id, referrer_user_id, referred_user_id, status, reward_credits, created_at)
        VALUES (?, ?, ?, 'rewarded', ?, ?)
      `).run(uuid(), referrerId, userId, rewardCredits, now);

      db.prepare('UPDATE credits SET bonus_credits = bonus_credits + ? WHERE user_id = ?').run(
        rewardCredits,
        referrerId
      );
      db.prepare(`
        INSERT INTO rewards (id, user_id, source_type, credits_granted, description, created_at)
        VALUES (?, ?, 'referral', ?, ?, ?)
      `).run(uuid(), referrerId, rewardCredits, `Referral bonus for inviting ${fullName.trim()}`, now);
    }

    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, is_read, created_at)
      VALUES (?, ?, 'system', 'Welcome to MINDQUEST AI', 'Verify your email in Profile & Security and choose your current mood to begin adaptive learning.', 0, ?)
    `).run(uuid(), userId, now);
  });

  tx();

  const ip = req.ip || '127.0.0.1';
  const ua = req.headers['user-agent'] || 'unknown';
  const { rawToken, csrfToken } = createSessionForUser(userId, ip, ua);
  setSessionCookie(res, rawToken);
  logAudit(userId, 'user.register', 'user', userId, { email: normalizedEmail, ageBracket }, ip);

  res.status(201).json({
    user: getHydratedUser(userId),
    token: rawToken,
    csrfToken,
    // Provided in sandbox/dev when external SMTP is not attached so users can complete real verification flow
    verificationPreviewToken: verificationToken,
  });
});

// POST /api/auth/verify-email
authRouter.post('/verify-email', requireAuth, (req: AuthenticatedRequest, res) => {
  const { token } = req.body || {};
  const row = db
    .prepare('SELECT verification_token, email_verified FROM users WHERE id = ?')
    .get(req.userId!) as { verification_token: string | null; email_verified: number } | undefined;

  if (!row) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  if (row.email_verified) {
    res.json({ verified: true, user: getHydratedUser(req.userId!) });
    return;
  }
  if (!token || token !== row.verification_token) {
    res.status(400).json({ error: 'Invalid verification token.' });
    return;
  }

  db.prepare(`
    UPDATE users SET email_verified = 1, verification_token = NULL, updated_at = ? WHERE id = ?
  `).run(nowIso(), req.userId!);

  logAudit(req.userId!, 'user.email_verified', 'user', req.userId!, {}, req.ip);
  res.json({ verified: true, user: getHydratedUser(req.userId!) });
});

// POST /api/auth/login
authRouter.post('/login', rateLimit('auth_login', 15, 60_000), (req, res) => {
  const { email, password, twoFactorCode, requireAdmin = false } = req.body || {};
  const ip = req.ip || '127.0.0.1';
  const ua = req.headers['user-agent'] || 'unknown';

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as
    | Record<string, any>
    | undefined;

  if (!userRow || userRow.status === 'deleted') {
    db.prepare(`
      INSERT INTO login_history (id, user_id, email_attempted, ip_address, user_agent, outcome, created_at)
      VALUES (?, NULL, ?, ?, ?, 'unknown_email', ?)
    `).run(uuid(), normalizedEmail, ip, ua, nowIso());
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (userRow.status === 'suspended') {
    db.prepare(`
      INSERT INTO login_history (id, user_id, email_attempted, ip_address, user_agent, outcome, created_at)
      VALUES (?, ?, ?, ?, ?, 'suspended', ?)
    `).run(uuid(), userRow.id, normalizedEmail, ip, ua, nowIso());
    res.status(403).json({ error: 'This account has been suspended by an administrator.' });
    return;
  }

  const passwordValid = bcrypt.compareSync(String(password), userRow.password_hash);
  if (!passwordValid) {
    db.prepare(`
      INSERT INTO login_history (id, user_id, email_attempted, ip_address, user_agent, outcome, created_at)
      VALUES (?, ?, ?, ?, ?, 'failed_password', ?)
    `).run(uuid(), userRow.id, normalizedEmail, ip, ua, nowIso());
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (requireAdmin && !['super_admin', 'moderator', 'support'].includes(userRow.role)) {
    res.status(403).json({ error: 'Admin portal requires an authorized staff role.' });
    return;
  }

  if (userRow.two_factor_enabled) {
    if (!twoFactorCode) {
      res.status(200).json({ requiresTwoFactor: true });
      return;
    }
    if (String(twoFactorCode).trim() !== userRow.two_factor_secret) {
      res.status(401).json({ error: 'Invalid two-factor authentication code.' });
      return;
    }
  }

  db.prepare(`
    INSERT INTO login_history (id, user_id, email_attempted, ip_address, user_agent, outcome, created_at)
    VALUES (?, ?, ?, ?, ?, 'success', ?)
  `).run(uuid(), userRow.id, normalizedEmail, ip, ua, nowIso());

  const { rawToken, csrfToken } = createSessionForUser(userRow.id, ip, ua);
  setSessionCookie(res, rawToken);
  logAudit(userRow.id, 'user.login', 'user', userRow.id, { requireAdmin }, ip);

  res.json({
    user: getHydratedUser(userRow.id),
    token: rawToken,
    csrfToken,
  });
});

// GET /api/auth/admin-bootstrap-status — checks if initial super_admin needs first-run claim
authRouter.get('/admin-bootstrap-status', (_req, res) => {
  const adminCount = (
    db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'super_admin' AND status = 'active'").get() as {
      c: number;
    }
  ).c;
  const allowFirstRunBootstrap = adminCount === 0 && process.env.NODE_ENV !== 'production';
  res.json({ hasSuperAdmin: adminCount > 0, allowFirstRunBootstrap });
});

// POST /api/auth/admin-bootstrap — one-time initial super_admin creation when zero admins exist in dev
authRouter.post('/admin-bootstrap', rateLimit('admin_bootstrap', 5, 60_000), (req, res) => {
  const adminCount = (
    db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'super_admin' AND status = 'active'").get() as {
      c: number;
    }
  ).c;
  if (adminCount > 0 || process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'Super Admin already provisioned. Sign in with existing admin credentials.' });
    return;
  }

  const { email, password, fullName } = req.body || {};
  if (!email || !password || String(password).length < 10) {
    res.status(400).json({ error: 'Valid email and password (minimum 10 characters) required for Super Admin.' });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail) as
    | { id: string }
    | undefined;

  const now = nowIso();
  let adminUserId: string;

  if (existing) {
    adminUserId = existing.id;
    db.prepare("UPDATE users SET role = 'super_admin', email_verified = 1, updated_at = ? WHERE id = ?").run(
      now,
      adminUserId
    );
  } else {
    adminUserId = uuid();
    const hash = bcrypt.hashSync(String(password), 12);
    db.prepare(`
      INSERT INTO users (
        id, email, password_hash, full_name, role, email_verified,
        age_bracket, status, referral_code, preferred_locale, preferred_currency, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'super_admin', 1, '18_plus', 'active', ?, 'en', 'USD', ?, ?)
    `).run(
      adminUserId,
      normalizedEmail,
      hash,
      (fullName || 'Super Administrator').trim(),
      `MQADM${generateSecureToken(3).toUpperCase()}`,
      now,
      now
    );

    db.prepare(`
      INSERT INTO profiles (user_id, cefr_level, current_mood, daily_goal_minutes, updated_at)
      VALUES (?, 'C1', 'Confident', 30, ?)
    `).run(adminUserId, now);

    db.prepare(`
      INSERT INTO subscriptions (id, user_id, plan_id, status, provider, current_period_start, current_period_end, created_at, updated_at)
      VALUES (?, ?, 'PRO', 'active', 'internal', ?, ?, ?, ?)
    `).run(uuid(), adminUserId, now, new Date(Date.now() + 365 * 86400 * 1000).toISOString(), now, now);

    db.prepare(`
      INSERT INTO credits (user_id, monthly_allowance, last_daily_reset, last_monthly_reset)
      VALUES (?, 2500, ?, ?)
    `).run(adminUserId, todayDateStr(), currentMonthStr());
  }

  const { rawToken, csrfToken } = createSessionForUser(adminUserId, req.ip || '127.0.0.1', req.headers['user-agent'] || '');
  setSessionCookie(res, rawToken);
  logAudit(adminUserId, 'admin.bootstrap', 'user', adminUserId, { email: normalizedEmail }, req.ip);

  res.status(201).json({
    user: getHydratedUser(adminUserId),
    token: rawToken,
    csrfToken,
  });
});

// POST /api/auth/forgot-password
authRouter.post('/forgot-password', rateLimit('auth_reset', 8, 60_000), (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }
  const user = db
    .prepare("SELECT id FROM users WHERE email = ? AND status = 'active'")
    .get(String(email).trim().toLowerCase()) as { id: string } | undefined;

  if (!user) {
    res.json({ message: 'If that email is registered, a password reset code has been generated.' });
    return;
  }

  const resetToken = generateSecureToken(16);
  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  db.prepare('UPDATE users SET reset_token = ?, reset_token_expires_at = ? WHERE id = ?').run(
    resetToken,
    expires,
    user.id
  );

  res.json({
    message: 'Password reset token generated (valid for 30 minutes).',
    resetPreviewToken: process.env.NODE_ENV !== 'production' ? resetToken : undefined,
  });
});

// POST /api/auth/reset-password
authRouter.post('/reset-password', rateLimit('auth_reset_confirm', 8, 60_000), (req, res) => {
  const { email, resetToken, newPassword } = req.body || {};
  if (!email || !resetToken || !newPassword || String(newPassword).length < 8) {
    res.status(400).json({ error: 'Email, valid reset token, and new password (8+ chars) are required.' });
    return;
  }

  const user = db
    .prepare('SELECT id, reset_token, reset_token_expires_at FROM users WHERE email = ?')
    .get(String(email).trim().toLowerCase()) as Record<string, any> | undefined;

  if (
    !user ||
    !user.reset_token ||
    user.reset_token !== String(resetToken).trim() ||
    new Date(user.reset_token_expires_at) < new Date()
  ) {
    res.status(400).json({ error: 'Invalid or expired reset token.' });
    return;
  }

  const hash = bcrypt.hashSync(String(newPassword), 12);
  db.prepare(`
    UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires_at = NULL, updated_at = ?
    WHERE id = ?
  `).run(hash, nowIso(), user.id);

  // Invalidate older sessions on password reset
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  logAudit(user.id, 'user.password_reset', 'user', user.id, {}, req.ip);
  res.json({ ok: true });
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = getHydratedUser(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json({ user, csrfToken: req.csrfToken });
});

// POST /api/auth/logout
authRouter.post('/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.sessionId) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(req.sessionId);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

// PATCH /api/auth/profile
authRouter.patch('/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const { fullName, cefrLevel, dailyGoalMinutes, preferredLocale, preferredCurrency, currentMood } = req.body || {};
  const now = nowIso();

  if (fullName || preferredLocale || preferredCurrency) {
    const existing = db.prepare('SELECT full_name, preferred_locale, preferred_currency FROM users WHERE id = ?').get(
      req.userId!
    ) as Record<string, any>;
    db.prepare(`
      UPDATE users
      SET full_name = ?, preferred_locale = ?, preferred_currency = ?, updated_at = ?
      WHERE id = ?
    `).run(
      fullName ? String(fullName).trim().slice(0, 100) : existing.full_name,
      ['en', 'uz', 'ru'].includes(preferredLocale) ? preferredLocale : existing.preferred_locale,
      ['USD', 'UZS'].includes(preferredCurrency) ? preferredCurrency : existing.preferred_currency,
      now,
      req.userId!
    );
  }

  const prof = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.userId!) as Record<string, any>;
  db.prepare(`
    UPDATE profiles
    SET cefr_level = ?,
        daily_goal_minutes = ?,
        current_mood = ?,
        updated_at = ?
    WHERE user_id = ?
  `).run(
    ['A1', 'A2', 'B1', 'B2', 'C1'].includes(cefrLevel) ? cefrLevel : prof.cefr_level,
    typeof dailyGoalMinutes === 'number' ? Math.min(180, Math.max(5, dailyGoalMinutes)) : prof.daily_goal_minutes,
    currentMood ? String(currentMood) : prof.current_mood,
    now,
    req.userId!
  );

  res.json({ user: getHydratedUser(req.userId!) });
});

// POST /api/auth/2fa/toggle
authRouter.post('/2fa/toggle', requireAuth, (req: AuthenticatedRequest, res) => {
  const { enable } = req.body || {};
  if (enable) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    db.prepare('UPDATE users SET two_factor_enabled = 1, two_factor_secret = ?, updated_at = ? WHERE id = ?').run(
      code,
      nowIso(),
      req.userId!
    );
    logAudit(req.userId!, 'user.2fa_enabled', 'user', req.userId!, {}, req.ip);
    res.json({ enabled: true, secretPin: code, user: getHydratedUser(req.userId!) });
  } else {
    db.prepare('UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL, updated_at = ? WHERE id = ?').run(
      nowIso(),
      req.userId!
    );
    logAudit(req.userId!, 'user.2fa_disabled', 'user', req.userId!, {}, req.ip);
    res.json({ enabled: false, user: getHydratedUser(req.userId!) });
  }
});

// GET /api/auth/security-activity
authRouter.get('/security-activity', requireAuth, (req: AuthenticatedRequest, res) => {
  const loginHistory = db
    .prepare('SELECT id, ip_address, user_agent, outcome, created_at FROM login_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 15')
    .all(req.userId!);

  const sessions = db
    .prepare('SELECT id, ip_address, user_agent, expires_at, created_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.userId!);

  const verificationRow = db
    .prepare('SELECT verification_token, email_verified FROM users WHERE id = ?')
    .get(req.userId!) as { verification_token: string | null; email_verified: number };

  res.json({
    loginHistory,
    sessions,
    currentSessionId: req.sessionId,
    verificationPreviewToken: !verificationRow.email_verified ? verificationRow.verification_token : null,
  });
});

// DELETE /api/auth/sessions/:id
authRouter.delete('/sessions/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(req.params.id, req.userId!);
  res.json({ ok: true });
});

// DELETE /api/auth/account — GDPR/Privacy right-to-erasure workflow
authRouter.delete('/account', requireAuth, (req: AuthenticatedRequest, res) => {
  const { confirmPassword } = req.body || {};
  const userRow = db.prepare('SELECT password_hash, email FROM users WHERE id = ?').get(req.userId!) as
    | { password_hash: string; email: string }
    | undefined;

  if (!userRow || !confirmPassword || !bcrypt.compareSync(String(confirmPassword), userRow.password_hash)) {
    res.status(400).json({ error: 'Please confirm your current password to permanently delete your account.' });
    return;
  }

  logAudit(req.userId!, 'user.account_deleted', 'user', req.userId!, { anonymized: true }, req.ip);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.userId!);
  clearSessionCookie(res);
  res.json({ deleted: true });
});

// POST /api/auth/contact — Public contact form
authRouter.post('/contact', rateLimit('public_contact', 6, 60_000), (req, res) => {
  const { fullName, email, topic, message } = req.body || {};
  if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email)) || !message || String(message).length < 10) {
    res.status(400).json({ error: 'Please provide your name, a valid email, and a message of at least 10 characters.' });
    return;
  }

  db.prepare(`
    INSERT INTO contact_messages (id, full_name, email, topic, message, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?)
  `).run(uuid(), String(fullName).trim(), String(email).trim().toLowerCase(), String(topic || 'General'), String(message).trim(), nowIso());

  res.status(201).json({ ok: true });
});
