import React, { useEffect, useState } from 'react';
import { CheckCircle2, Shield, Trash2 } from 'lucide-react';
import { apiFetch, setAuthTokens } from '../api';
import { AuthUser, Currency, Locale } from '../types';

interface ProfileSecurityViewProps {
  user: AuthUser;
  initialVerificationToken?: string;
  onUserUpdated: (u: AuthUser) => void;
  onAccountDeleted: () => void;
}

export const ProfileSecurityView: React.FC<ProfileSecurityViewProps> = ({
  user,
  initialVerificationToken,
  onUserUpdated,
  onAccountDeleted,
}) => {
  const [fullName, setFullName] = useState(user.full_name);
  const [cefrLevel, setCefrLevel] = useState(user.profile.cefr_level);
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(user.profile.daily_goal_minutes);
  const [preferredLocale, setPreferredLocale] = useState<Locale>(user.preferred_locale);
  const [preferredCurrency, setPreferredCurrency] = useState<Currency>(user.preferred_currency);

  const [verifyTokenInput, setVerifyTokenInput] = useState(initialVerificationToken || '');
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [securityActivity, setSecurityActivity] = useState<any>(null);
  const [deletePassword, setDeletePassword] = useState('');

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSecurityActivity = async () => {
    try {
      const res = await apiFetch('/api/auth/security-activity');
      setSecurityActivity(res);
      if (!verifyTokenInput && res.verificationPreviewToken) {
        setVerifyTokenInput(res.verificationPreviewToken);
      }
    } catch {}
  };

  useEffect(() => {
    loadSecurityActivity();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ user: AuthUser }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName,
          cefrLevel,
          dailyGoalMinutes,
          preferredLocale,
          preferredCurrency,
        }),
      });
      onUserUpdated(res.user);
      setNotice('Profile preferences saved.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ user: AuthUser }>('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: verifyTokenInput }),
      });
      onUserUpdated(res.user);
      setNotice('Email address verified!');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggle2FA = async () => {
    setError(null);
    try {
      const res = await apiFetch<{ enabled: boolean; secretPin?: string; user: AuthUser }>(
        '/api/auth/2fa/toggle',
        {
          method: 'POST',
          body: JSON.stringify({ enable: !user.two_factor_enabled }),
        }
      );
      onUserUpdated(res.user);
      if (res.enabled && res.secretPin) {
        setGeneratedPin(res.secretPin);
        setNotice(`Two-Factor Authentication enabled. Save your 6-digit PIN: ${res.secretPin}`);
      } else {
        setGeneratedPin(null);
        setNotice('Two-Factor Authentication disabled.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    await apiFetch(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' });
    loadSecurityActivity();
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/auth/account', {
        method: 'DELETE',
        body: JSON.stringify({ confirmPassword: deletePassword }),
      });
      setAuthTokens(null, null);
      onAccountDeleted();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <h1 className="text-2xl font-bold tracking-tight">Profile, Security & Privacy</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Manage your CEFR level, email verification, optional 2FA, active sessions, login history, and right-to-erasure controls.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-sm text-blue-800 dark:text-blue-200">
          {notice}
        </div>
      )}

      {/* Email Verification Card */}
      {!user.email_verified && (
        <form
          onSubmit={handleVerifyEmail}
          className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 space-y-3"
        >
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            Email Verification Pending · {user.email}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Confirm your email token below (pre-filled in local/sandbox preview when SMTP is unconfigured):
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              required
              value={verifyTokenInput}
              onChange={(e) => setVerifyTokenInput(e.target.value)}
              className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <button
              type="submit"
              className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              Verify Email
            </button>
          </div>
        </form>
      )}

      {/* Profile Preferences */}
      <form
        onSubmit={handleSaveProfile}
        className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Learning Profile & Localization</h2>
          {user.email_verified ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Email Verified
            </span>
          ) : null}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Target CEFR Level</label>
            <select
              value={cefrLevel}
              onChange={(e) => setCefrLevel(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="A1">A1 — Beginner</option>
              <option value="A2">A2 — Elementary</option>
              <option value="B1">B1 — Intermediate</option>
              <option value="B2">B2 — Upper-Intermediate</option>
              <option value="C1">C1 — Advanced</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Daily Study Goal (Minutes)</label>
            <input
              type="number"
              min={5}
              max={180}
              value={dailyGoalMinutes}
              onChange={(e) => setDailyGoalMinutes(Number(e.target.value))}
              className="w-full px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Interface Language</label>
              <select
                value={preferredLocale}
                onChange={(e) => setPreferredLocale(e.target.value as Locale)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="en">English</option>
                <option value="uz">O‘zbekcha</option>
                <option value="ru">Русский</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Display Currency</label>
              <select
                value={preferredCurrency}
                onChange={(e) => setPreferredCurrency(e.target.value as Currency)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="USD">USD ($)</option>
                <option value="UZS">UZS (so‘m)</option>
              </select>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="py-2 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
        >
          Save Preferences
        </button>
      </form>

      {/* Optional 2FA */}
      <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            <h2 className="text-base font-bold">Two-Factor Authentication (Optional 2FA)</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Protect your account with an extra 6-digit verification PIN during sign-in.
          </p>
          {generatedPin && (
            <p className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 mt-2">
              Your Active 2FA PIN: {generatedPin}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleToggle2FA}
          className="py-2 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
        >
          {user.two_factor_enabled ? 'Disable 2FA' : 'Enable 2FA'}
        </button>
      </div>

      {/* Active Sessions & Login History */}
      {securityActivity && (
        <div className="grid md:grid-cols-2 gap-5">
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-bold">Active Sessions</h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {securityActivity.sessions?.map((s: any) => (
                <div key={s.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-mono">{s.ip_address}</p>
                    <p className="text-slate-500 truncate max-w-[200px]">{s.user_agent}</p>
                  </div>
                  {s.id === securityActivity.currentSessionId ? (
                    <span className="text-emerald-600 font-semibold">Current</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRevokeSession(s.id)}
                      className="text-red-600 hover:underline cursor-pointer"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-bold">Recent Login History</h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
              {securityActivity.loginHistory?.slice(0, 6).map((h: any) => (
                <div key={h.id} className="py-2 flex items-center justify-between">
                  <span>{h.outcome}</span>
                  <span className="text-slate-500">{new Date(h.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Permanent Account Deletion */}
      <form
        onSubmit={handleDeleteAccount}
        className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 space-y-3"
      >
        <h2 className="text-base font-bold text-red-600 dark:text-red-400">Delete Account & Personal Data</h2>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Permanently erases your profile, active sessions, saved vocabulary, and conversation history. Enter your current password to confirm.
        </p>
        <div className="flex flex-wrap gap-3">
          <input
            type="password"
            required
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            placeholder="Current password"
            className="px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          />
          <button
            type="submit"
            className="py-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Permanently Delete Account</span>
          </button>
        </div>
      </form>
    </div>
  );
};
