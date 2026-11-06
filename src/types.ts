export type Locale = 'en' | 'uz' | 'ru';
export type Currency = 'USD' | 'UZS';
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'expired'
  | 'pending'
  | 'unpaid';

export type PlanId = 'FREE' | 'BASIC' | 'PREMIUM' | 'PRO' | 'YEARLY';

export type MoodName =
  | 'Happy'
  | 'Sad'
  | 'Tired'
  | 'Motivated'
  | 'Relaxed'
  | 'Curious'
  | 'Confident'
  | 'Stressed';

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  billing_interval: 'month' | 'year';
  price_usd: number;
  price_uzs: number;
  annual_discount_pct: number;
  trial_days: number;
  daily_vocab_limit: number;
  daily_story_limit: number;
  daily_simulator_turns: number;
  daily_detective_cases: number;
  daily_ai_teacher_msgs: number;
  monthly_voice_minutes: number;
  monthly_ai_credits: number;
  has_ai_teacher: number | boolean;
  has_voice_mode: number | boolean;
  has_advanced_analytics: number | boolean;
  has_personalized_plan: number | boolean;
  is_active: number | boolean;
}

export interface UserProfile {
  cefr_level: string;
  current_mood: MoodName;
  daily_goal_minutes: number;
  xp: number;
  streak_days: number;
  last_activity_date: string | null;
  retention_score: number;
  grammar_score: number;
  speaking_score: number;
  pronunciation_score: number;
  reading_score: number;
  personalized_plan_json: string | null;
}

export interface SubscriptionRecord {
  id: string;
  user_id: string;
  plan_id: PlanId;
  status: SubscriptionStatus;
  provider: string;
  current_period_start: string;
  current_period_end: string;
  trial_ends_at: string | null;
  cancel_at_period_end: number;
  scheduled_downgrade_plan_id: string | null;
}

export interface CreditsRecord {
  monthly_allowance: number;
  monthly_used: number;
  bonus_credits: number;
  daily_vocab_used: number;
  daily_story_used: number;
  daily_simulator_used: number;
  daily_detective_used: number;
  daily_teacher_used: number;
  monthly_voice_seconds_used: number;
  last_daily_reset: string;
  last_monthly_reset: string;
}

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: 'learner' | 'moderator' | 'support' | 'super_admin';
  email_verified: number;
  two_factor_enabled: number;
  age_bracket: string;
  parent_email: string | null;
  parental_consent_verified: number;
  status: string;
  referral_code: string;
  preferred_locale: Locale;
  preferred_currency: Currency;
  created_at: string;
  profile: UserProfile;
  subscription: SubscriptionRecord;
  plan: Plan;
  credits: CreditsRecord;
}

export interface VocabularyItem {
  id: string;
  word: string;
  phonetic: string;
  part_of_speech: string;
  cefr_level: string;
  mood_tag: MoodName;
  definition_en: string;
  translation_uz: string;
  translation_ru: string;
  example_en: string;
  example_uz: string;
  mastery_level?: number;
  used_in_simulator_count?: number;
}

export interface StoryQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface StoryItem {
  id: string;
  title: string;
  mood_tag: MoodName;
  cefr_level: string;
  content_en: string;
  summary_uz: string;
  vocabulary: Array<{ word: string; translation_uz: string }>;
  questions: StoryQuestion[];
  is_curated?: number;
  created_at?: string;
}

export interface ScenarioItem {
  id: string;
  category: string;
  title: string;
  role_ai: string;
  role_user: string;
  cefr_level: string;
  setting_description: string;
  opening_line: string;
  objectives: string[];
}

export interface SimulatorMessage {
  role: 'ai' | 'user';
  text: string;
  timestamp: string;
  feedback?: {
    grammar_ok: boolean;
    corrected?: string;
    grammar_topic?: string;
    explanation_en?: string;
    explanation_uz?: string;
    used_mood_vocab?: string[];
    pronunciation_tip?: string;
    score?: number;
  };
}

export interface DetectiveSuspect {
  id: string;
  name: string;
  occupation: string;
  alibi_time: string;
  statement: string;
}

export interface DetectiveEvidence {
  id: string;
  label: string;
  statement_with_clue: string;
  has_grammar_contradiction: boolean;
  grammar_note: string;
}

export interface DetectiveCase {
  id: string;
  title: string;
  grammar_topic: string;
  cefr_level: string;
  premise: string;
  timeline: Array<{ time: string; event: string }>;
  suspects: DetectiveSuspect[];
  evidence: DetectiveEvidence[];
  culprit_id?: string;
  grammar_smoking_gun?: string;
  explanation_en?: string;
  explanation_uz?: string;
  source_mistake_id?: string | null;
}

export interface MistakeItem {
  id: string;
  source_mode: string;
  grammar_topic: string;
  original_text: string;
  corrected_text: string;
  explanation_en: string;
  explanation_uz: string;
  resolved: number;
  converted_case_id: string | null;
  created_at: string;
}

export interface ProviderStatusMap {
  stripe: { configured: boolean; mode: 'live' | 'sandbox' | 'unconfigured' };
  payme: { configured: boolean; mode: 'live' | 'sandbox' | 'unconfigured'; checkoutUrl: string };
  click: { configured: boolean; mode: 'live' | 'sandbox' | 'unconfigured'; checkoutUrl: string };
  gemini: { configured: boolean; defaultModel: string; ttsModel: string };
  usdToUzsRate: number;
}

export interface VisualSceneHotspot {
  id: string;
  title: string;
  xPct: number;
  yPct: number;
  clueWord: string;
  phonetic: string;
  definitionEn: string;
  translationUz: string;
  grammarQuestion: string;
  options: string[];
  correctIndex: number;
  explanationEn: string;
  explanationUz: string;
  isUnlocked?: boolean;
}

export interface VisualScene {
  id: string;
  title: string;
  category: string;
  cefrLevel: string;
  imageSrc: string;
  briefing: string;
  objectiveEn: string;
  objectiveUz: string;
  hotspots: VisualSceneHotspot[];
}

export interface ArenaMatchCard {
  id: string;
  word: string;
  phonetic: string;
  translationUz: string;
  definitionEn: string;
  category: string;
}

