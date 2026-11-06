import React, { useState } from 'react';
import { GraduationCap, Send, Volume2, Sparkles, BookOpen, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { apiFetch, speakEnglishText } from '../api';
import { AuthUser } from '../types';
import { ImageWithFallback } from './ImageWithFallback';

const TEACHER_AVATAR_IMAGE = '/src/assets/images/teacher_mentor_prof_1793802712341.jpg';

interface AiTeacherViewProps {
  user: AuthUser;
  onUserUpdated: (u: AuthUser) => void;
}

export const AiTeacherView: React.FC<AiTeacherViewProps> = ({ user, onUserUpdated }) => {
  const [mode, setMode] = useState<'explain' | 'correct' | 'exercise' | 'study_plan'>('explain');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reply, setReply] = useState<{
    answer_en: string;
    summary_uz: string;
    pronunciation_guide: string;
    practice_question: string;
    practice_answer: string;
  } | null>(() => {
    if (user.profile.personalized_plan_json) {
      try {
        return JSON.parse(user.profile.personalized_plan_json);
      } catch {
        return null;
      }
    }
    return null;
  });

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const promptText =
      mode === 'study_plan' && !question.trim()
        ? 'Generate a concrete 7-day personalized English study plan based on my CEFR level, recorded scores, and unresolved mistakes.'
        : question.trim();

    if (!promptText) return;

    setLoading(true);
    setError(null);
    setShowAnswer(false);
    try {
      const res = await apiFetch<{ reply: any; user: AuthUser }>('/api/learning/teacher/ask', {
        method: 'POST',
        body: JSON.stringify({ question: promptText, mode }),
      });
      setReply(res.reply);
      onUserUpdated(res.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Visual AI Mentor Profile Card */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="grid md:grid-cols-12 items-stretch">
          <div className="md:col-span-5 relative min-h-[220px] md:min-h-full">
            <ImageWithFallback
              src={TEACHER_AVATAR_IMAGE}
              alt="Dr. Clara Alverez - Oxford Linguistics & Bilingual Pedagogy Mentor"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-black/80 via-black/30 to-transparent md:hidden" />
            <div className="absolute bottom-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/90 text-white text-[11px] font-semibold backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span>Live AI Tutor Online</span>
            </div>
          </div>

          <div className="md:col-span-7 p-6 sm:p-7 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  Oxford Pedagogy
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Daily Quota: {user.credits.daily_teacher_used}/{user.plan.daily_ai_teacher_msgs} msgs
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span>Dr. Clara Alverez</span>
                <CheckCircle2 className="w-5 h-5 text-blue-600 inline-block" />
              </h1>
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mt-0.5">
                Lead Bilingual Linguist · English, O‘zbek & Rus Tillarida Tushuntirish
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">
                Qoidalar, murakkab gaplar, zamonlar va talaffuz xatolarini tabiiy misollar bilan o‘rganing. Istagan inglizcha savolingizni bering yoki shaxsiy o‘quv rejangizni tuzing.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                <span>CEFR {user.profile.cefr_level} Aligned</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>IPA Stress Audio</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Real-Time Feedback</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'explain', label: 'Explain Rule (EN + UZ)' },
          { id: 'correct', label: 'Correct My Sentence' },
          { id: 'exercise', label: 'Targeted Practice Drill' },
          { id: 'study_plan', label: 'Personalized 7-Day Plan' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setMode(item.id as any)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
              mode === item.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <form
        onSubmit={handleAsk}
        className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
      >
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          {mode === 'correct'
            ? 'Paste the English sentence or paragraph you want corrected:'
            : mode === 'study_plan'
            ? 'Optional goal focus (e.g., Job Interview next week, IELTS Band 7.5, Travel fluency):'
            : 'Ask your English grammar, vocabulary, or pronunciation question:'}
        </label>
        <textarea
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            mode === 'correct'
              ? 'e.g. I am working in this company since three years and I look forward to meet you.'
              : mode === 'study_plan'
              ? 'Leave blank to use your current profile metrics automatically, or specify an upcoming exam/interview...'
              : 'e.g. When should I use "have been doing" instead of "have done"?'
          }
          className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          type="submit"
          disabled={loading}
          className="py-2.5 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{loading ? 'Consulting AI Teacher...' : mode === 'study_plan' ? 'Build Personalized Plan' : 'Ask AI Teacher'}</span>
        </button>
      </form>

      {reply && (
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold">AI Teacher Guidance</h2>
            </div>
            <button
              type="button"
              onClick={() => speakEnglishText(reply.answer_en)}
              className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Listen in English</span>
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500">English Explanation</p>
            <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed">
              {reply.answer_en}
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">O‘zbekcha Tushuntirish (Uzbek)</p>
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
              {reply.summary_uz}
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-1">
            <p className="text-xs font-semibold text-slate-500">Pronunciation & Stress Tip</p>
            <p className="text-xs font-mono text-slate-700 dark:text-slate-300">{reply.pronunciation_guide}</p>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <p className="text-xs font-semibold text-slate-900 dark:text-white">Quick Check Exercise</p>
            <p className="text-sm text-slate-700 dark:text-slate-300">{reply.practice_question}</p>
            <button
              type="button"
              onClick={() => setShowAnswer(!showAnswer)}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {showAnswer ? 'Hide Suggested Answer' : 'Reveal Suggested Answer'}
            </button>
            {showAnswer && (
              <p className="text-xs font-mono text-emerald-700 dark:text-emerald-400 pt-1">
                Answer: {reply.practice_answer}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
