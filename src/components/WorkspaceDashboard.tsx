import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Award,
  Bell,
  BookOpen,
  Compass,
  CreditCard,
  FileSearch,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Settings,
  ShieldAlert,
  Sun,
  X,
} from 'lucide-react';
import { apiFetch, setAuthTokens } from '../api';
import { t } from '../i18n';
import { AuthUser, Currency, Locale, Plan } from '../types';
import { AiTeacherView } from './AiTeacherView';
import { DetectiveModeView } from './DetectiveModeView';
import { MoodModeView } from './MoodModeView';
import { ProfileSecurityView } from './ProfileSecurityView';
import { SimulatorModeView } from './SimulatorModeView';
import { SubscriptionAndGrowthView } from './SubscriptionAndGrowthView';
import { SuperAdminConsole } from './SuperAdminConsole';
import { VisualGameView } from './VisualGameView';

export type WorkspaceTab =
  | 'overview'
  | 'mood'
  | 'simulator'
  | 'detective'
  | 'game'
  | 'teacher'
  | 'billing'
  | 'security'
  | 'admin';

interface WorkspaceDashboardProps {
  user: AuthUser;
  plans: Plan[];
  locale: Locale;
  currency: Currency;
  darkMode: boolean;
  initialTab?: WorkspaceTab;
  initialVerificationToken?: string;
  onChangeLocale: (l: Locale) => void;
  onChangeCurrency: (c: Currency) => void;
  onToggleDarkMode: () => void;
  onUserUpdated: (u: AuthUser) => void;
  onPlansUpdated: (p: Plan[]) => void;
  onReturnToLanding: () => void;
  onSignedOut: () => void;
}

export const WorkspaceDashboard: React.FC<WorkspaceDashboardProps> = ({
  user,
  plans,
  locale,
  currency,
  darkMode,
  initialTab = 'overview',
  initialVerificationToken,
  onChangeLocale,
  onChangeCurrency,
  onToggleDarkMode,
  onUserUpdated,
  onPlansUpdated,
  onReturnToLanding,
  onSignedOut,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingMistakeId, setPendingMistakeId] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);

  const loadSummary = async () => {
    try {
      const res = await apiFetch('/api/learning/dashboard-summary');
      setSummary(res);
    } catch {}
  };

  useEffect(() => {
    if (activeTab === 'overview') {
      loadSummary();
    }
  }, [activeTab]);

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    setAuthTokens(null, null);
    onSignedOut();
  };

  const handleMarkNotificationsRead = async () => {
    await apiFetch('/api/learning/notifications/read-all', { method: 'POST' });
    loadSummary();
  };

  const isStaff = ['super_admin', 'moderator', 'support'].includes(user.role);

  const skillChartData = [
    { skill: 'Retention', score: user.profile.retention_score || 0 },
    { skill: 'Grammar', score: user.profile.grammar_score || 0 },
    { skill: 'Speaking', score: user.profile.speaking_score || 0 },
    { skill: 'Pronunciation', score: user.profile.pronunciation_score || 0 },
    { skill: 'Reading', score: user.profile.reading_score || 0 },
  ];

  const navItems: Array<{ id: WorkspaceTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: t(locale, 'dash_overview'), icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'mood', label: t(locale, 'mode_mood'), icon: <BookOpen className="w-4 h-4" /> },
    { id: 'simulator', label: t(locale, 'mode_simulator'), icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'detective', label: t(locale, 'mode_detective'), icon: <FileSearch className="w-4 h-4" /> },
    { id: 'game', label: t(locale, 'mode_game'), icon: <Compass className="w-4 h-4" /> },
    { id: 'teacher', label: t(locale, 'mode_teacher'), icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'billing', label: t(locale, 'dash_billing'), icon: <CreditCard className="w-4 h-4" /> },
    { id: 'security', label: t(locale, 'dash_security'), icon: <Settings className="w-4 h-4" /> },
  ];

  if (isStaff) {
    navItems.push({
      id: 'admin',
      label: t(locale, 'admin_console'),
      icon: <ShieldAlert className="w-4 h-4" />,
    });
  }

  const totalCredits = user.credits.monthly_allowance + user.credits.bonus_credits;
  const remainingCredits = Math.max(0, totalCredits - user.credits.monthly_used);

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar (260px) */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col justify-between bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-5">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onReturnToLanding}
              className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white cursor-pointer"
            >
              MindQuest AI
            </button>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs space-y-1">
            <p className="font-semibold text-slate-900 dark:text-white truncate">{user.full_name}</p>
            <p className="text-slate-500 font-mono tabular-nums">
              {user.plan.name} · {remainingCredits} credits left
            </p>
          </div>

          <div className="flex items-center justify-between gap-2">
            <select
              value={locale}
              onChange={(e) => onChangeLocale(e.target.value as Locale)}
              aria-label="Workspace language"
              className="px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              <option value="en">EN</option>
              <option value="uz">UZ</option>
              <option value="ru">RU</option>
            </select>

            <select
              value={currency}
              onChange={(e) => onChangeCurrency(e.target.value as Currency)}
              aria-label="Workspace currency"
              className="px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              <option value="USD">USD</option>
              <option value="UZS">UZS</option>
            </select>

            <button
              type="button"
              onClick={onToggleDarkMode}
              aria-label="Toggle theme"
              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t(locale, 'sign_out')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Workspace Contextual Top Bar */}
        <header className="h-14 px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
              Workspace / <span className="text-slate-900 dark:text-white font-semibold capitalize">{activeTab}</span>
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
            <span className="hidden sm:inline text-slate-600 dark:text-slate-400">
              XP: <strong className="text-slate-900 dark:text-white">{user.profile.xp}</strong> · Streak:{' '}
              <strong className="text-slate-900 dark:text-white">{user.profile.streak_days}d</strong>
            </span>
            {user.subscription.plan_id === 'FREE' && (
              <button
                type="button"
                onClick={() => setActiveTab('billing')}
                className="py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-sans font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Upgrade Plan
              </button>
            )}
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                  activeTab === item.id ? 'bg-blue-600 text-white' : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full text-left px-3 py-2 text-xs text-red-600 font-semibold cursor-pointer"
            >
              {t(locale, 'sign_out')}
            </button>
          </div>
        )}

        {/* Viewport Canvas */}
        <main className="flex-1 p-6 lg:p-8 max-w-6xl w-full mx-auto">
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Welcome & Subscription Banner */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    CEFR {user.profile.cefr_level} · Current Mood: {user.profile.current_mood} · Daily Goal: {user.profile.daily_goal_minutes} min
                  </p>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                    Welcome back, {user.full_name}
                  </h1>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('mood')}
                    className="py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Start Today’s Lesson
                  </button>
                </div>
              </div>

              {/* 4 Core Learner Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono tabular-nums">
                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-sans text-slate-500">Total XP & Streak</p>
                  <p className="text-2xl font-bold mt-1">
                    {user.profile.xp} XP · {user.profile.streak_days}d
                  </p>
                  <p className="text-xs font-sans text-slate-500 mt-1">Earned strictly from real lessons</p>
                </div>

                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-sans text-slate-500">Remaining AI Credits</p>
                  <p className="text-2xl font-bold mt-1">
                    {remainingCredits} / {totalCredits}
                  </p>
                  <p className="text-xs font-sans text-slate-500 mt-1">
                    Plan: {user.plan.name} ({user.subscription.status})
                  </p>
                </div>

                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-sans text-slate-500">Unified Vocabulary Bank</p>
                  <p className="text-2xl font-bold mt-1">{summary?.stats?.vocabSavedCount ?? 0} words</p>
                  <p className="text-xs font-sans text-slate-500 mt-1">Injected into RPG Simulator</p>
                </div>

                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-sans text-slate-500">RPG Dialogues Practiced</p>
                  <p className="text-2xl font-bold mt-1">
                    {summary?.stats?.simulatorConversationsCount ?? 0} scenes
                  </p>
                  <p className="text-xs font-sans text-slate-500 mt-1">
                    Open mistakes: {summary?.unresolvedMistakes?.length ?? 0}
                  </p>
                </div>
              </div>

              {/* Five Core Modes + AI Teacher Launch Grid */}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">
                      Used today: {user.credits.daily_vocab_used}/{user.plan.daily_vocab_limit}
                    </p>
                    <h3 className="text-base font-bold">01. Mood Mode</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      Emotion-adaptive words, Uzbek translations, flashcards & stories.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('mood')}
                    className="mt-4 w-full py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Open Mood Mode
                  </button>
                </div>

                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">
                      Used today: {user.credits.daily_simulator_used}/{user.plan.daily_simulator_turns}
                    </p>
                    <h3 className="text-base font-bold">02. Simulator RPG</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      9 real-world scenarios with voice input & live grammar coaching.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('simulator')}
                    className="mt-4 w-full py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Open Simulator
                  </button>
                </div>

                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">
                      Used today: {user.credits.daily_detective_used}/{user.plan.daily_detective_cases}
                    </p>
                    <h3 className="text-base font-bold">03. Detective Mode</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      Solve suspect alibi contradictions & master 9 grammar domains.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('detective')}
                    className="mt-4 w-full py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Open Detective Board
                  </button>
                </div>

                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                  <div>
                    <p className="text-xs text-amber-500 dark:text-amber-400 font-semibold mb-1">
                      Visual Hotspots & Arena
                    </p>
                    <h3 className="text-base font-bold">04. Visual Quest</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      Examine 4K illustrated scenes for hidden clues & race in the Speed Word Arena.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('game')}
                    className="mt-4 w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Launch Visual Game
                  </button>
                </div>

                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">
                      Used today: {user.credits.daily_teacher_used}/{user.plan.daily_ai_teacher_msgs}
                    </p>
                    <h3 className="text-base font-bold">05. AI Teacher</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      Bilingual Uzbek/English grammar tutor & personalized study plans.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('teacher')}
                    className="mt-4 w-full py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Ask AI Teacher
                  </button>
                </div>
              </div>

              {/* Analytics & Recommendations Split */}
              <div className="grid lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-bold">Measured Skill Profile (Non-Fabricated)</h2>
                      <p className="text-xs text-slate-500">
                        Scores start at 0% and update strictly from your flashcards, quizzes, simulator turns, and solved cases.
                      </p>
                    </div>
                  </div>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={skillChartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="skill" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="score" fill="#2563EB" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-5">
                  {/* Recommendations & Mistakes */}
                  <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                    <h3 className="text-sm font-bold">Next Recommended Action</h3>
                    {summary?.unresolvedMistakes?.length > 0 ? (
                      <div className="space-y-2 text-xs">
                        <p className="text-slate-600 dark:text-slate-300">
                          You have {summary.unresolvedMistakes.length} unresolved grammar slip(s) from Simulator Mode ({summary.unresolvedMistakes[0].grammar_topic}).
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setPendingMistakeId(summary.unresolvedMistakes[0].id);
                            setActiveTab('detective');
                          }}
                          className="py-2 px-3.5 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
                        >
                          Convert Mistake into Detective Case →
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Save 3 words in Mood Mode today, then test them inside the Airport or Job Interview RPG Simulator.
                      </p>
                    )}
                  </div>

                  {/* Notifications & Achievements */}
                  <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-blue-600" />
                        <h3 className="text-sm font-bold">Recent Notifications</h3>
                      </div>
                      {summary?.notifications?.some((n: any) => !n.is_read) && (
                        <button
                          type="button"
                          onClick={handleMarkNotificationsRead}
                          className="text-xs text-blue-600 hover:underline cursor-pointer"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {summary?.notifications?.slice(0, 3).map((n: any) => (
                        <div key={n.id} className="py-2">
                          <p className="font-semibold text-slate-900 dark:text-white">{n.title}</p>
                          <p className="text-slate-500 mt-0.5">{n.body}</p>
                        </div>
                      ))}
                    </div>

                    {summary?.achievements?.length > 0 && (
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
                        {summary.achievements.map((a: any) => (
                          <span
                            key={a.id}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400"
                          >
                            <Award className="w-3.5 h-3.5" />
                            {a.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Usage History Table */}
              {summary?.usageHistory?.length > 0 && (
                <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm font-bold">AI Consumption & Token Ledger</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono tabular-nums">
                      <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
                        <tr>
                          <th className="px-5 py-2.5">Mode</th>
                          <th className="px-5 py-2.5">Model</th>
                          <th className="px-5 py-2.5 text-right">Tokens</th>
                          <th className="px-5 py-2.5 text-right">Credits</th>
                          <th className="px-5 py-2.5">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {summary.usageHistory.slice(0, 8).map((row: any) => (
                          <tr key={row.id}>
                            <td className="px-5 py-2.5">{row.feature_mode}</td>
                            <td className="px-5 py-2.5">{row.model_name}</td>
                            <td className="px-5 py-2.5 text-right">{row.total_tokens}</td>
                            <td className="px-5 py-2.5 text-right">-{row.credits_charged}</td>
                            <td className="px-5 py-2.5">{new Date(row.created_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'mood' && (
            <MoodModeView
              user={user}
              onUserUpdated={onUserUpdated}
              onLaunchSimulatorWithWords={() => setActiveTab('simulator')}
            />
          )}

          {activeTab === 'simulator' && (
            <SimulatorModeView
              user={user}
              onUserUpdated={onUserUpdated}
              onConvertMistakeToDetective={(mistakeId) => {
                setPendingMistakeId(mistakeId);
                setActiveTab('detective');
              }}
            />
          )}

          {activeTab === 'detective' && (
            <DetectiveModeView
              user={user}
              pendingMistakeId={pendingMistakeId}
              onClearPendingMistake={() => setPendingMistakeId(null)}
              onUserUpdated={onUserUpdated}
            />
          )}

          {activeTab === 'game' && (
            <VisualGameView user={user} onUserUpdated={onUserUpdated} />
          )}

          {activeTab === 'teacher' && (
            <AiTeacherView user={user} onUserUpdated={onUserUpdated} />
          )}

          {activeTab === 'billing' && (
            <SubscriptionAndGrowthView
              user={user}
              plans={plans}
              currency={currency}
              onUserUpdated={onUserUpdated}
            />
          )}

          {activeTab === 'security' && (
            <ProfileSecurityView
              user={user}
              initialVerificationToken={initialVerificationToken}
              onUserUpdated={onUserUpdated}
              onAccountDeleted={onSignedOut}
            />
          )}

          {activeTab === 'admin' && isStaff && (
            <SuperAdminConsole
              user={user}
              plans={plans}
              onPlansUpdated={onPlansUpdated}
            />
          )}
        </main>
      </div>
    </div>
  );
};
