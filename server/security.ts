import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { currentMonthStr, db, nowIso, todayDateStr, uuid } from './db.ts';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: string;
  sessionId?: string;
  csrfToken?: string;
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

// Sliding-window in-memory rate limiter per IP + bucket
const rateBuckets = new Map<string, number[]>();

export function rateLimit(bucket: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
    const key = `${bucket}:${ip}`;
    const now = Date.now();
    const timestamps = (rateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (timestamps.length >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
        retryAfterSeconds: Math.ceil(windowMs / 1000),
      });
      return;
    }
    timestamps.push(now);
    rateBuckets.set(key, timestamps);
    next();
  };
}

// Synchronize subscription trial/period expiration and reset daily/monthly AI quotas automatically
export function syncUserEntitlementsAndQuotas(userId: string): void {
  const now = new Date();
  const nowStr = now.toISOString();
  const today = todayDateStr();
  const month = currentMonthStr();

  const sub = db
    .prepare('SELECT * FROM subscriptions WHERE user_id = ?')
    .get(userId) as Record<string, any> | undefined;

  if (sub) {
    // Check trial expiration
    if (sub.status === 'trialing' && sub.trial_ends_at && new Date(sub.trial_ends_at) < now) {
      db.prepare(`
        UPDATE subscriptions
        SET status = 'expired', plan_id = 'FREE', updated_at = ?
        WHERE id = ?
      `).run(nowStr, sub.id);
      db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, is_read, created_at)
        VALUES (?, ?, 'billing', 'Trial Period Ended', 'Your trial has ended and your account moved to the Free Starter plan. Upgrade anytime to restore full access.', 0, ?)
      `).run(uuid(), userId, nowStr);
    } else if (
      (sub.status === 'active' || sub.status === 'canceled') &&
      sub.plan_id !== 'FREE' &&
      new Date(sub.current_period_end) < now
    ) {
      if (sub.cancel_at_period_end || sub.scheduled_downgrade_plan_id) {
        const nextPlan = sub.scheduled_downgrade_plan_id || 'FREE';
        const nextStatus = nextPlan === 'FREE' ? 'active' : 'expired';
        db.prepare(`
          UPDATE subscriptions
          SET plan_id = ?, status = ?, cancel_at_period_end = 0, scheduled_downgrade_plan_id = NULL, updated_at = ?
          WHERE id = ?
        `).run(nextPlan, nextStatus, nowStr, sub.id);
      }
    }
  }

  const effectiveSub = db
    .prepare('SELECT plan_id, status FROM subscriptions WHERE user_id = ?')
    .get(userId) as { plan_id: string; status: string } | undefined;

  const activePlanId =
    effectiveSub && (effectiveSub.status === 'active' || effectiveSub.status === 'trialing')
      ? effectiveSub.plan_id
      : 'FREE';

  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(activePlanId) as Record<string, any>;
  const credits = db.prepare('SELECT * FROM credits WHERE user_id = ?').get(userId) as
    | Record<string, any>
    | undefined;

  if (!credits) {
    db.prepare(`
      INSERT INTO credits (user_id, monthly_allowance, last_daily_reset, last_monthly_reset)
      VALUES (?, ?, ?, ?)
    `).run(userId, plan?.monthly_ai_credits ?? 40, today, month);
    return;
  }

  if (credits.last_daily_reset !== today) {
    db.prepare(`
      UPDATE credits
      SET daily_vocab_used = 0,
          daily_story_used = 0,
          daily_simulator_used = 0,
          daily_detective_used = 0,
          daily_teacher_used = 0,
          last_daily_reset = ?
      WHERE user_id = ?
    `).run(today, userId);
  }

  if (credits.last_monthly_reset !== month) {
    db.prepare(`
      UPDATE credits
      SET monthly_used = 0,
          monthly_voice_seconds_used = 0,
          monthly_allowance = ?,
          last_monthly_reset = ?
      WHERE user_id = ?
    `).run(plan?.monthly_ai_credits ?? 40, month, userId);
  } else if (credits.monthly_allowance !== (plan?.monthly_ai_credits ?? 40)) {
    db.prepare('UPDATE credits SET monthly_allowance = ? WHERE user_id = ?').run(
      plan?.monthly_ai_credits ?? 40,
      userId
    );
  }
}

export function getHydratedUser(userId: string): Record<string, any> | null {
  syncUserEntitlementsAndQuotas(userId);
  const user = db
    .prepare(
      `SELECT id, email, full_name, role, email_verified, two_factor_enabled,
              age_bracket, parent_email, parental_consent_verified, status,
              referral_code, preferred_locale, preferred_currency, created_at
       FROM users WHERE id = ? AND status != 'deleted'`
    )
    .get(userId) as Record<string, any> | undefined;

  if (!user) return null;

  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  const subscription = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId) as Record<string, any>;

  // Never grant paid entitlements unless subscription status is strictly 'active' or 'trialing'
  const entitledPlanId =
    subscription && (subscription.status === 'active' || subscription.status === 'trialing')
      ? subscription.plan_id
      : 'FREE';

  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(entitledPlanId);
  const credits = db.prepare('SELECT * FROM credits WHERE user_id = ?').get(userId);

  return {
    ...user,
    profile,
    subscription,
    plan,
    credits,
  };
}

function extractRawToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieToken = (req as any).cookies?.mq_session;
  if (typeof cookieToken === 'string' && cookieToken.length > 10) {
    return cookieToken;
  }
  return null;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const rawToken = extractRawToken(req);
  if (!rawToken) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const tokenHash = sha256(rawToken);
  const session = db
    .prepare(
      `SELECT s.id, s.user_id, s.csrf_token, s.expires_at, u.role, u.status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as Record<string, any> | undefined;

  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
    return;
  }

  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }

  if (session.status !== 'active') {
    res.status(403).json({ error: 'Account is suspended or deactivated. Contact support.' });
    return;
  }

  // Verify CSRF token on state-changing requests when cookie auth is used without explicit Bearer token
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const headerCsrf = req.headers['x-csrf-token'];
  const usedBearer = Boolean(req.headers.authorization?.startsWith('Bearer '));
  if (mutating && !usedBearer && headerCsrf && headerCsrf !== session.csrf_token) {
    res.status(403).json({ error: 'CSRF token mismatch.' });
    return;
  }

  req.userId = session.user_id;
  req.userRole = session.role;
  req.sessionId = session.id;
  req.csrfToken = session.csrf_token;
  next();
}

export function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.userId || !req.userRole || !allowedRoles.includes(req.userRole)) {
      res.status(403).json({ error: 'Insufficient role permissions for this resource.' });
      return;
    }
    next();
  };
}

export function setSessionCookie(res: Response, rawToken: string): void {
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.APP_URL?.startsWith('https://'));
  res.cookie('mq_session', rawToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 14 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.APP_URL?.startsWith('https://'));
  res.clearCookie('mq_session', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  });
}

// Update daily streak and award XP based on genuine user learning activity
export function recordLearningProgress(
  userId: string,
  xpDelta: number,
  metricUpdates?: Partial<{
    retention_score: number;
    grammar_score: number;
    speaking_score: number;
    pronunciation_score: number;
    reading_score: number;
  }>
): void {
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId) as
    | Record<string, any>
    | undefined;
  if (!profile) return;

  const today = todayDateStr();
  const yesterday = new Date(Date.now() - 86400 * 1000).toISOString().slice(0, 10);

  let streak = profile.streak_days || 0;
  if (profile.last_activity_date === today) {
    // already counted today
  } else if (profile.last_activity_date === yesterday) {
    streak += 1;
  } else {
    streak = 1;
  }

  const blend = (current: number, incoming?: number) => {
    if (typeof incoming !== 'number') return current;
    if (!current || current === 0) return Math.round(incoming * 10) / 10;
    return Math.round((current * 0.65 + incoming * 0.35) * 10) / 10;
  };

  const newXp = (profile.xp || 0) + xpDelta;
  db.prepare(`
    UPDATE profiles
    SET xp = ?,
        streak_days = ?,
        last_activity_date = ?,
        retention_score = ?,
        grammar_score = ?,
        speaking_score = ?,
        pronunciation_score = ?,
        reading_score = ?,
        updated_at = ?
    WHERE user_id = ?
  `).run(
    newXp,
    streak,
    today,
    blend(profile.retention_score, metricUpdates?.retention_score),
    blend(profile.grammar_score, metricUpdates?.grammar_score),
    blend(profile.speaking_score, metricUpdates?.speaking_score),
    blend(profile.pronunciation_score, metricUpdates?.pronunciation_score),
    blend(profile.reading_score, metricUpdates?.reading_score),
    nowIso(),
    userId
  );

  // Unlock milestone achievements automatically
  if (newXp >= 100) {
    db.prepare(`
      INSERT OR IGNORE INTO achievements (id, user_id, badge_key, title, xp_awarded, unlocked_at)
      VALUES (?, ?, 'xp_100', 'First 100 XP Milestone', 25, ?)
    `).run(uuid(), userId, nowIso());
  }
  if (streak >= 3) {
    db.prepare(`
      INSERT OR IGNORE INTO achievements (id, user_id, badge_key, title, xp_awarded, unlocked_at)
      VALUES (?, ?, 'streak_3', '3-Day Consistency Streak', 40, ?)
    `).run(uuid(), userId, nowIso());
  }
}
