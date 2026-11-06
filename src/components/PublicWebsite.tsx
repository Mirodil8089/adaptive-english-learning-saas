import React, { useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Globe,
  Moon,
  Sun,
  Volume2,
} from 'lucide-react';
import { apiFetch, speakEnglishText } from '../api';
import { formatMoney, t } from '../i18n';
import { AuthUser, Currency, Locale, Plan, ProviderStatusMap } from '../types';
import { ImageWithFallback } from './ImageWithFallback';

import HERO_IMG from '../assets/images/hero_mindquest_edtech_1793797336651.jpg';
import MOOD_IMG from '../assets/images/mode_mood_storytelling_1793797335990.jpg';
import SIM_IMG from '../assets/images/mode_simulator_airport_1793797336167.jpg';
import DET_IMG from '../assets/images/mode_detective_mystery_1793797338612.jpg';
import GAME_IMG from '../assets/images/scene_oxford_gothic_library_1793800920229.jpg';

interface PublicWebsiteProps {
  user: AuthUser | null;
  plans: Plan[];
  providers: ProviderStatusMap | null;
  locale: Locale;
  currency: Currency;
  darkMode: boolean;
  onChangeLocale: (l: Locale) => void;
  onChangeCurrency: (c: Currency) => void;
  onToggleDarkMode: () => void;
  onNavigateAuth: (mode: 'login' | 'register' | 'admin_login') => void;
  onEnterWorkspace: () => void;
}

type PublicSubPage = 'landing' | 'about' | 'terms' | 'privacy' | 'contact';

export const PublicWebsite: React.FC<PublicWebsiteProps> = ({
  user,
  plans,
  providers,
  locale,
  currency,
  darkMode,
  onChangeLocale,
  onChangeCurrency,
  onToggleDarkMode,
  onNavigateAuth,
  onEnterWorkspace,
}) => {
  const [subPage, setSubPage] = useState<PublicSubPage>('landing');
  const [previewTab, setPreviewTab] = useState<'mood' | 'simulator' | 'detective' | 'game'>('mood');
  const [billingFilter, setBillingFilter] = useState<'all' | 'monthly' | 'annual'>('all');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Contact form state
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactTopic, setContactTopic] = useState('Enterprise / University Licensing');
  const [contactMsg, setContactMsg] = useState('');
  const [contactSent, setContactSent] = useState(false);
  const [contactErr, setContactErr] = useState<string | null>(null);

  const rate = providers?.usdToUzsRate || 12850;

  const submitContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactErr(null);
    try {
      await apiFetch('/api/auth/contact', {
        method: 'POST',
        body: JSON.stringify({
          fullName: contactName,
          email: contactEmail,
          topic: contactTopic,
          message: contactMsg,
        }),
      });
      setContactSent(true);
      setContactName('');
      setContactEmail('');
      setContactMsg('');
    } catch (err: any) {
      setContactErr(err.message);
    }
  };

  const scrollToSection = (id: string) => {
    if (subPage !== 'landing') {
      setSubPage('landing');
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

const displayedPlans = plans?.filter((p) => {
  if (billingFilter === 'monthly') return p.billing_interval === 'month';
  if (billingFilter === 'annual') return p.billing_interval === 'year' || p.id === 'FREE';
  return true;
}) || [];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Strict 3-Zone Top Bar Contract: [Brand wordmark] вЂ” [5 single-line nav links] вЂ” [1 primary CTA] */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => {
              setSubPage('landing');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            MindQuest AI
          </button>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <button
              type="button"
              onClick={() => scrollToSection('features')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t(locale, 'nav_features')}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('how-it-works')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t(locale, 'nav_how')}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('pricing')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t(locale, 'nav_pricing')}
            </button>
            <button
              type="button"
              onClick={() => setSubPage('about')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t(locale, 'nav_about')}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('faq')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t(locale, 'nav_faq')}
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => (user ? onEnterWorkspace() : onNavigateAuth('register'))}
              className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {user ? t(locale, 'cta_open_workspace') : t(locale, 'cta_start_free')}
            </button>
          </div>
        </div>
      </header>

      {/* Secondary Utility Strip below Header (Locale, Currency, Theme, Sign In, Contact) */}
      <div className="border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-100/70 dark:bg-slate-900/60">
        <div className="max-w-7xl mx-auto px-6 py-2 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5" />
            <span>{t(locale, 'hero_kicker')}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md p-0.5">
              {(['en', 'uz', 'ru'] as Locale[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => onChangeLocale(l)}
                  className={`px-2 py-0.5 rounded text-xs font-medium uppercase cursor-pointer ${
                    locale === l
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md p-0.5">
              {(['USD', 'UZS'] as Currency[]).map((curr) => (
                <button
                  key={curr}
                  type="button"
                  onClick={() => onChangeCurrency(curr)}
                  className={`px-2 py-0.5 rounded text-xs font-mono font-medium cursor-pointer ${
                    currency === curr
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {curr}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onToggleDarkMode}
              aria-label="Switch color theme"
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>

            {!user ? (
              <button
                type="button"
                onClick={() => onNavigateAuth('login')}
                className="font-semibold text-slate-800 dark:text-slate-200 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t(locale, 'sign_in')}
              </button>
            ) : (
              <button
                type="button"
                onClick={onEnterWorkspace}
                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                {user.full_name}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Subpages: About, Terms, Privacy, Contact */}
      {subPage !== 'landing' ? (
        <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-16">
          <button
            type="button"
            onClick={() => setSubPage('landing')}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline mb-6 cursor-pointer"
          >
            в†ђ Return to Home
          </button>

          {subPage === 'about' && (
            <article className="space-y-6">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                About MindQuest AI
              </h1>
              <p className="text-base leading-relaxed text-slate-600 dark:text-slate-300">
                MindQuest AI is an international adaptive English learning platform engineered to solve the gap between passive vocabulary memorization and spontaneous spoken fluency. Instead of isolated flashcards, MindQuest AI connects every word, roleplay conversation, and grammar deduction inside one unified learning profile.
              </p>
              <div className="grid sm:grid-cols-2 gap-6 pt-4">
                <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <h2 className="text-lg font-semibold mb-2">Trilingual Accessibility</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Full interface support in English, Uzbek, and Russian with dual USD and UZS pricing transparency and localized explanations.
                  </p>
                </div>
                <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <h2 className="text-lg font-semibold mb-2">Server-Enforced Integrity</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    All AI usage quotas, payment webhooks, and grammatical assessments run server-side with transparent credit accounting and zero fabricated scores.
                  </p>
                </div>
              </div>
            </article>
          )}

          {subPage === 'terms' && (
            <article className="space-y-5">
              <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
              <p className="text-xs text-slate-500">Effective Date: November 2026 В· MindQuest AI</p>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                1. Educational Purpose Only: Mood Mode adapts English vocabulary and reading passages to general study preferences. MindQuest AI does not provide medical, psychological, or mental health advice or diagnosis.
              </p>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                2. Subscriptions, Quotas & Billing: Paid tiers (Basic, Premium, Pro, Yearly) grant monthly AI credit allowances and daily feature quotas as published on the Pricing schedule. Upgrades take effect upon verified server webhook confirmation. Cancellations stop future renewals at the end of the active billing cycle.
              </p>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                3. Fair Usage & Security: Automated scraping, credential sharing, or attempts to bypass server-side quota enforcement may result in account suspension.
              </p>
            </article>
          )}

          {subPage === 'privacy' && (
            <article className="space-y-5">
              <h1 className="text-3xl font-bold tracking-tight">Privacy Policy & Data Minimization</h1>
              <p className="text-xs text-slate-500">GDPR & Child Privacy Compliant В· MindQuest AI</p>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                1. Minimal Personal Data: We collect only your name, email address, hashed password, CEFR level, and learning interactions needed to personalize your curriculum. Raw payment card numbers and CVV codes never touch MindQuest AI servers.
              </p>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                2. Minor & Parental Consent Protections: Learners under 18 must supply a verified parent or guardian email and explicit consent during registration.
              </p>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                3. Self-Service Account Erasure: You may permanently delete your profile, conversation logs, and vocabulary history at any time from Dashboard в†’ Profile & Security.
              </p>
            </article>
          )}

          {subPage === 'contact' && (
            <section className="max-w-xl space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Contact & Institutional Inquiries</h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Reach our team for school/university seat licenses, billing assistance, or partnership support.
                </p>
              </div>
              {contactSent ? (
                <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    Your inquiry has been logged in our support queue. Our team responds within one business day.
                  </p>
                </div>
              ) : (
                <form onSubmit={submitContact} className="space-y-4 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
                  {contactErr && <p className="text-xs text-red-600 dark:text-red-400">{contactErr}</p>}
                  <div>
                    <label className="block text-xs font-medium mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Topic</label>
                    <select
                      value={contactTopic}
                      onChange={(e) => setContactTopic(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option>Enterprise / University Licensing</option>
                      <option>Subscription & Billing Support</option>
                      <option>Affiliate & Teacher Partnership</option>
                      <option>Technical Feedback</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Message</label>
                    <textarea
                      required
                      rows={4}
                      value={contactMsg}
                      onChange={(e) => setContactMsg(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <button
                    type="submit"
                    className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg cursor-pointer"
                  >
                    Send Message
                  </button>
                </form>
              )}
            </section>
          )}
        </main>
      ) : (
        <main className="flex-1">
          {/* 1. HERO SECTION вЂ” 2-column balanced split + full-width 4-column architecture strip below */}
          <section className="max-w-7xl mx-auto px-6 pt-12 pb-16 lg:pt-16 lg:pb-20">
            <div className="grid lg:grid-cols-12 gap-10 items-stretch">
              <div className="lg:col-span-6 flex flex-col justify-center">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-4">
                  Mood-Adaptive Vocabulary В· Real-Life RPG В· Grammar Mysteries
                </p>
                <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.12] text-balance">
                  {t(locale, 'hero_title')}
                </h1>
                <p className="mt-5 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                  {t(locale, 'hero_subtitle')}
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => (user ? onEnterWorkspace() : onNavigateAuth('register'))}
                    className="py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>{user ? t(locale, 'cta_open_workspace') : t(locale, 'hero_primary')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection('interactive-demo')}
                    className="py-3 px-5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 text-slate-800 dark:text-slate-200 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {t(locale, 'hero_secondary')}
                  </button>
                </div>

                <p className="mt-5 text-xs text-slate-500 dark:text-slate-400">
                  Free starter plan included В· Instant Uzbek & Russian glossaries В· Cancel anytime
                </p>
              </div>

              <div className="lg:col-span-6">
                <div className="relative h-full min-h-[320px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                  <ImageWithFallback
                    src={HERO_IMG}
                    alt="International learners practicing spoken English in a modern study studio"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-6">
                    <p className="text-xs text-slate-300 font-mono tabular-nums">
                      CEFR A1вЂ“C1 В· 9 Real-Life RPG Scenarios В· 9 Grammar Investigation Topics
                    </p>
                    <p className="text-white text-base font-semibold mt-1">
                      Words saved in Mood Mode appear automatically inside your next Simulator conversation.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Full-width 4-column Architectural Scope Strip */}
            <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 lg:grid-cols-4 gap-8">
              <div>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">8 Moods</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Emotion-adaptive vocabulary, IPA audio, flashcards & comprehension stories
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">9 Scenarios</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Airport, hotel, job interview, university, business & travel roleplay
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">9 Grammar Domains</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Tenses, conditionals, passive voice & articles tested via mystery cases
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">3 Languages</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  English, Uzbek & Russian interface with USD and UZS billing display
                </p>
              </div>
            </div>
          </section>

          {/* 2. INTERACTIVE MECHANISM DEMONSTRATION */}
          <section id="interactive-demo" className="py-16 bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800">
            <div className="max-w-7xl mx-auto px-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                <div>
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2">
                    Interactive Product Demonstration
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-balance">
                    Experience how one profile powers three connected modes
                  </h2>
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 self-start">
                  <button
                    type="button"
                    onClick={() => setPreviewTab('mood')}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      previewTab === 'mood'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    01. Mood Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('simulator')}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      previewTab === 'simulator'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    02. Simulator RPG
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('detective')}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      previewTab === 'detective'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    03. Detective Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('game')}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      previewTab === 'game'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    04. Visual Quest & Game
                  </button>
                </div>
              </div>

              {previewTab === 'mood' && (
                <div className="grid lg:grid-cols-12 gap-8 items-center">
                  <div className="lg:col-span-7 space-y-5">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Selected Mood: Stressed В· Target Level: B2 В· Uzbek Translation Enabled
                    </p>
                    <h3 className="text-xl font-bold">
                      composure <span className="font-mono text-sm font-normal text-slate-500">/kЙ™mЛ€pЙ™КЉ.К’Й™r/ В· noun</span>
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Definition: The state of remaining calm and in control of oneself during high-pressure moments.
                    </p>
                    <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                      Uzbek: ogвЂir-bosiqlik, xotirjamlik В· Russian: РІС‹РґРµСЂР¶РєР°, СЃРїРѕРєРѕР№СЃС‚РІРёРµ
                    </p>
                    <p className="text-sm italic text-slate-600 dark:text-slate-400">
                      вЂњKeeping composure at a busy airport gate makes flight rebooking much easier.вЂќ
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => speakEnglishText('Composure. Keeping composure at a busy airport gate makes flight rebooking much easier.')}
                        className="py-2 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Volume2 className="w-4 h-4" />
                        <span>Play Pronunciation</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => (user ? onEnterWorkspace() : onNavigateAuth('register'))}
                        className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        Practice All 8 Moods
                      </button>
                    </div>
                  </div>
                  <div className="lg:col-span-5">
                    <ImageWithFallback
                      src={MOOD_IMG}
                      alt="Open English study journal and wireless headphones on sunlit travertine table"
                      className="w-full aspect-[4/3] object-cover rounded-xl border border-slate-200 dark:border-slate-800"
                    />
                  </div>
                </div>
              )}

              {previewTab === 'simulator' && (
                <div className="grid lg:grid-cols-12 gap-8 items-center">
                  <div className="lg:col-span-7 space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Scenario: Heathrow Terminal 5 Transfer Desk В· Active Mood Vocab Target: composure, itinerary
                    </p>
                    <div className="space-y-3 py-2">
                      <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <p className="text-xs font-semibold text-slate-500 mb-1">Airline Concierge (Claire)</p>
                        <p className="text-sm">
                          вЂњGood afternoon! Your inbound flight arrived 45 minutes late. How can I assist with your onward connection today?вЂќ
                        </p>
                      </div>
                      <div className="p-4 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                          Learner Reply В· Reused Mood Word: itinerary (+12 Bonus XP)
                        </p>
                        <p className="text-sm">
                          вЂњHello! According to my itinerary, I missed flight BA-402. Could we move my seat to the evening departure?вЂќ
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => (user ? onEnterWorkspace() : onNavigateAuth('register'))}
                      className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      Launch Full Voice & Text Simulator
                    </button>
                  </div>
                  <div className="lg:col-span-5">
                    <ImageWithFallback
                      src={SIM_IMG}
                      alt="International travelers speaking with an airport concierge"
                      className="w-full aspect-[4/3] object-cover rounded-xl border border-slate-200 dark:border-slate-800"
                    />
                  </div>
                </div>
              )}

              {previewTab === 'detective' && (
                <div className="grid lg:grid-cols-12 gap-8 items-center">
                  <div className="lg:col-span-7 space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Case File: The Vanishing Prototype at Gate B14 В· Grammar Focus: Past Perfect vs Present Perfect
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Security cameras froze at 20:45. Examine Suspect Nadia VanceвЂ™s sworn statement:
                    </p>
                    <blockquote className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono">
                      вЂњWhen the lights flickered at 20:45, I have already returned the cabinet key since two hours, so I knew the prototype was gone.вЂќ
                    </blockquote>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Clue detected: Broken Present Perfect with a finished past anchor (вЂњat 20:45вЂќ) + вЂњsince two hoursвЂќ instead of вЂњfor two hoursвЂќ + impossible knowledge before 21:05 discovery.
                    </p>
                    <button
                      type="button"
                      onClick={() => (user ? onEnterWorkspace() : onNavigateAuth('register'))}
                      className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      Solve Full Mystery Cases
                    </button>
                  </div>
                  <div className="lg:col-span-5">
                    <ImageWithFallback
                      src={DET_IMG}
                      alt="Investigator desk with red timeline connections and brass magnifying glass"
                      className="w-full aspect-[4/3] object-cover rounded-xl border border-slate-200 dark:border-slate-800"
                    />
                  </div>
                </div>
              )}

              {previewTab === 'game' && (
                <div className="grid lg:grid-cols-12 gap-8 items-center">
                  <div className="lg:col-span-7 space-y-4">
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                      Visual Hotspot Discovery В· 45s Speed Match Arena В· Direct XP Rewards
                    </p>
                    <h3 className="text-xl font-bold">
                      Interactive Illustrated Clue Hunting & Word Match Arena
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      Investigate high-resolution 4K illustrated scenes across OxfordвЂ™s Archival Library, a Silicon Valley AI Robotics Lab, and a European Bistro. Tap clickable coordinate hotspots to solve contextual vocabulary riddles, hear native pronunciations, and test rapid recall in the 45-second Speed Match Arena.
                    </p>
                    <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900 dark:text-white">Active Scene Clue: Astrolabe & Celestial Globe</span>
                        <span className="text-xs font-mono font-bold text-amber-500">+100 XP</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">
                        Target Word: <span className="font-mono font-bold text-blue-600 dark:text-blue-400">parchment</span> В· Uzbek: <span className="font-medium text-slate-900 dark:text-white">pergament, qadimiy qogвЂoz</span>
                      </p>
                      <p className="text-slate-500 italic">
                        Riddle: вЂњI am durable skin treated for ancient texts before modern pulp papers. What am I?вЂќ
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => (user ? onEnterWorkspace() : onNavigateAuth('register'))}
                        className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        Play Visual Quest Arena
                      </button>
                    </div>
                  </div>
                  <div className="lg:col-span-5">
                    <ImageWithFallback
                      src={GAME_IMG}
                      alt="Gothic Oxford archival library with stained glass windows and glowing study lanterns"
                      className="w-full aspect-[4/3] object-cover rounded-xl border border-slate-200 dark:border-slate-800"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 3. CORE CAPABILITIES & HOW IT WORKS (Asymmetric Editorial Numbering) */}
          <section id="features" className="max-w-7xl mx-auto px-6 py-20">
            <div className="max-w-2xl mb-12">
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2">
                Unified AI Learning Architecture
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-balance">
                Five connected engines designed for measurable English retention
              </h2>
            </div>

            <div id="how-it-works" className="grid md:grid-cols-3 gap-6">
              <div className="md:col-span-2 p-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                    Step 1 в†’ Step 2 В· Vocabulary Transfer
                  </p>
                  <h3 className="text-xl font-bold mb-2">01. Emotion-Adaptive Mood Mode</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Choose optional moodsвЂ”Happy, Sad, Tired, Motivated, Relaxed, Curious, Confident, or Stressed. MindQuest AI selects CEFR-matched vocabulary with IPA audio, Uzbek and Russian translations, flashcards, and short comprehension stories without ever making psychological claims.
                  </p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                  Saved words automatically populate your Simulator RPG mission targets.
                </p>
              </div>

              <div className="p-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                    Step 2 в†’ Step 3 В· Spoken Fluency
                  </p>
                  <h3 className="text-xl font-bold mb-2">02. Real-Life RPG Simulator</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Speak or type through 9 realistic scenariosвЂ”from customs desks to executive negotiationsвЂ”with speech-to-text, neural TTS, and honest turn-by-turn grammar feedback.
                  </p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                  Spoken grammar slips are logged for targeted remediation.
                </p>
              </div>

              <div className="p-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                    Step 3 в†’ Mastery В· Deductive Grammar
                  </p>
                  <h3 className="text-xl font-bold mb-2">03. Grammar Detective Mysteries</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Convert your real Simulator mistakes into custom mystery investigations across tenses, conditionals, articles, passive voice, and reported speech.
                  </p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                  Server-validated culprit logic prevents guesswork.
                </p>
              </div>

              <div className="p-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                <div>
                  <p className="text-xs text-amber-500 dark:text-amber-400 font-semibold mb-2">
                    Visual Exploration & Gamification
                  </p>
                  <h3 className="text-xl font-bold mb-2">04. Visual Quest & Match Arena</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Explore intricate visual locations, click hidden clue coordinates, answer forensic grammar riddles, and play the 45-second rapid Speed Word Match Arena with combo multipliers.
                  </p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                  Solved clues immediately deposit into your global vocabulary bank.
                </p>
              </div>

              <div className="md:col-span-2 p-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                    24/7 Bilingual Coaching В· EN & UZ
                  </p>
                  <h3 className="text-xl font-bold mb-2">05. Bilingual AI Teacher & Personalized Study Plans</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Ask any grammar or phrasing question, submit sentences for instant correction, practice IPA stress patterns, and generate weekly study plans grounded strictly in your recorded retention, grammar, reading, and speaking history.
                  </p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                  Protected by transparent daily & monthly credit meters.
                </p>
              </div>
            </div>
          </section>

          {/* 4. PRICING & QUOTA COMPARISON */}
          <section id="pricing" className="py-20 bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800">
            <div className="max-w-7xl mx-auto px-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                <div>
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2">
                    Transparent Subscriptions В· Stripe, Payme & Click Ready
                  </p>
                  <h2 className="text-3xl font-bold tracking-tight">
                    Choose the plan matched to your study pace
                  </h2>
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 self-start">
                  {(['all', 'monthly', 'annual'] as const).map((cadence) => (
                    <button
                      key={cadence}
                      type="button"
                      onClick={() => setBillingFilter(cadence)}
                      className={`px-3.5 py-1.5 text-xs font-semibold rounded-md capitalize cursor-pointer ${
                        billingFilter === cadence
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {cadence === 'all' ? 'All Plans' : cadence}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-5">
                {displayedPlans.map((plan) => {
                  const featured = plan.id === 'PREMIUM';
                  return (
                    <div
                      key={plan.id}
                      className={`p-6 rounded-xl flex flex-col justify-between border ${
                        featured
                          ? 'border-blue-600 dark:border-blue-500 bg-slate-50/70 dark:bg-slate-950'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50'
                      }`}
                    >
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                          {plan.billing_interval === 'year' ? 'Annual Pass В· Save 25%' : 'Monthly Tier'}
                        </p>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 min-h-[32px]">
                          {plan.tagline}
                        </p>

                        <div className="my-5">
                          <span className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                            {formatMoney(plan.price_usd, plan.price_uzs, currency, rate)}
                          </span>
                          <span className="text-xs text-slate-500 ml-1">
                            /{plan.billing_interval === 'year' ? 'yr' : 'mo'}
                          </span>
                        </div>

                        <ul className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-800 pt-4 font-mono tabular-nums">
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{plan.monthly_ai_credits} AI credits / mo</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{plan.daily_vocab_limit} Mood words / day</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{plan.daily_simulator_turns} RPG turns / day</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{plan.daily_detective_cases} Detective cases / day</span>
                          </li>
                          <li className="flex items-center gap-2 font-sans">
                            <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>
                              {plan.has_ai_teacher ? 'Full Bilingual AI Teacher' : `${plan.daily_ai_teacher_msgs} Teacher previews/day`}
                            </span>
                          </li>
                          {plan.trial_days > 0 && (
                            <li className="flex items-center gap-2 font-sans text-blue-600 dark:text-blue-400">
                              <Check className="w-3.5 h-3.5 shrink-0" />
                              <span>{plan.trial_days}-day configurable trial</span>
                            </li>
                          )}
                        </ul>
                      </div>

                      <button
                        type="button"
                        onClick={() => (user ? onEnterWorkspace() : onNavigateAuth('register'))}
                        className={`mt-6 w-full py-2.5 px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          featured
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white'
                        }`}
                      >
                        {plan.price_usd === 0 ? 'Start Free' : `Select ${plan.name}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 5. CLEARLY LABELED DEMO TESTIMONIALS */}
          <section className="max-w-7xl mx-auto px-6 py-16">
            <div className="mb-8">
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">
                {t(locale, 'demo_notice')}
              </p>
              <h2 className="text-2xl font-bold tracking-tight">
                Illustrative learner workflows (Demo Examples)
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  quote:
                    'Before preparing for international product interviews, I memorized word lists I never used aloud. Seeing my Mood Mode words appear as live objectives inside the Job Interview simulator helped me use them naturally.',
                  author: 'Sardor T. (Demo Persona)',
                  role: 'Product Manager В· Tashkent В· B1 в†’ B2 Workflow Example',
                },
                {
                  quote:
                    'Turning my own past-perfect errors from the Airport Simulator into a Detective mystery case made the timeline rule click immediately instead of repeating fill-in-the-blank drills.',
                  author: 'Dildora M. (Demo Persona)',
                  role: 'Masters Applicant В· Samarkand В· IELTS Prep Workflow Example',
                },
                {
                  quote:
                    'Our training cohort uses team invite codes and bilingual Uzbek/English AI Teacher explanations so junior engineers can practice client calls confidently.',
                  author: 'bekzod R. (Demo Persona)',
                  role: 'Engineering Team Lead В· Team Seat License Example',
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
                >
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">вЂњ{item.quote}вЂќ</p>
                  <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">{item.author}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 6. FAQ ACCORDION */}
          <section id="faq" className="max-w-4xl mx-auto px-6 py-16">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-8">
              Frequently Asked Questions
            </h2>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
              {[
                {
                  q: 'How do Mood Mode, Simulator Mode, and Detective Mode share one learning brain?',
                  a: 'Words you review in Mood Mode are stored in your personal vocabulary bank and injected into Simulator RPG conversations. Grammar mistakes made during Simulator dialogues are logged and can be converted into custom Detective mystery cases.',
                },
                {
                  q: 'Which payment methods are supported for Uzbekistan and international learners?',
                  a: 'MindQuest AI includes modular server-side payment flows for Stripe (international USD cards) as well as Payme and Click (UZS payments in Uzbekistan), complete with cryptographic webhook signature verification and sandbox test modes.',
                },
                {
                  q: 'Does Mood Mode perform psychological or mental health assessments?',
                  a: 'No. Mood selection is optional and strictly adapts English vocabulary themes and story tone (such as calm travel stories when Relaxed or action-oriented business phrasing when Motivated).',
                },
                {
                  q: 'Can schools, teachers, or companies purchase multi-seat plans?',
                  a: 'Yes. Inside Dashboard в†’ Referrals & Team, organizations can generate multi-seat invite codes, redeem gift subscriptions, or apply for approved affiliate commissions.',
                },
              ].map((item, idx) => (
                <div key={idx} className="py-4">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full flex items-center justify-between gap-4 text-left text-sm font-semibold text-slate-900 dark:text-white py-1 cursor-pointer"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 shrink-0 transition-transform ${
                        openFaq === idx ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {openFaq === idx && (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {item.a}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </main>
      )}

      {/* QUIET FOOTER */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs text-slate-500 dark:text-slate-400">
          <div>
            <p className="font-bold text-slate-900 dark:text-white text-sm">MindQuest AI</p>
            <p className="mt-1">В© {new Date().getFullYear()} MindQuest AI. International Adaptive English SaaS.</p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <button type="button" onClick={() => setSubPage('about')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer">
              About
            </button>
            <button type="button" onClick={() => setSubPage('contact')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer">
              Contact
            </button>
            <button type="button" onClick={() => setSubPage('terms')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer">
              Terms
            </button>
            <button type="button" onClick={() => setSubPage('privacy')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer">
              Privacy
            </button>
            <button
              type="button"
              onClick={() => onNavigateAuth('admin_login')}
              className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Admin Portal
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

