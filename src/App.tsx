import { useEffect, useState } from 'react';
import { apiFetch, getStoredToken, setAuthTokens } from './api';
import { AuthViews } from './components/AuthViews';
import { PublicWebsite } from './components/PublicWebsite';
import { WorkspaceDashboard, WorkspaceTab } from './components/WorkspaceDashboard';
import { AuthUser, Currency, Locale, Plan, ProviderStatusMap } from './types';

type RootScreen = 'public' | 'auth' | 'workspace';

export default function App() {
  const [screen, setScreen] = useState<RootScreen>('public');
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot' | 'admin_login'>('login');
  const [workspaceInitialTab, setWorkspaceInitialTab] = useState<WorkspaceTab>('overview');
  const [verificationPreviewToken, setVerificationPreviewToken] = useState<string | undefined>();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [providers, setProviders] = useState<ProviderStatusMap | null>(null);

  const [locale, setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem('mq_locale');
    return saved === 'uz' || saved === 'ru' ? saved : 'en';
  });

  const [currency, setCurrency] = useState<Currency>(() => {
    const saved = localStorage.getItem('mq_currency');
    return saved === 'UZS' ? 'UZS' : 'USD';
  });

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('mq_theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('mq_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('mq_theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('mq_locale', locale);
  }, [locale]);

  useEffect(() => {
    localStorage.setItem('mq_currency', currency);
  }, [currency]);

  // Load public plans & check active session on boot
  useEffect(() => {
    apiFetch<{ plans: Plan[]; providers: ProviderStatusMap }>('/api/billing/plans')
      .then((res) => {
        setPlans(res.plans);
        setProviders(res.providers);
      })
      .catch(() => {});

    if (window.location.pathname === '/admin') {
      setAuthMode('admin_login');
      setScreen('auth');
    }

    const token = getStoredToken();
    if (token) {
      apiFetch<{ user: AuthUser; csrfToken?: string }>('/api/auth/me')
        .then((res) => {
          setUser(res.user);
          if (res.csrfToken) {
            setAuthTokens(token, res.csrfToken);
          }
          setLocale(res.user.preferred_locale || 'en');
          setCurrency(res.user.preferred_currency || 'USD');
          setScreen('workspace');
        })
        .catch(() => {
          setAuthTokens(null, null);
        });
    }
  }, []);

  if (screen === 'auth') {
    return (
      <AuthViews
        initialView={authMode}
        locale={locale}
        currency={currency}
        onBackToHome={() => setScreen('public')}
        onAuthenticated={(authedUser, previewVerifyToken) => {
          setUser(authedUser);
          setVerificationPreviewToken(previewVerifyToken);
          setLocale(authedUser.preferred_locale || locale);
          setCurrency(authedUser.preferred_currency || currency);
          setWorkspaceInitialTab(
            ['super_admin', 'moderator', 'support'].includes(authedUser.role) && authMode === 'admin_login'
              ? 'admin'
              : 'overview'
          );
          setScreen('workspace');
        }}
      />
    );
  }

  if (screen === 'workspace' && user) {
    return (
      <WorkspaceDashboard
        user={user}
        plans={plans}
        locale={locale}
        currency={currency}
        darkMode={darkMode}
        initialTab={workspaceInitialTab}
        initialVerificationToken={verificationPreviewToken}
        onChangeLocale={setLocale}
        onChangeCurrency={setCurrency}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        onUserUpdated={(updated) => {
          setUser(updated);
          setLocale(updated.preferred_locale || locale);
          setCurrency(updated.preferred_currency || currency);
        }}
        onPlansUpdated={setPlans}
        onReturnToLanding={() => setScreen('public')}
        onSignedOut={() => {
          setUser(null);
          setScreen('public');
        }}
      />
    );
  }

  return (
    <PublicWebsite
      user={user}
      plans={plans}
      providers={providers}
      locale={locale}
      currency={currency}
      darkMode={darkMode}
      onChangeLocale={setLocale}
      onChangeCurrency={setCurrency}
      onToggleDarkMode={() => setDarkMode(!darkMode)}
      onNavigateAuth={(mode) => {
        setAuthMode(mode);
        setScreen('auth');
      }}
      onEnterWorkspace={() => {
        if (user) {
          setScreen('workspace');
        } else {
          setAuthMode('register');
          setScreen('auth');
        }
      }}
    />
  );
}
