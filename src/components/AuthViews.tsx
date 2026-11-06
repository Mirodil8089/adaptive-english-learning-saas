import React, { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, Lock, ShieldCheck, UserPlus } from 'lucide-react';
import { apiFetch, setAuthTokens } from '../api';
import { AuthUser, Currency, Locale } from '../types';

interface AuthViewsProps {
  initialView: 'login' | 'register' | 'forgot' | 'admin_login';
  locale: Locale;
  currency: Currency;
  onAuthenticated: (user: AuthUser, verificationPreviewToken?: string) => void;
  onBackToHome: () => void;
}

export const AuthViews: React.FC<AuthViewsProps> = ({
  initialView,
  locale,
  currency,
  onAuthenticated,
  onBackToHome,
}) => {
  const [view, setView] = useState<'login' | 'register' | 'forgot' | 'admin_login'>(initialView);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [cefrLevel, setCefrLevel] = useState('B1');
  const [ageBracket, setAgeBracket] = useState<'18_plus' | '13_17' | 'under_13'>('18_plus');
  const [parentEmail, setParentEmail] = useState('');
  const [parentalConsentConfirmed, setParentalConsentConfirmed] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);

  // Password Reset
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');

  // First-Run Super Admin Bootstrap status
  const [allowAdminBootstrap, setAllowAdminBootstrap] = useState(false);
  const [adminBootstrapMode, setAdminBootstrapMode] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setView(initialView);
    setError(null);
    setNotice(null);
  }, [initialView]);

  useEffect(() => {
    if (view === 'admin_login') {
      apiFetch<{ hasSuperAdmin: boolean; allowFirstRunBootstrap: boolean }>('/api/auth/admin-bootstrap-status')
        .then((res) => {
          setAllowAdminBootstrap(res.allowFirstRunBootstrap);
          if (res.allowFirstRunBootstrap) {
            setAdminBootstrapMode(true);
          }
        })
        .catch(() => {});
    }
  }, [view]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          fullName,
          cefrLevel,
          ageBracket,
          parentEmail: ageBracket !== '18_plus' ? parentEmail : undefined,
          parentalConsentConfirmed: ageBracket !== '18_plus' ? parentalConsentConfirmed : false,
          referralCode: referralCode.trim() || undefined,
          preferredLocale: locale,
          preferredCurrency: currency,
        }),
      });
      setAuthTokens(res.token, res.csrfToken);
      onAuthenticated(res.user, res.verificationPreviewToken);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent, requireAdmin = false) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          twoFactorCode: requiresTwoFactor ? twoFactorCode : undefined,
          requireAdmin,
        }),
      });
      if (res.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setNotice('Enter your 6-digit 2FA PIN to complete sign-in.');
        return;
      }
      setAuthTokens(res.token, res.csrfToken);
      onAuthenticated(res.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/admin-bootstrap', {
        method: 'POST',
        body: JSON.stringify({ email, password, fullName: fullName || 'Super Administrator' }),
      });
      setAuthTokens(res.token, res.csrfToken);
      onAuthenticated(res.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setResetStep('confirm');
      if (res.resetPreviewToken) {
        setResetToken(res.resetPreviewToken);
        setNotice(`Dev environment reset token generated: ${res.resetPreviewToken}`);
      } else {
        setNotice(res.message);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, resetToken, newPassword }),
      });
      setNotice('Password updated. You can now sign in with your new password.');
      setView('login');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto">
        <button
          type="button"
          onClick={onBackToHome}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-8 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to MindQuest AI</span>
        </button>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8">
          {view === 'admin_login' ? (
            <>
              <div className="mb-6">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Role-Based Access Control · Staff Only
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {adminBootstrapMode ? 'Provision Initial Super Admin' : 'Super Admin Console Login'}
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {adminBootstrapMode
                    ? 'No Super Admin exists in this local database yet. Create your initial administrator credentials (minimum 10-character password).'
                    : 'Enter authorized administrator, moderator, or support credentials.'}
                </p>
              </div>

              {allowAdminBootstrap && (
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg mb-6">
                  <button
                    type="button"
                    onClick={() => setAdminBootstrapMode(true)}
                    className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      adminBootstrapMode
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    First-Run Setup
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminBootstrapMode(false)}
                    className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      !adminBootstrapMode
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Existing Admin Sign In
                  </button>
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 mb-4" role="alert">
                  {error}
                </p>
              )}

              <form onSubmit={adminBootstrapMode ? handleAdminBootstrap : (e) => handleLogin(e, true)} className="space-y-4">
                {adminBootstrapMode && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Administrator Name
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Platform Operations Lead"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Work Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@organization.com"
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Password {adminBootstrapMode ? '(min 10 characters)' : ''}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={adminBootstrapMode ? 10 : 8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                {requiresTwoFactor && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      6-Digit 2FA PIN
                    </label>
                    <input
                      type="text"
                      required
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                    />
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {loading
                      ? 'Authenticating...'
                      : adminBootstrapMode
                      ? 'Create Super Admin & Open Console'
                      : 'Sign In to Admin Console'}
                  </span>
                </button>
              </form>
            </>
          ) : view === 'forgot' ? (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Reset Password
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Generate a time-limited recovery token to set a new password.
                </p>
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>}
              {notice && <p className="text-sm text-blue-600 dark:text-blue-400 mb-4 break-all">{notice}</p>}

              {resetStep === 'request' ? (
                <form onSubmit={handleRequestReset} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Account Email
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Send Reset Code
                  </button>
                </form>
              ) : (
                <form onSubmit={handleConfirmReset} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Recovery Token
                    </label>
                    <input
                      type="text"
                      required
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      New Password (minimum 8 characters)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Save New Password
                  </button>
                </form>
              )}

              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setView('login')}
                  className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Return to Sign In
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setView('login');
                    setError(null);
                  }}
                  className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    view === 'login'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setView('register');
                    setError(null);
                  }}
                  className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    view === 'register'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Create Account
                </button>
              </div>

              <div className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {view === 'login' ? 'Welcome back' : 'Create your learning profile'}
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {view === 'login'
                    ? 'Sign in to resume your adaptive vocabulary, simulator scenes, and grammar cases.'
                    : 'Registration is required to personalize your vocabulary bank, AI quotas, and speaking progress.'}
                </p>
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 mb-4" role="alert">
                  {error}
                </p>
              )}
              {notice && <p className="text-sm text-blue-600 dark:text-blue-400 mb-4">{notice}</p>}

              {view === 'login' ? (
                <form onSubmit={(e) => handleLogin(e, false)} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setView('forgot')}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  {requiresTwoFactor && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        6-Digit Two-Factor PIN
                      </label>
                      <input
                        type="text"
                        required
                        value={twoFactorCode}
                        onChange={(e) => setTwoFactorCode(e.target.value)}
                        placeholder="123456"
                        className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                      />
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Lock className="w-4 h-4" />
                    <span>{loading ? 'Signing in...' : 'Sign In'}</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      First Name or Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Malika Karimova"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Password (minimum 8 characters)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Starting English Level
                      </label>
                      <select
                        value={cefrLevel}
                        onChange={(e) => setCefrLevel(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                      >
                        <option value="A1">A1 — Beginner</option>
                        <option value="A2">A2 — Elementary</option>
                        <option value="B1">B1 — Intermediate</option>
                        <option value="B2">B2 — Upper-Int</option>
                        <option value="C1">C1 — Advanced</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Age Group
                      </label>
                      <select
                        value={ageBracket}
                        onChange={(e) => setAgeBracket(e.target.value as any)}
                        className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                      >
                        <option value="18_plus">18 or older</option>
                        <option value="13_17">13 – 17 years</option>
                        <option value="under_13">Under 13</option>
                      </select>
                    </div>
                  </div>

                  {ageBracket !== '18_plus' && (
                    <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Minor Privacy Protection: Parent or legal guardian consent is required for learners under 18.
                      </p>
                      <input
                        type="email"
                        required
                        value={parentEmail}
                        onChange={(e) => setParentEmail(e.target.value)}
                        placeholder="Parent or guardian email"
                        className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                      <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          required
                          checked={parentalConsentConfirmed}
                          onChange={(e) => setParentalConsentConfirmed(e.target.checked)}
                          className="mt-0.5"
                        />
                        <span>I confirm a parent or guardian approves this educational account and data policy.</span>
                      </label>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Referral Code (Optional — grants +25 bonus AI credits)
                    </label>
                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value)}
                      placeholder="e.g. MQ8F2A1C"
                      className="w-full px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{loading ? 'Creating account...' : 'Create Free Account'}</span>
                  </button>
                </form>
              )}

              <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Minimal personal data collected</span>
                <button
                  type="button"
                  onClick={() => setView('admin_login')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Staff Login</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
