import React, { useEffect, useState } from 'react';
import { BookOpen, Check, Layers, Plus, RefreshCw, Volume2, Sparkles } from 'lucide-react';
import { apiFetch, speakEnglishText } from '../api';
import { AuthUser, MoodName, StoryItem, VocabularyItem } from '../types';
import { ImageWithFallback } from './ImageWithFallback';

const MOODS: MoodName[] = [
  'Happy',
  'Sad',
  'Tired',
  'Motivated',
  'Relaxed',
  'Curious',
  'Confident',
  'Stressed',
];

const MOOD_META: Record<
  MoodName,
  {
    imageSrc: string;
    atmosphereTitle: string;
    atmosphereSubtitle: string;
    taglineUz: string;
    tonePill: string;
  }
> = {
  Happy: {
    imageSrc: '/src/assets/images/mode_mood_storytelling_1793797335990.jpg',
    atmosphereTitle: 'Sunlit Studio & Uplifting Expression',
    atmosphereSubtitle: 'Vibrant CEFR vocabulary for joyous celebrations, creative momentum, and warm social storytelling.',
    taglineUz: 'Quvonchli va ko‘tarinki ruhdagi so‘zlar, iboralar va yorqin hikoyalar',
    tonePill: 'Radiant · Energetic · Celebratory',
  },
  Motivated: {
    imageSrc: '/src/assets/images/mood_motivated_dawn_1793802031724.jpg',
    atmosphereTitle: 'Sunrise Skyline & High Ambition',
    atmosphereSubtitle: 'Action verbs, milestones, and resolute phrasing designed for career growth and language mastery.',
    taglineUz: 'Muvaffaqiyat, qat’iyat va yuksak maqsadlar sari undovchi lug‘at',
    tonePill: 'Resolute · Driven · Goal Mastery',
  },
  Confident: {
    imageSrc: '/src/assets/images/sim_job_interview_1793801965758.jpg',
    atmosphereTitle: 'Boardroom Poise & Executive Persuasion',
    atmosphereSubtitle: 'Authoritative rhetoric, persuasive argumentation, and decisive international presentation phrases.',
    taglineUz: 'Ishonchli muloqot, rahbarlik nutqi va professional muzokara iboralari',
    tonePill: 'Assertive · Eloquent · Authoritative',
  },
  Curious: {
    imageSrc: '/src/assets/images/scene_oxford_gothic_library_1793800920229.jpg',
    atmosphereTitle: 'Archival Vault & Intellectual Discovery',
    atmosphereSubtitle: 'Scholarly idioms, academic analytical frameworks, and deep inquiry questioning structures.',
    taglineUz: 'Ilmiy tahlil, sinchkovlik va qiziquvchan tadqiqotlar lug‘ati',
    tonePill: 'Investigative · Scholarly · Wonder',
  },
  Relaxed: {
    imageSrc: '/src/assets/images/mood_calm_evening_1793802048973.jpg',
    atmosphereTitle: 'Rainy Sanctuary & Serene Reflection',
    atmosphereSubtitle: 'Tranquil descriptors, mindful idioms, and leisurely conversational storytelling patterns.',
    taglineUz: 'Xotirjam muhit, shinam oqshom va sokin mutolaa uchun iboralar',
    tonePill: 'Tranquil · Mindful · Peaceful',
  },
  Tired: {
    imageSrc: '/src/assets/images/mood_calm_evening_1793802048973.jpg',
    atmosphereTitle: 'Low-Stress Study & Gentle Recall',
    atmosphereSubtitle: 'Bite-sized micro-flashcards and low-cognitive-load vocabulary designed to prevent fatigue.',
    taglineUz: 'Holsizlik paytida oson o‘zlashtiriladigan mikrodarslar va qulay so‘zlar',
    tonePill: 'Low-Effort · Restful · Gentle',
  },
  Sad: {
    imageSrc: '/src/assets/images/mood_calm_evening_1793802048973.jpg',
    atmosphereTitle: 'Solace & Empathetic Narrative',
    atmosphereSubtitle: 'Reflective prose, emotional resilience vocabulary, and deeply compassionate idioms.',
    taglineUz: 'G‘amginlikda taskin beruvchi va ruhiy bardoshlilikni ifodalovchi so‘zlar',
    tonePill: 'Empathetic · Reflective · Solace',
  },
  Stressed: {
    imageSrc: '/src/assets/images/scene_zurich_bistro_1793800922188.jpg',
    atmosphereTitle: 'Composure & De-escalation Mastery',
    atmosphereSubtitle: 'Diplomatic phrasing, polite boundary setting, and keeping self-control under pressure.',
    taglineUz: 'Bosim ostida xotirjamlikni saqlash, og‘ir-bosiqlik va diplomatik nutq',
    tonePill: 'Composure · Grounding · Balance',
  },
};

interface MoodModeViewProps {
  user: AuthUser;
  onUserUpdated: (u: AuthUser) => void;
  onLaunchSimulatorWithWords: () => void;
}

export const MoodModeView: React.FC<MoodModeViewProps> = ({
  user,
  onUserUpdated,
  onLaunchSimulatorWithWords,
}) => {
  const [selectedMood, setSelectedMood] = useState<MoodName>(user.profile.current_mood || 'Curious');
  const [subTab, setSubTab] = useState<'vocab' | 'flashcards' | 'stories'>('vocab');
  const [words, setWords] = useState<VocabularyItem[]>([]);
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [savedBank, setSavedBank] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Flashcard state
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // Story comprehension quiz state
  const [selectedStoryIndex, setSelectedStoryIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const loadMoodContent = async (mood: MoodName) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        words: VocabularyItem[];
        stories: StoryItem[];
        savedBank: VocabularyItem[];
      }>(`/api/learning/mood/content?mood=${encodeURIComponent(mood)}`);
      setWords(res.words);
      setStories(res.stories);
      setSavedBank(res.savedBank);
      setCardIndex(0);
      setFlipped(false);
      setSelectedStoryIndex(0);
      setAnswers({});
      setQuizSubmitted(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMoodContent(selectedMood);
  }, [selectedMood]);

  const handleGenerateAiVocab = async () => {
    setAiGenerating(true);
    setError(null);
    try {
      const res = await apiFetch<{ words: VocabularyItem[]; user: AuthUser }>(
        '/api/learning/mood/generate-vocab',
        {
          method: 'POST',
          body: JSON.stringify({ mood: selectedMood }),
        }
      );
      setWords((prev) => [...res.words, ...prev]);
      onUserUpdated(res.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleGenerateAiStory = async () => {
    setAiGenerating(true);
    setError(null);
    try {
      const res = await apiFetch<{ story: StoryItem; user: AuthUser }>(
        '/api/learning/mood/generate-story',
        {
          method: 'POST',
          body: JSON.stringify({ mood: selectedMood }),
        }
      );
      setStories((prev) => [res.story, ...prev]);
      setSelectedStoryIndex(0);
      setAnswers({});
      setQuizSubmitted(false);
      onUserUpdated(res.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleReviewWord = async (vocabId: string, remembered: boolean) => {
    try {
      const res = await apiFetch<{ masteryLevel: number; user: AuthUser }>(
        '/api/learning/mood/review-word',
        {
          method: 'POST',
          body: JSON.stringify({ vocabularyId: vocabId, remembered }),
        }
      );
      setWords((prev) =>
        prev.map((w) => (w.id === vocabId ? { ...w, mastery_level: res.masteryLevel } : w))
      );
      onUserUpdated(res.user);
      if (subTab === 'flashcards' && words.length > 0) {
        setFlipped(false);
        setCardIndex((prev) => (prev + 1) % words.length);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const activeStory = stories[selectedStoryIndex] || null;

  const submitQuiz = async () => {
    if (!activeStory) return;
    let correct = 0;
    activeStory.questions.forEach((q, idx) => {
      if (answers[idx] === q.correctIndex) correct += 1;
    });
    setQuizSubmitted(true);
    try {
      const res = await apiFetch<{ user: AuthUser }>('/api/learning/mood/submit-quiz', {
        method: 'POST',
        body: JSON.stringify({
          correctCount: correct,
          totalQuestions: activeStory.questions.length,
        }),
      });
      onUserUpdated(res.user);
    } catch {}
  };

  const currentMoodMeta = MOOD_META[selectedMood] || MOOD_META.Happy;

  return (
    <div className="space-y-8">
      {/* Header & Optional Mood Selector */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            CEFR {user.profile.cefr_level} · Daily Vocab Quota: {user.credits.daily_vocab_used}/{user.plan.daily_vocab_limit} · Educational Adaptation Only
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Mood-Adaptive Vocabulary & Stories
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Select an optional study mood to adapt vocabulary tone, Uzbek glossaries, flashcards, and short fiction.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 self-start">
          <button
            type="button"
            onClick={() => setSubTab('vocab')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
              subTab === 'vocab'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Vocabulary ({words.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('flashcards')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
              subTab === 'flashcards'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Flashcards
          </button>
          <button
            type="button"
            onClick={() => setSubTab('stories')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
              subTab === 'stories'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Stories ({stories.length})
          </button>
        </div>
      </div>

      {/* 8 Mood Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {MOODS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setSelectedMood(m)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
              selectedMood === m
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Dynamic Visual Atmosphere Card for Selected Mood */}
      {MOOD_META[selectedMood] && (
        <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="grid lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-7 p-6 sm:p-7 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
                    <Sparkles className="w-3 h-3" />
                    <span>Current Mood Atmosphere: {selectedMood}</span>
                  </span>
                  <span className="text-xs font-mono text-slate-500">
                    {MOOD_META[selectedMood].tonePill}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {MOOD_META[selectedMood].atmosphereTitle}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                  {MOOD_META[selectedMood].atmosphereSubtitle}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-2">
                  🇺🇿 {MOOD_META[selectedMood].taglineUz}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <button
                  type="button"
                  disabled={aiGenerating}
                  onClick={handleGenerateAiVocab}
                  className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  {aiGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>Generate 3 Words ({selectedMood})</span>
                </button>
                <button
                  type="button"
                  disabled={aiGenerating}
                  onClick={handleGenerateAiStory}
                  className="py-2 px-4 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Generate Story</span>
                </button>
                <button
                  type="button"
                  onClick={onLaunchSimulatorWithWords}
                  className="py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Practice in RPG →
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 relative min-h-[200px] lg:min-h-full">
              <ImageWithFallback
                src={MOOD_META[selectedMood].imageSrc}
                alt={MOOD_META[selectedMood].atmosphereTitle}
                className="w-full h-full object-cover min-h-[220px]"
              />
              <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-l from-transparent via-black/10 to-black/30 pointer-events-none" />
              <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded bg-black/60 backdrop-blur text-[11px] font-mono text-white/90">
                {selectedMood} Sanctuary
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* SUBTAB 1: VOCABULARY LIST */}
      {subTab === 'vocab' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Saved words in your unified bank: <span className="font-mono font-semibold text-slate-900 dark:text-white">{savedBank.length}</span>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={aiGenerating}
                onClick={handleGenerateAiVocab}
                className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                {aiGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Generate 3 AI Words ({selectedMood})</span>
              </button>
              <button
                type="button"
                onClick={onLaunchSimulatorWithWords}
                className="py-2 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Practice Saved Words in Simulator →
              </button>
            </div>
          </div>

          {loading ? (
            <div className="grid md:grid-cols-2 gap-4">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-44 rounded-xl bg-slate-100 dark:bg-slate-900 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {words.map((w) => (
                <div
                  key={w.id}
                  className="group rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between hover:shadow-lg transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700"
                >
                  <div>
                    {/* Visual Card Scene Header */}
                    <div className="relative h-24 w-full overflow-hidden bg-slate-950">
                      <ImageWithFallback
                        src={currentMoodMeta.imageSrc}
                        alt={w.word}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-80"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />
                      
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-600 text-white shadow-sm">
                          {w.cefr_level || 'B2'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/20 backdrop-blur text-white">
                          {w.part_of_speech}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => speakEnglishText(`${w.word}. ${w.example_en}`)}
                        aria-label={`Listen to ${w.word}`}
                        className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur text-white cursor-pointer transition-colors shadow-sm"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
                        <span className="text-[11px] font-mono text-blue-300">
                          {selectedMood} Tone
                        </span>
                        <span className="text-[11px] font-mono text-slate-300">
                          {w.phonetic}
                        </span>
                      </div>
                    </div>

                    <div className="p-5">
                      <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {w.word}
                      </h3>

                      <div className="mt-1.5 p-2 rounded-lg bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50">
                        <p className="text-xs font-bold text-blue-700 dark:text-blue-300">
                          🇺🇿 {w.translation_uz}
                        </p>
                        {w.translation_ru && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            🇷🇺 {w.translation_ru}
                          </p>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-3 leading-relaxed">
                        {w.definition_en}
                      </p>

                      <div className="mt-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
                        <p className="italic text-slate-700 dark:text-slate-300 font-medium">
                          “{w.example_en}”
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          — {w.example_uz}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 pt-0">
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 text-amber-500">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} className={i < (w.mastery_level || 0) ? 'text-amber-500 font-bold' : 'text-slate-300 dark:text-slate-700'}>
                            ★
                          </span>
                        ))}
                        <span className="text-[11px] text-slate-500 font-mono ml-1">
                          {w.mastery_level || 0}/5
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleReviewWord(w.id, true)}
                        className="inline-flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{w.mastery_level ? 'Mastered' : 'Save'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: SPACED-REPETITION FLASHCARDS */}
      {subTab === 'flashcards' && words.length > 0 && (
        <div className="max-w-xl mx-auto space-y-6">
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
            <span>
              Card {cardIndex + 1} of {words.length} · Mood: {selectedMood}
            </span>
            <button
              type="button"
              onClick={() => speakEnglishText(words[cardIndex].word)}
              className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 hover:underline cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Play Audio</span>
            </button>
          </div>

          <div
            onClick={() => setFlipped(!flipped)}
            className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md flex flex-col cursor-pointer select-none transition-transform hover:-translate-y-0.5"
          >
            {/* Visual Mood Header */}
            <div className="relative h-28 overflow-hidden">
              <ImageWithFallback
                src={currentMoodMeta.imageSrc}
                alt={currentMoodMeta.taglineUz}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-slate-900 via-black/40 to-black/20" />
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/90 dark:bg-slate-900/90 text-slate-900 dark:text-white backdrop-blur-md">
                  {selectedMood} · {currentMoodMeta.tonePill}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-blue-600 text-white">
                  {words[cardIndex].cefr_level || 'B2'}
                </span>
              </div>
              <div className="absolute bottom-2 right-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {flipped ? 'Showing Translation' : 'Click to Flip'}
              </div>
            </div>

            <div className="p-8 flex flex-col items-center justify-center text-center min-h-[190px]">
              {!flipped ? (
                <>
                  <Layers className="w-5 h-5 text-blue-500 mb-2 opacity-80" />
                  <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                    {words[cardIndex].word}
                  </h2>
                  <p className="text-sm font-mono text-slate-500 dark:text-slate-400 mt-2">
                    {words[cardIndex].phonetic} · <span className="italic">{words[cardIndex].part_of_speech}</span>
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-5">
                    Kartani bosing — o‘zbekcha ma’nosi va namunaviy gapni ko‘ring
                  </p>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {words[cardIndex].translation_uz}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md leading-relaxed">
                    {words[cardIndex].definition_en}
                  </p>
                  <p className="text-xs italic text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                    “{words[cardIndex].example_en}”
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => handleReviewWord(words[cardIndex].id, false)}
              className="py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Review Again Soon
            </button>
            <button
              type="button"
              onClick={() => handleReviewWord(words[cardIndex].id, true)}
              className="py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              Remembered Clearly (+10 XP)
            </button>
          </div>
        </div>
      )}

      {/* SUBTAB 3: ADAPTIVE STORIES & COMPREHENSION */}
      {subTab === 'stories' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {stories.map((st, idx) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    setSelectedStoryIndex(idx);
                    setAnswers({});
                    setQuizSubmitted(false);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                    selectedStoryIndex === idx
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {st.title}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={aiGenerating}
              onClick={handleGenerateAiStory}
              className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{aiGenerating ? 'Writing Story...' : `Generate AI Story (${selectedMood})`}</span>
            </button>
          </div>

          {activeStory ? (
            <div className="grid lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="relative h-48 w-full overflow-hidden">
                  <ImageWithFallback
                    src={MOOD_META[activeStory.mood_tag as MoodName]?.imageSrc || MOOD_META[selectedMood].imageSrc}
                    alt={activeStory.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-5">
                    <div>
                      <p className="text-[11px] font-mono text-blue-300 font-semibold uppercase tracking-wider">
                        {activeStory.mood_tag} Story · CEFR {activeStory.cefr_level}
                      </p>
                      <h2 className="text-xl font-extrabold text-white mt-0.5">{activeStory.title}</h2>
                    </div>
                  </div>
                </div>

                <div className="p-6 pt-4 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500 font-medium">
                      Adaptive Fiction · Read and answer the comprehension questions
                    </span>
                    <button
                      type="button"
                      onClick={() => speakEnglishText(activeStory.content_en)}
                      className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Listen Narrative</span>
                    </button>
                  </div>

                  <div className="space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-line">
                    {activeStory.content_en}
                  </div>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-500 mb-1">🇺🇿 Uzbek Summary</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{activeStory.summary_uz}</p>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
                <h3 className="text-base font-bold">Reading Comprehension Check</h3>
                {activeStory.questions.map((q, qIdx) => (
                  <div key={qIdx} className="space-y-2 pb-4 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {qIdx + 1}. {q.question}
                    </p>
                    <div className="space-y-1.5">
                      {q.options.map((opt, optIdx) => {
                        const chosen = answers[qIdx] === optIdx;
                        const isCorrect = q.correctIndex === optIdx;
                        return (
                          <button
                            key={optIdx}
                            type="button"
                            disabled={quizSubmitted}
                            onClick={() => setAnswers((prev) => ({ ...prev, [qIdx]: optIdx }))}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs border transition-colors cursor-pointer ${
                              quizSubmitted
                                ? isCorrect
                                  ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                                  : chosen
                                  ? 'border-red-500 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                                  : 'border-slate-200 dark:border-slate-800 opacity-70'
                                : chosen
                                ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200'
                                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    {quizSubmitted && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">{q.explanation}</p>
                    )}
                  </div>
                ))}

                {!quizSubmitted && activeStory.questions.length > 0 && (
                  <button
                    type="button"
                    onClick={submitQuiz}
                    className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Check Comprehension Answers
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                No story generated for {selectedMood} yet. Generate a custom story tailored to your saved vocabulary.
              </p>
              <button
                type="button"
                onClick={handleGenerateAiStory}
                className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                Generate First {selectedMood} Story
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
