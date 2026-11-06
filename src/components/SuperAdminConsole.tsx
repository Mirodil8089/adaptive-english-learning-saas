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
import { Download, RefreshCw, Save } from 'lucide-react';
import { apiFetch } from '../api';
import { AuthUser, Plan } from '../types';

interface SuperAdminConsoleProps {
  user: AuthUser;
  plans: Plan[];
  onPlansUpdated: (plans: Plan[]) => void;
}

export const SuperAdminConsole: React.FC<SuperAdminConsoleProps> = ({
  user,
  plans,
  onPlansUpdated,
}) => {
  const [tab, setTab] = useState<'overview' | 'users' | 'plans' | 'billing' | 'ai' | 'cms'>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [billingData, setBillingData] = useState<any>(null);
  const [aiConfig, setAiConfig] = useState<any>(null);
  const [cmsData, setCmsData] = useState<any>(null);
  const [editablePlans, setEditablePlans] = useState<Plan[]>(plans);

  // Promo form
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(25);
  const [promoMaxUses, setPromoMaxUses] = useState(200);

  // CMS form
  const [newWord, setNewWord] = useState({
    word: '',
    phonetic: '/wɜːd/',
    part_of_speech: 'noun',
    cefr_level: 'B2',
    mood_tag: 'Curious',
    definition_en: '',
    translation_uz: '',
    translation_ru: '',
    example_en: '',
    example_uz: '',
  });

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditablePlans(plans);
  }, [plans]);

  const loadOverview = async () => {
    try {
      const res = await apiFetch('/api/admin/overview');
      setOverview(res);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await apiFetch(`/api/admin/users?q=${encodeURIComponent(userSearch)}`);
      setUsersList(res.users);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadBilling = async () => {
    try {
      const res = await apiFetch('/api/admin/billing');
      setBillingData(res);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadAiConfig = async () => {
    try {
      const res = await apiFetch('/api/admin/ai-config');
      setAiConfig(res);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadCms = async () => {
    try {
      const res = await apiFetch('/api/admin/content');
      setCmsData(res);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (tab === 'overview') loadOverview();
    if (tab === 'users') loadUsers();
    if (tab === 'billing') loadBilling();
    if (tab === 'ai') loadAiConfig();
    if (tab === 'cms') loadCms();
  }, [tab]);

  const handleDownloadCsv = async (dataset: 'users' | 'payments' | 'usage') => {
    try {
      const csv = await apiFetch<string>(`/api/admin/export/${dataset}`);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mindquest_${dataset}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateUser = async (targetId: string, payload: Record<string, any>) => {
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${targetId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setNotice('User record updated.');
      loadUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSavePlan = async (p: Plan) => {
    setError(null);
    try {
      const res = await apiFetch<{ plans: Plan[] }>(`/api/admin/plans/${p.id}`, {
        method: 'PUT',
        body: JSON.stringify(p),
      });
      onPlansUpdated(res.plans);
      setNotice(`Saved pricing & quota settings for ${p.name}.`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/admin/promo-codes', {
        method: 'POST',
        body: JSON.stringify({
          code: promoCode,
          discountPercent: promoDiscount,
          maxUses: promoMaxUses,
        }),
      });
      setPromoCode('');
      setNotice('Promo code created.');
      loadBilling();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRefund = async (paymentId: string) => {
    setError(null);
    try {
      await apiFetch(`/api/admin/refund/${paymentId}`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Admin authorized refund' }),
      });
      setNotice('Payment refunded and subscription downgraded.');
      loadBilling();
      loadOverview();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveAiSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiConfig?.settings) return;
    setError(null);
    try {
      await apiFetch('/api/admin/ai-config', {
        method: 'PUT',
        body: JSON.stringify(aiConfig.settings),
      });
      setNotice('AI models, cost caps, and system prompts updated.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddVocab = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/admin/content/vocabulary', {
        method: 'POST',
        body: JSON.stringify(newWord),
      });
      setNewWord({ ...newWord, word: '', definition_en: '', translation_uz: '', example_en: '', example_uz: '' });
      setNotice('Vocabulary item published to Mood Mode.');
      loadCms();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            RBAC Role: {user.role} · Zero Fabricated Revenue · Live Database Telemetry
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Super Admin Operations Console</h1>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
          {[
            { id: 'overview', label: 'Revenue & KPIs' },
            { id: 'users', label: 'Users & RBAC' },
            { id: 'plans', label: 'Plans & Quotas' },
            { id: 'billing', label: 'Transactions & Promos' },
            { id: 'ai', label: 'AI Cost & Prompts' },
            { id: 'cms', label: 'Curriculum CMS' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as any)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                tab === item.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
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

      {/* TAB 1: EXECUTIVE & FINANCIAL KPIs */}
      {tab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={loadOverview}
              className="py-1.5 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Live Metrics</span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {(['users', 'payments', 'usage'] as const).map((ds) => (
                <button
                  key={ds}
                  type="button"
                  onClick={() => handleDownloadCsv(ds)}
                  className="py-1.5 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export {ds}.csv</span>
                </button>
              ))}
            </div>
          </div>

          {/* Strictly Separated Revenue, Sandbox, Refunds, Fees, AI Costs & Gross Profit */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono tabular-nums">
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <p className="text-xs font-sans text-slate-500">Registered / Active Users</p>
              <p className="text-2xl font-bold mt-1">
                {overview.kpis.totalUsers} / {overview.kpis.activeUsers}
              </p>
              <p className="text-xs font-sans text-slate-500 mt-1">
                New (7d): +{overview.kpis.newRegistrations7d} · Conversion: {overview.kpis.conversionRatePct}%
              </p>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <p className="text-xs font-sans text-slate-500">Subscribers (Paid / Free / Trial)</p>
              <p className="text-2xl font-bold mt-1">
                {overview.kpis.paidSubscribers} / {overview.kpis.freeSubscribers} / {overview.kpis.trialingSubscribers}
              </p>
              <p className="text-xs font-sans text-slate-500 mt-1">
                Est. MRR: ${overview.kpis.estimatedMrrUsd} · ARR: ${overview.kpis.estimatedArrUsd}
              </p>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <p className="text-xs font-sans text-slate-500">Live Collected Revenue (USD)</p>
              <p className="text-2xl font-bold mt-1">${overview.kpis.liveCollectedRevenueUsd}</p>
              <p className="text-xs font-sans text-slate-500 mt-1">
                Refunds: ${overview.kpis.totalRefundsUsd} · Fees: ${overview.kpis.liveProviderFeesUsd}
              </p>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <p className="text-xs font-sans text-slate-500">AI Expenses & Est. Gross Profit</p>
              <p className="text-2xl font-bold mt-1">${overview.kpis.aiExpensesUsd}</p>
              <p className="text-xs font-sans text-slate-500 mt-1">
                Est. Gross Profit: ${overview.kpis.estimatedGrossProfitUsd} · Tokens: {overview.kpis.aiTotalTokens}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs font-mono tabular-nums">
            <span>
              Sandbox Simulated Volume (Separated from Live Revenue): ${overview.kpis.sandboxSimulatedVolumeUsd} ({overview.kpis.sandboxTransactionsCount} test tx)
            </span>
            <span>
              Failed Payments: {overview.kpis.failedPaymentsCount} · Canceled Subs: {overview.kpis.canceledSubscriptions} · AI Errors: {overview.kpis.aiErrorsCount}
            </span>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold mb-4">Engagement by AI Feature Mode</h3>
              <div className="h-60">
                {overview.charts.modePopularity.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overview.charts.modePopularity}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="mode" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="requests" fill="#2563EB" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500">
                    Run AI lessons in Mood, Simulator, or Detective Mode to populate live request telemetry.
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold mb-4">Daily Registration Activity</h3>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview.charts.dailyRegistrations}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="users" fill="#0F172A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USERS & RBAC */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users by name or email..."
              className="flex-1 max-w-md px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            <button
              type="button"
              onClick={loadUsers}
              className="py-2 px-4 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
            >
              Search
            </button>
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Plan / Status</th>
                  <th className="px-4 py-3 text-right">XP / Credits</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {usersList.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 dark:text-white">{u.full_name}</p>
                      <p className="text-slate-500 font-mono">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => handleUpdateUser(u.id, { role: e.target.value })}
                        className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      >
                        <option value="learner">learner</option>
                        <option value="support">support</option>
                        <option value="moderator">moderator</option>
                        <option value="super_admin">super_admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {u.plan_id} · {u.sub_status} · {u.status}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {u.xp || 0} XP · {u.monthly_used || 0}/{(u.monthly_allowance || 0) + (u.bonus_credits || 0)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdateUser(u.id, { grantBonusCredits: 100 })}
                          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          +100 Credits
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateUser(u.id, {
                              status: u.status === 'active' ? 'suspended' : 'active',
                            })
                          }
                          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          {u.status === 'active' ? 'Suspend' : 'Restore'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PLANS & QUOTAS EDITOR */}
      {tab === 'plans' && (
        <div className="grid md:grid-cols-2 gap-5">
          {editablePlans.map((p, idx) => (
            <div
              key={p.id}
              className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold">
                  {p.name} ({p.id})
                </h3>
                <button
                  type="button"
                  onClick={() => handleSavePlan(p)}
                  className="py-1.5 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 mb-1">USD Price</label>
                  <input
                    type="number"
                    value={p.price_usd}
                    onChange={(e) => {
                      const next = [...editablePlans];
                      next[idx] = { ...p, price_usd: Number(e.target.value) };
                      setEditablePlans(next);
                    }}
                    className="w-full px-2.5 py-1.5 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">UZS Price</label>
                  <input
                    type="number"
                    value={p.price_uzs}
                    onChange={(e) => {
                      const next = [...editablePlans];
                      next[idx] = { ...p, price_uzs: Number(e.target.value) };
                      setEditablePlans(next);
                    }}
                    className="w-full px-2.5 py-1.5 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Trial Days</label>
                  <input
                    type="number"
                    value={p.trial_days}
                    onChange={(e) => {
                      const next = [...editablePlans];
                      next[idx] = { ...p, trial_days: Number(e.target.value) };
                      setEditablePlans(next);
                    }}
                    className="w-full px-2.5 py-1.5 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Monthly Credits</label>
                  <input
                    type="number"
                    value={p.monthly_ai_credits}
                    onChange={(e) => {
                      const next = [...editablePlans];
                      next[idx] = { ...p, monthly_ai_credits: Number(e.target.value) };
                      setEditablePlans(next);
                    }}
                    className="w-full px-2.5 py-1.5 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Daily Vocab</label>
                  <input
                    type="number"
                    value={p.daily_vocab_limit}
                    onChange={(e) => {
                      const next = [...editablePlans];
                      next[idx] = { ...p, daily_vocab_limit: Number(e.target.value) };
                      setEditablePlans(next);
                    }}
                    className="w-full px-2.5 py-1.5 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Daily RPG Turns</label>
                  <input
                    type="number"
                    value={p.daily_simulator_turns}
                    onChange={(e) => {
                      const next = [...editablePlans];
                      next[idx] = { ...p, daily_simulator_turns: Number(e.target.value) };
                      setEditablePlans(next);
                    }}
                    className="w-full px-2.5 py-1.5 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 4: BILLING, PROMO CODES, REFUNDS & AFFILIATES */}
      {tab === 'billing' && billingData && (
        <div className="space-y-6">
          <form
            onSubmit={handleCreatePromo}
            className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-end gap-3"
          >
            <div>
              <label className="block text-xs text-slate-500 mb-1">New Promo Code</label>
              <input
                type="text"
                required
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="NAVRUZ30"
                className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Discount %</label>
              <input
                type="number"
                min={1}
                max={100}
                value={promoDiscount}
                onChange={(e) => setPromoDiscount(Number(e.target.value))}
                className="w-24 px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Max Uses</label>
              <input
                type="number"
                min={1}
                value={promoMaxUses}
                onChange={(e) => setPromoMaxUses(Number(e.target.value))}
                className="w-28 px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <button
              type="submit"
              className="py-2 px-4 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
            >
              Create Promo Code
            </button>
          </form>

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold">Transactions & Refund Controls</h3>
            </div>
            <table className="w-full text-left text-xs font-mono tabular-nums">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Provider / Plan</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Environment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {billingData.payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3">{p.user_email}</td>
                    <td className="px-4 py-3">
                      {p.provider} · {p.plan_id}
                    </td>
                    <td className="px-4 py-3 text-right">${Number(p.amount_usd).toFixed(2)}</td>
                    <td className="px-4 py-3">{p.is_sandbox ? 'Sandbox' : 'Live'}</td>
                    <td className="px-4 py-3">{p.status}</td>
                    <td className="px-4 py-3">
                      {p.status === 'succeeded' && (
                        <button
                          type="button"
                          onClick={() => handleRefund(p.id)}
                          className="text-red-600 hover:underline font-sans font-semibold cursor-pointer"
                        >
                          Issue Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {billingData.affiliates?.length > 0 && (
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <h3 className="text-sm font-bold">Affiliate Applications</h3>
              {billingData.affiliates.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between text-xs py-2 border-t border-slate-100 dark:border-slate-800">
                  <span>
                    {a.full_name} ({a.user_email}) · {a.affiliate_code} · Status: <strong>{a.status}</strong>
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/affiliates/${a.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ status: 'approved' }),
                        });
                        loadBilling();
                      }}
                      className="px-2.5 py-1 rounded bg-emerald-600 text-white font-semibold cursor-pointer"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: AI COST GUARDRAILS & PROMPTS */}
      {tab === 'ai' && aiConfig && (
        <div className="space-y-6">
          <form
            onSubmit={handleSaveAiSettings}
            className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <h3 className="text-base font-bold">Model Routing, Daily Spend Cap & Exchange Rate</h3>
            <div className="grid sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Text / Structured Model</label>
                <input
                  type="text"
                  value={aiConfig.settings.text_model || ''}
                  onChange={(e) =>
                    setAiConfig({
                      ...aiConfig,
                      settings: { ...aiConfig.settings, text_model: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">TTS Voice Model</label>
                <input
                  type="text"
                  value={aiConfig.settings.tts_model || ''}
                  onChange={(e) =>
                    setAiConfig({
                      ...aiConfig,
                      settings: { ...aiConfig.settings, tts_model: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Global Daily USD Cap (Circuit Breaker)</label>
                <input
                  type="text"
                  value={aiConfig.settings.global_daily_usd_cap || ''}
                  onChange={(e) =>
                    setAiConfig({
                      ...aiConfig,
                      settings: { ...aiConfig.settings, global_daily_usd_cap: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">USD to UZS Display Rate</label>
                <input
                  type="text"
                  value={aiConfig.settings.usd_to_uzs_rate || ''}
                  onChange={(e) =>
                    setAiConfig({
                      ...aiConfig,
                      settings: { ...aiConfig.settings, usd_to_uzs_rate: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">AI Teacher System Instruction</label>
              <textarea
                rows={3}
                value={aiConfig.settings.teacher_system_prompt || ''}
                onChange={(e) =>
                  setAiConfig({
                    ...aiConfig,
                    settings: { ...aiConfig.settings, teacher_system_prompt: e.target.value },
                  })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <button
              type="submit"
              className="py-2 px-5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
            >
              Save AI Configuration
            </button>
          </form>

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold">Recent AI Token & Cost Ledger</h3>
            </div>
            <table className="w-full text-left text-xs font-mono tabular-nums">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">User</th>
                  <th className="px-4 py-2.5">Mode</th>
                  <th className="px-4 py-2.5">Model</th>
                  <th className="px-4 py-2.5 text-right">Tokens</th>
                  <th className="px-4 py-2.5 text-right">Cost USD</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {aiConfig.recentLogs.map((l: any) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5">{l.user_email}</td>
                    <td className="px-4 py-2.5">{l.feature_mode}</td>
                    <td className="px-4 py-2.5">{l.model_name}</td>
                    <td className="px-4 py-2.5 text-right">{l.total_tokens}</td>
                    <td className="px-4 py-2.5 text-right">${Number(l.estimated_cost_usd).toFixed(6)}</td>
                    <td className="px-4 py-2.5">{l.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: CURRICULUM CMS */}
      {tab === 'cms' && cmsData && (
        <div className="space-y-6">
          <form
            onSubmit={handleAddVocab}
            className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <h3 className="text-base font-bold">Publish Curated Vocabulary Item</h3>
            <div className="grid sm:grid-cols-3 gap-3 text-xs">
              <input
                type="text"
                required
                placeholder="English Word"
                value={newWord.word}
                onChange={(e) => setNewWord({ ...newWord, word: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="text"
                required
                placeholder="Uzbek Translation"
                value={newWord.translation_uz}
                onChange={(e) => setNewWord({ ...newWord, translation_uz: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <select
                value={newWord.mood_tag}
                onChange={(e) => setNewWord({ ...newWord, mood_tag: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {['Happy', 'Sad', 'Tired', 'Motivated', 'Relaxed', 'Curious', 'Confident', 'Stressed'].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                type="text"
                required
                placeholder="English Definition"
                value={newWord.definition_en}
                onChange={(e) => setNewWord({ ...newWord, definition_en: e.target.value })}
                className="sm:col-span-3 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <button
              type="submit"
              className="py-2 px-4 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
            >
              Publish Word
            </button>
          </form>

          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
            <p className="font-bold mb-2">
              Curated Library Summary: {cmsData.vocabulary.length} Vocabulary Items · {cmsData.scenarios.length} RPG Scenarios · {cmsData.cases.length} Detective Cases
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
