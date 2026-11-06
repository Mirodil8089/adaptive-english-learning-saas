import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, FileSearch, Plus, RefreshCw, Search, Shield, Sparkles, User, XCircle } from 'lucide-react';
import { apiFetch } from '../api';
import { AuthUser, DetectiveCase, MistakeItem } from '../types';
import { ImageWithFallback } from './ImageWithFallback';

const CRIME_SCENE_IMAGES: Record<string, string> = {
  case_gate_b14: '/src/assets/images/mode_detective_mystery_1793797338612.jpg',
  case_gallery_sketch: '/src/assets/images/det_art_heist_1793801997237.jpg',
  case_server_sabotage: '/src/assets/images/det_cyber_sabotage_1793802012776.jpg',
  case_wine_cellar: '/src/assets/images/scene_oxford_gothic_library_1793800920229.jpg',
};

const SUSPECT_PORTRAITS: Record<string, string> = {
  suspect_victor: '/src/assets/images/suspect_male_analyst_1793803375998.jpg',
  suspect_nadia: '/src/assets/images/suspect_female_auditor_1793803357343.jpg',
  suspect_marcus: '/src/assets/images/suspect_glasses_analyst_1793803392335.jpg',
  suspect_claire: '/src/assets/images/suspect_female_auditor_1793803357343.jpg',
  suspect_devon: '/src/assets/images/suspect_glasses_analyst_1793803392335.jpg',
  suspect_sara: '/src/assets/images/suspect_female_auditor_1793803357343.jpg',
  suspect_julian: '/src/assets/images/suspect_male_analyst_1793803375998.jpg',
};

function getSuspectImage(s: { id: string; name: string }): string {
  if (SUSPECT_PORTRAITS[s.id]) return SUSPECT_PORTRAITS[s.id];
  const nameLower = (s.name || '').toLowerCase();
  if (nameLower.includes('nadia') || nameLower.includes('claire') || nameLower.includes('sara') || nameLower.includes('elena') || nameLower.includes('hannah')) {
    return '/src/assets/images/suspect_female_auditor_1793803357343.jpg';
  }
  if (nameLower.includes('marcus') || nameLower.includes('devon') || nameLower.includes('alvarez') || nameLower.includes('liam')) {
    return '/src/assets/images/suspect_glasses_analyst_1793803392335.jpg';
  }
  return '/src/assets/images/suspect_male_analyst_1793803375998.jpg';
}

function getCaseImage(c: DetectiveCase): string {
  if (CRIME_SCENE_IMAGES[c.id]) return CRIME_SCENE_IMAGES[c.id];
  const topicLower = (c.grammar_topic || '').toLowerCase();
  const titleLower = (c.title || '').toLowerCase();
  if (titleLower.includes('art') || titleLower.includes('gallery') || titleLower.includes('sketch') || titleLower.includes('auction')) {
    return '/src/assets/images/det_art_heist_1793801997237.jpg';
  }
  if (
    titleLower.includes('server') ||
    titleLower.includes('cyber') ||
    titleLower.includes('code') ||
    topicLower.includes('conditional')
  ) {
    return '/src/assets/images/det_cyber_sabotage_1793802012776.jpg';
  }
  if (titleLower.includes('vault') || titleLower.includes('library') || titleLower.includes('manuscript') || titleLower.includes('scholarship')) {
    return '/src/assets/images/scene_oxford_gothic_library_1793800920229.jpg';
  }
  return '/src/assets/images/mode_detective_mystery_1793797338612.jpg';
}

const GRAMMAR_TOPICS = [
  { id: 'tenses', label: 'Verb Tenses' },
  { id: 'conditionals', label: 'Conditionals' },
  { id: 'passive_voice', label: 'Passive Voice' },
  { id: 'articles', label: 'Articles (a/an/the)' },
  { id: 'prepositions', label: 'Prepositions' },
  { id: 'pronouns', label: 'Pronouns' },
  { id: 'reported_speech', label: 'Reported Speech' },
  { id: 'modal_verbs', label: 'Modal Verbs' },
  { id: 'sentence_structure', label: 'Sentence Structure' },
];

interface DetectiveModeViewProps {
  user: AuthUser;
  pendingMistakeId: string | null;
  onClearPendingMistake: () => void;
  onUserUpdated: (u: AuthUser) => void;
}

export const DetectiveModeView: React.FC<DetectiveModeViewProps> = ({
  user,
  pendingMistakeId,
  onClearPendingMistake,
  onUserUpdated,
}) => {
  const [cases, setCases] = useState<DetectiveCase[]>([]);
  const [mistakes, setMistakes] = useState<MistakeItem[]>([]);
  const [selectedCase, setSelectedCase] = useState<DetectiveCase | null>(null);
  const [selectedTopic, setSelectedTopic] = useState('tenses');
  const [accusedId, setAccusedId] = useState<string>('');
  const [verdict, setVerdict] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCases = async () => {
    try {
      const res = await apiFetch<{ cases: DetectiveCase[]; mistakes: MistakeItem[] }>(
        '/api/learning/detective/cases'
      );
      setCases(res.cases);
      setMistakes(res.mistakes);
      if (res.cases.length > 0 && !selectedCase) {
        setSelectedCase(res.cases[0]);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadCases();
  }, []);

  useEffect(() => {
    if (pendingMistakeId) {
      handleGenerateCase(pendingMistakeId);
      onClearPendingMistake();
    }
  }, [pendingMistakeId]);

  const handleGenerateCase = async (mistakeId?: string) => {
    setGenerating(true);
    setError(null);
    setVerdict(null);
    try {
      const res = await apiFetch<{ caseItem: DetectiveCase; user: AuthUser }>(
        '/api/learning/detective/generate',
        {
          method: 'POST',
          body: JSON.stringify({ grammarTopic: selectedTopic, mistakeId }),
        }
      );
      setCases((prev) => [res.caseItem, ...prev]);
      setSelectedCase(res.caseItem);
      setAccusedId('');
      onUserUpdated(res.user);
      loadCases();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSolveCase = async () => {
    if (!selectedCase || !accusedId) return;
    setError(null);
    try {
      const res = await apiFetch('/api/learning/detective/solve', {
        method: 'POST',
        body: JSON.stringify({
          caseId: selectedCase.id,
          accusedSuspectId: accusedId,
        }),
      });
      setVerdict(res);
      onUserUpdated(res.user);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            Daily Detective Cases: {user.credits.daily_detective_used}/{user.plan.daily_detective_cases} · Server-Validated Culprit Logic
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Grammar Detective Investigation Board</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Inspect timelines, witness statements, and forensic exhibits to uncover which suspect’s grammar and alibi contradict the facts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedTopic}
            onChange={(e) => setSelectedTopic(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            {GRAMMAR_TOPICS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={generating}
            onClick={() => handleGenerateCase()}
            className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            {generating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{generating ? 'Drafting Dossier...' : 'Generate New AI Case'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Unresolved Simulator Mistakes ready for Detective Conversion */}
      {mistakes.filter((m) => !m.resolved).length > 0 && (
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs">
            <p className="font-semibold text-slate-900 dark:text-white">
              Unified Intelligence · Recent Simulator Mistake Ready for Investigation
            </p>
            <p className="text-slate-500 mt-0.5">
              “{mistakes.filter((m) => !m.resolved)[0].original_text}” → Topic: {mistakes.filter((m) => !m.resolved)[0].grammar_topic}
            </p>
          </div>
          <button
            type="button"
            disabled={generating}
            onClick={() => handleGenerateCase(mistakes.filter((m) => !m.resolved)[0].id)}
            className="py-2 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Turn Into Mystery Case
          </button>
        </div>
      )}

      {/* Case Selector Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {cases.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setSelectedCase(c);
              setAccusedId('');
              setVerdict(null);
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
              selectedCase?.id === c.id
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {c.title}
          </button>
        ))}
      </div>

      {selectedCase && (
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left: Case Premise, Suspects & Accusation */}
          <div className="lg:col-span-8 space-y-6">
            {/* Cinematic Crime Scene Photo & Case Dossier Header */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="relative h-56 sm:h-64 w-full overflow-hidden bg-slate-950">
                <ImageWithFallback
                  src={getCaseImage(selectedCase)}
                  alt={selectedCase.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-black/20" />
                <div className="absolute top-4 left-4 flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-500 text-black flex items-center gap-1.5 shadow-md">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>FORENSIC DOSSIER #{selectedCase.id.slice(-6).toUpperCase()}</span>
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-black/60 backdrop-blur text-white border border-white/20">
                    CEFR {selectedCase.cefr_level}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-blue-600/80 backdrop-blur text-white border border-blue-400/30">
                    {selectedCase.grammar_topic.replace('_', ' ')}
                  </span>
                </div>
                <div className="absolute bottom-4 left-4 right-4">
                  <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight drop-shadow-md">
                    {selectedCase.title}
                  </h2>
                  <p className="text-xs text-slate-300 mt-1 line-clamp-2 drop-shadow">
                    {selectedCase.premise}
                  </p>
                </div>
              </div>

              <div className="p-5 bg-slate-50 dark:bg-slate-950/70 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Search className="w-4 h-4 text-blue-500" />
                  <span>Grammar Domain Focus: <strong className="text-slate-900 dark:text-white capitalize">{selectedCase.grammar_topic.replace('_', ' ')}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 font-mono">
                  <span>3 Suspects Interrogated</span>
                  <span>·</span>
                  <span>Server-Validated Alibi</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-500" />
                  <span>Suspect Interrogation Statements</span>
                </h3>
                <span className="text-xs text-slate-500">Choose suspect whose grammar & alibi falsify facts</span>
              </div>
              <div className="grid gap-4">
                {selectedCase.suspects.map((s) => {
                  const selected = accusedId === s.id;
                  const suspectImg = getSuspectImage(s);
                  return (
                    <div
                      key={s.id}
                      onClick={() => !verdict && setAccusedId(s.id)}
                      className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer ${
                        selected
                          ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 shadow-md ring-2 ring-blue-500/50'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3.5">
                          {/* Suspect Mugshot Photo */}
                          <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden shrink-0 border-2 border-slate-300 dark:border-slate-700 shadow-sm bg-slate-950">
                            <ImageWithFallback
                              src={suspectImg}
                              alt={s.name}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                            <span className="absolute bottom-0.5 inset-x-0 text-center text-[9px] font-mono font-black uppercase text-amber-300 tracking-wider">
                              SUSPECT
                            </span>
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-base font-extrabold text-slate-900 dark:text-white">
                                {s.name}
                              </span>
                              {selected && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white animate-pulse">
                                  Primary Accusation
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-1">
                              <span className="font-medium text-slate-700 dark:text-slate-300">{s.occupation}</span>
                              <span>·</span>
                              <span className="font-mono flex items-center gap-1 text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                                <Clock className="w-3 h-3 text-slate-400" />
                                Alibi: {s.alibi_time}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer">
                            {selected ? 'Accused' : 'Select'}
                          </label>
                          <input
                            type="radio"
                            name="accusedSuspect"
                            checked={selected}
                            onChange={() => !verdict && setAccusedId(s.id)}
                            aria-label={`Accuse ${s.name}`}
                            className="w-4 h-4 text-blue-600 cursor-pointer"
                          />
                        </div>
                      </div>

                      <blockquote className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800/80 text-xs sm:text-sm font-mono text-slate-800 dark:text-slate-200 leading-relaxed relative">
                        <span className="text-blue-500 font-bold mr-1">“</span>
                        {s.statement}
                        <span className="text-blue-500 font-bold ml-1">”</span>
                      </blockquote>
                    </div>
                  );
                })}
              </div>
            </div>

            {!verdict ? (
              <button
                type="button"
                disabled={!accusedId}
                onClick={handleSolveCase}
                className="py-3 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer shadow-sm transition-colors"
              >
                <FileSearch className="w-4 h-4" />
                <span>Submit Formal Accusation</span>
              </button>
            ) : (
              <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  {verdict.solved ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <h3 className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                        Case Solved! (+35 XP)
                      </h3>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-red-600" />
                      <h3 className="text-base font-bold text-red-700 dark:text-red-400">
                        Incorrect Suspect — Inspect the Linguistic Evidence Below
                      </h3>
                    </>
                  )}
                </div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  Smoking Gun: {verdict.grammarSmokingGun}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  English Rule: {verdict.explanationEn}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
                  Uzbek Explanation: {verdict.explanationUz}
                </p>
              </div>
            )}
          </div>

          {/* Right: Chronological Timeline & Forensic Evidence */}
          <div className="lg:col-span-4 space-y-5">
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <span>Verified Incident Timeline</span>
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {selectedCase.timeline.map((item, idx) => (
                  <div key={idx} className="py-2.5 flex items-start gap-3 text-xs">
                    <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 shrink-0 tabular-nums">
                      {item.time}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">{item.event}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-500" />
                <span>Collected Exhibits (Evidence Markers)</span>
              </h3>
              <div className="space-y-3">
                {selectedCase.evidence.map((ev, idx) => (
                  <div key={ev.id || idx} className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-amber-400 text-black text-[10px] font-mono font-extrabold shadow-sm">
                        #{idx + 1}
                      </span>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{ev.label}</p>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{ev.statement_with_clue}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
