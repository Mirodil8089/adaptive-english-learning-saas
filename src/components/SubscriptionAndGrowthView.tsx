import React, { useEffect, useState } from 'react';
import { Check, Copy, CreditCard, Gift, Users } from 'lucide-react';
import { apiFetch } from '../api';
import { formatMoney } from '../i18n';
import { AuthUser, Currency, Plan, PlanId, ProviderStatusMap } from '../types';

interface SubscriptionAndGrowthViewProps {
  user: AuthUser;
  plans: Plan[];
  currency: Currency;
  onUserUpdated: (u: AuthUser) => void;
}

export const SubscriptionAndGrowthView: React.FC<SubscriptionAndGrowthViewProps> = ({
  user,
  plans,
  currency,
  onUserUpdated,
}) => {
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>('PREMIUM');
  const [selectedProvider, setSelectedProvider] = useState<'stripe' | 'payme' | 'click'>('stripe');
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount_percent: number } | null>(null);

  const [historyData, setHistoryData] = useState<any>(null);
  const [providers, setProviders] = useState<ProviderStatusMap | null>(null);

  // Gift, Team & Affiliate inputs
  const [giftCodeInput, setGiftCodeInput] = useState('');
  const [teamJoinInput, setTeamJoinInput] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSeats, setNewOrgSeats] = useState(15);
  const [copiedRef, setCopiedRef] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadBillingHistory = async () => {
    try {
      const res = await apiFetch('/api/billing/history');
      setHistoryData(res);
      setProviders(res.providers);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadBillingHistory();
  }, []);

  const rate = providers?.usdToUzsRate || 12850;

  const handleValidatePromo = async () => {
    setError(null);
    try {
      const res = await apiFetch('/api/billing/validate-promo', {
        method: 'POST',
        body: JSON.stringify({ code: promoInput }),
      });
      setAppliedPromo({ code: res.code, discount_percent: res.discount_percent });
      setNotice(`Promo code ${res.code} applied (${res.discount_percent}% off).`);
    } catch (err: any) {
      setAppliedPromo(null);
      setError(err.message);
    }
  };

  const handleStartTrial = async (planId: PlanId) => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ user: AuthUser }>('/api/billing/start-trial', {
        method: 'POST',
        body: JSON.stringify({ planId }),
      });
      onUserUpdated(res.user);
      setNotice(`Trial started for ${planId}.`);
      loadBillingHistory();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCheckout = async (runSandboxSimulation = false) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({
          planId: selectedPlanId,
          provider: selectedProvider,
          promoCode: appliedPromo?.code,
          runSandboxSimulation,
        }),
      });
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
        return;
      }
      if (res.sandboxCompleted && res.user) {
        onUserUpdated(res.user);
        setNotice(
          `Sandbox webhook simulation completed for ${selectedPlanId} via ${selectedProvider.toUpperCase()} (recorded as is_sandbox=1; excluded from live revenue).`
        );
        loadBillingHistory();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSubAction = async (action: 'cancel' | 'resume' | 'downgrade', targetPlanId?: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ user: AuthUser }>('/api/billing/downgrade-or-cancel', {
        method: 'POST',
        body: JSON.stringify({ action, targetPlanId }),
      });
      onUserUpdated(res.user);
      setNotice(`Subscription updated (${action}).`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRedeemGift = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ user: AuthUser }>('/api/billing/redeem-gift', {
        method: 'POST',
        body: JSON.stringify({ code: giftCodeInput }),
      });
      onUserUpdated(res.user);
      setGiftCodeInput('');
      setNotice('Gift subscription activated!');
      loadBillingHistory();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ user: AuthUser; organization: string }>('/api/billing/join-team', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: teamJoinInput }),
      });
      onUserUpdated(res.user);
      setTeamJoinInput('');
      setNotice(`Joined organization license: ${res.organization}`);
      loadBillingHistory();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ inviteCode: string }>('/api/billing/create-team', {
        method: 'POST',
        body: JSON.stringify({ organizationName: newOrgName, seatLimit: newOrgSeats }),
      });
      setNewOrgName('');
      setNotice(`Created School/Team license! Share invite code: ${res.inviteCode}`);
      loadBillingHistory();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleApplyAffiliate = async () => {
    setError(null);
    try {
      await apiFetch('/api/billing/affiliate-apply', { method: 'POST' });
      setNotice('Affiliate application submitted for Super Admin approval.');
      loadBillingHistory();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
          Current Tier: {user.plan.name} · Status: {user.subscription.status} · Provider: {user.subscription.provider}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Subscription, Quotas & Partner Growth</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Manage your plan, inspect monthly AI credit meters, checkout via Stripe, Payme, or Click, and share referral codes.
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

      {/* Current Subscription & Credit Summary */}
      <div className="grid md:grid-cols-3 gap-5">
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500">Active Entitlement</p>
          <p className="text-xl font-bold mt-1">{user.plan.name}</p>
          <p className="text-xs text-slate-500 font-mono tabular-nums mt-2">
            Status: {user.subscription.status} · Renews/Ends:{' '}
            {new Date(user.subscription.current_period_end).toLocaleDateString()}
          </p>
          {user.subscription.plan_id !== 'FREE' && (
            <div className="mt-4 flex flex-wrap gap-2">
              {user.subscription.cancel_at_period_end ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleSubAction('resume')}
                  className="py-1.5 px-3 rounded-md bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Resume Auto-Renewal
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleSubAction('downgrade', 'BASIC')}
                    className="py-1.5 px-3 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                  >
                    Schedule Downgrade
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleSubAction('cancel')}
                    className="py-1.5 px-3 rounded-md border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-medium cursor-pointer"
                  >
                    Cancel at Period End
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500">Monthly AI Credits</p>
          <p className="text-xl font-bold font-mono tabular-nums mt-1">
            {user.credits.monthly_used} / {user.credits.monthly_allowance + user.credits.bonus_credits} used
          </p>
          <p className="text-xs text-slate-500 font-mono tabular-nums mt-2">
            Base: {user.credits.monthly_allowance} · Referral Bonus: +{user.credits.bonus_credits}
          </p>
        </div>

        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500">Your Referral Code (+75 Credits/Friend)</p>
          <div className="flex items-center justify-between gap-2 mt-2">
            <span className="text-lg font-bold font-mono">{user.referral_code}</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(user.referral_code);
                setCopiedRef(true);
                setTimeout(() => setCopiedRef(false), 2000);
              }}
              className="py-1.5 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedRef ? 'Copied' : 'Copy Code'}</span>
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Invited friends also receive +25 welcome AI credits upon signup.
          </p>
        </div>
      </div>

      {/* Upgrade & Modular Payment Checkout */}
      <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Upgrade Plan or Start Free Trial</h2>
            <p className="text-xs text-slate-500">
              Never stores raw card numbers or CVV—processed exclusively via signed server webhooks.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans
            .filter((p) => p.id !== 'FREE')
            .map((p) => {
              const active = selectedPlanId === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPlanId(p.id)}
                  className={`p-4 rounded-xl border cursor-pointer flex flex-col justify-between ${
                    active
                      ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div>
                    <p className="text-xs text-slate-500">{p.billing_interval === 'year' ? 'Yearly' : 'Monthly'}</p>
                    <h3 className="text-base font-bold mt-0.5">{p.name}</h3>
                    <p className="text-lg font-extrabold font-mono tabular-nums mt-2">
                      {formatMoney(p.price_usd, p.price_uzs, currency, rate)}
                    </p>
                    <p className="text-xs text-slate-500 font-mono mt-1">{p.monthly_ai_credits} credits/mo</p>
                  </div>

                  {p.trial_days > 0 && user.subscription.plan_id === 'FREE' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartTrial(p.id);
                      }}
                      className="mt-4 w-full py-1.5 px-3 rounded-lg border border-blue-600 text-blue-600 dark:text-blue-400 text-xs font-semibold hover:bg-blue-50 dark:hover:bg-blue-950 cursor-pointer"
                    >
                      Start {p.trial_days}-Day Free Trial
                    </button>
                  )}
                </div>
              );
            })}
        </div>

        {/* Payment Gateway Selection & Promo Code */}
        <div className="grid md:grid-cols-12 gap-6 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="md:col-span-7 space-y-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Select Payment Gateway
            </label>
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                {
                  id: 'stripe',
                  title: 'Stripe (USD Cards)',
                  status: providers?.stripe.mode || 'unconfigured',
                },
                {
                  id: 'payme',
                  title: 'Payme (Uzbekistan UZS)',
                  status: providers?.payme.mode || 'unconfigured',
                },
                {
                  id: 'click',
                  title: 'Click (Uzbekistan UZS)',
                  status: providers?.click.mode || 'unconfigured',
                },
              ].map((gw) => (
                <button
                  key={gw.id}
                  type="button"
                  onClick={() => setSelectedProvider(gw.id as any)}
                  className={`p-3.5 rounded-lg border text-left cursor-pointer ${
                    selectedProvider === gw.id
                      ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <p className="text-xs font-bold">{gw.title}</p>
                  <p className="text-xs text-slate-500 mt-1 font-mono">
                    State: {gw.status === 'unconfigured' ? 'Unconfigured / Test' : gw.status}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-5 space-y-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Promo Code (Try WELCOME20)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
                placeholder="WELCOME20"
                className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <button
                type="button"
                onClick={handleValidatePromo}
                className="py-2 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => handleCheckout(false)}
            className="py-2.5 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <CreditCard className="w-4 h-4" />
            <span>Proceed to {selectedProvider.toUpperCase()} Checkout</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => handleCheckout(true)}
            className="py-2.5 px-4 rounded-lg border border-amber-400 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-xs font-semibold hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"
          >
            Run Sandbox Test Webhook ({selectedProvider.toUpperCase()})
          </button>
        </div>
      </div>

      {/* Extra Revenue Channels: Gift Subscriptions, School/Team Licenses, Affiliate Partner */}
      <div className="grid md:grid-cols-3 gap-5">
        <form
          onSubmit={handleRedeemGift}
          className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
        >
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold">Redeem Gift Subscription</h3>
          </div>
          <input
            type="text"
            required
            value={giftCodeInput}
            onChange={(e) => setGiftCodeInput(e.target.value)}
            placeholder="GIFT-XXXX"
            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          />
          <button
            type="submit"
            className="w-full py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
          >
            Redeem Gift Code
          </button>
        </form>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold">School / Team Seat License</h3>
          </div>
          <form onSubmit={handleJoinTeam} className="flex gap-2">
            <input
              type="text"
              required
              value={teamJoinInput}
              onChange={(e) => setTeamJoinInput(e.target.value)}
              placeholder="TEAM-XXXXXX"
              className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <button type="submit" className="py-1.5 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer">
              Join
            </button>
          </form>
          <form onSubmit={handleCreateTeam} className="pt-2 border-t border-slate-100 dark:border-slate-800 flex gap-2">
            <input
              type="text"
              required
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="New School / Team Name"
              className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <button
              type="submit"
              onClick={() => setNewOrgSeats(15)}
              className="py-1.5 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
            >
              Create
            </button>
          </form>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <h3 className="text-sm font-bold">Affiliate Partner Program</h3>
          {historyData?.affiliate ? (
            <div className="text-xs space-y-1 font-mono tabular-nums">
              <p>Code: {historyData.affiliate.affiliate_code}</p>
              <p>Approval Status: {historyData.affiliate.status}</p>
              <p>Commission Rate: {historyData.affiliate.commission_rate_pct}%</p>
              <p>Approved Earnings: ${historyData.affiliate.approved_commission_usd}</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                Teachers and creators earn verified 20% commission on referred paid subscriptions after admin approval.
              </p>
              <button
                type="button"
                onClick={handleApplyAffiliate}
                className="w-full py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Apply as Affiliate Partner
              </button>
            </>
          )}
        </div>
      </div>

      {/* Invoices Table */}
      {historyData?.invoices?.length > 0 && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-bold">Invoices & Receipts</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Invoice #</th>
                  <th className="px-5 py-3 font-semibold">Plan</th>
                  <th className="px-5 py-3 font-semibold text-right">Amount</th>
                  <th className="px-5 py-3 font-semibold">Mode</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Issued</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                {historyData.invoices.map((inv: any) => (
                  <tr key={inv.id}>
                    <td className="px-5 py-3">{inv.invoice_number}</td>
                    <td className="px-5 py-3">{inv.plan_id}</td>
                    <td className="px-5 py-3 text-right">
                      {inv.currency === 'UZS'
                        ? `${Number(inv.total_uzs).toLocaleString()} UZS`
                        : `$${Number(inv.total_usd).toFixed(2)}`}
                    </td>
                    <td className="px-5 py-3">{inv.is_sandbox ? 'Sandbox Test' : 'Live'}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600" />
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">{new Date(inv.issued_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
