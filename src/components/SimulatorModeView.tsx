import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, Volume2, Sparkles, MapPin, UserCheck } from 'lucide-react';
import { apiFetch, speakEnglishText } from '../api';
import { AuthUser, ScenarioItem, SimulatorMessage } from '../types';
import { ImageWithFallback } from './ImageWithFallback';

const SCENARIO_IMAGES: Record<string, string> = {
  airport_transfer: '/src/assets/images/mode_simulator_airport_1793797336167.jpg',
  hotel_checkin: '/src/assets/images/sim_hotel_concierge_1793801952276.jpg',
  restaurant_dining: '/src/assets/images/scene_zurich_bistro_1793800922188.jpg',
  job_interview: '/src/assets/images/sim_job_interview_1793801965758.jpg',
  university_seminar: '/src/assets/images/scene_oxford_gothic_library_1793800920229.jpg',
  shopping_return: '/src/assets/images/sim_shopping_flagship_1793802658977.jpg',
  travel_train: '/src/assets/images/sim_train_terminal_1793801981786.jpg',
  business_negotiation: '/src/assets/images/sim_boardroom_deal_1793802676655.jpg',
  everyday_neighbor: '/src/assets/images/sim_neighborhood_cafe_1793802692315.jpg',
};

interface SimulatorModeViewProps {
  user: AuthUser;
  onUserUpdated: (u: AuthUser) => void;
  onConvertMistakeToDetective: (mistakeId: string) => void;
}

export const SimulatorModeView: React.FC<SimulatorModeViewProps> = ({
  user,
  onUserUpdated,
  onConvertMistakeToDetective,
}) => {
  const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioItem | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [targetWords, setTargetWords] = useState<string[]>([]);
  const [messages, setMessages] = useState<SimulatorMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [lastMistakeId, setLastMistakeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    apiFetch<{ scenarios: ScenarioItem[] }>('/api/learning/simulator/scenarios')
      .then((res) => {
        setScenarios(res.scenarios);
      })
      .catch((err) => setError(err.message));
  }, []);

  const startScenario = async (scenario: ScenarioItem) => {
    setError(null);
    setLastMistakeId(null);
    try {
      const res = await apiFetch<{
        conversationId: string;
        targetWords: string[];
        messages: SimulatorMessage[];
        scenario: ScenarioItem;
      }>('/api/learning/simulator/start', {
        method: 'POST',
        body: JSON.stringify({ scenarioId: scenario.id }),
      });
      setSelectedScenario(res.scenario);
      setConversationId(res.conversationId);
      setTargetWords(res.targetWords);
      setMessages(res.messages);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSendTurn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!conversationId || !inputText.trim() || sending) return;

    const text = inputText.trim();
    setInputText('');
    setSending(true);
    setError(null);

    try {
      const res = await apiFetch<{
        messages: SimulatorMessage[];
        recordedMistakeId: string | null;
        user: AuthUser;
      }>('/api/learning/simulator/turn', {
        method: 'POST',
        body: JSON.stringify({ conversationId, message: text }),
      });
      setMessages(res.messages);
      if (res.recordedMistakeId) {
        setLastMistakeId(res.recordedMistakeId);
      }
      onUserUpdated(res.user);
    } catch (err: any) {
      setError(err.message);
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const toggleVoiceInput = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Speech recognition is not supported by this browser. Type your reply below.');
      return;
    }

    if (recording && recognitionRef.current) {
      recognitionRef.current.stop();
      setRecording(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const spoken = event.results?.[0]?.[0]?.transcript || '';
      setInputText((prev) => (prev ? `${prev} ${spoken}` : spoken));
      setRecording(false);
    };
    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);

    recognitionRef.current = recognition;
    setRecording(true);
    recognition.start();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            Daily Simulator Turns: {user.credits.daily_simulator_used}/{user.plan.daily_simulator_turns} · Unified Mood Vocabulary Active
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Real-Life English RPG Simulator</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Practice spoken and written dialogue across 9 real-world settings. Reuse your Mood Mode words for bonus XP.
          </p>
        </div>

        {selectedScenario && (
          <button
            type="button"
            onClick={() => {
              setSelectedScenario(null);
              setConversationId(null);
            }}
            className="py-2 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer self-start"
          >
            Change Scenario
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {!selectedScenario ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scenarios.map((sc) => {
            const imgSrc = SCENARIO_IMAGES[sc.id] || SCENARIO_IMAGES.airport_transfer;
            return (
              <div
                key={sc.id}
                className="group rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between hover:shadow-lg transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700"
              >
                <div>
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-950">
                    <ImageWithFallback
                      src={imgSrc}
                      alt={sc.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/30 to-transparent" />
                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-600 text-white shadow-sm">
                        {sc.category}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-white/20 backdrop-blur text-white">
                        {sc.cefr_level}
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-3 right-3">
                      <span className="text-[11px] font-mono text-blue-300 font-medium flex items-center gap-1 truncate">
                        <UserCheck className="w-3.5 h-3.5 shrink-0" />
                        AI: {sc.role_ai}
                      </span>
                    </div>
                  </div>

                  <div className="p-5">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {sc.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 line-clamp-3 leading-relaxed">
                      {sc.setting_description}
                    </p>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-500">
                      <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="truncate">{sc.category} Roleplay Simulator</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 pt-0">
                  <button
                    type="button"
                    onClick={() => startScenario(sc)}
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shadow-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <span>Enter RPG Mission</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Two-Zone Educational Sandbox Layout */
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left Zone: Interactive Dialogue Stage (65%) */}
          <div className="lg:col-span-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col min-h-[520px] overflow-hidden">
            <div className="relative h-32 w-full overflow-hidden bg-slate-950 border-b border-slate-200 dark:border-slate-800">
              <ImageWithFallback
                src={SCENARIO_IMAGES[selectedScenario.id] || SCENARIO_IMAGES.airport_transfer}
                alt={selectedScenario.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent flex flex-col justify-end p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-600 text-white">
                        {selectedScenario.category}
                      </span>
                      <span className="text-xs font-mono text-slate-300">
                        CEFR {selectedScenario.cefr_level}
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                      {selectedScenario.title}
                    </h2>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur border border-white/10 text-xs text-slate-200">
                    Speaking with: <strong className="text-blue-300">{selectedScenario.role_ai}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 p-6 space-y-4 overflow-y-auto max-h-[420px]">
              {messages.map((m, idx) => (
                <div key={idx} className={`space-y-2 ${m.role === 'user' ? 'pl-8' : 'pr-8'}`}>
                  <div
                    className={`p-4 rounded-xl border ${
                      m.role === 'ai'
                        ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                        : 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                        {m.role === 'ai' ? selectedScenario.role_ai : 'You'}
                      </span>
                      {m.role === 'ai' && (
                        <button
                          type="button"
                          onClick={() => speakEnglishText(m.text)}
                          className="text-xs inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Listen</span>
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-slate-900 dark:text-slate-100 leading-relaxed">{m.text}</p>
                  </div>

                  {m.feedback && (
                    <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono tabular-nums font-semibold">
                          Turn Clarity Score: {m.feedback.score}/100 ·{' '}
                          {m.feedback.grammar_ok ? 'Grammar Accurate' : `Grammar Focus: ${m.feedback.grammar_topic}`}
                        </span>
                        {m.feedback.used_mood_vocab && m.feedback.used_mood_vocab.length > 0 && (
                          <span className="text-blue-600 dark:text-blue-400 font-semibold">
                            Mood Words Reused: {m.feedback.used_mood_vocab.join(', ')}
                          </span>
                        )}
                      </div>
                      {!m.feedback.grammar_ok && m.feedback.corrected && (
                        <>
                          <p className="text-emerald-700 dark:text-emerald-400 font-medium">
                            Natural phrasing: “{m.feedback.corrected}”
                          </p>
                          <p className="text-slate-600 dark:text-slate-400">
                            {m.feedback.explanation_en} ({m.feedback.explanation_uz})
                          </p>
                        </>
                      )}
                      {m.feedback.pronunciation_tip && (
                        <p className="text-slate-500">Pronunciation tip: {m.feedback.pronunciation_tip}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <form
              onSubmit={handleSendTurn}
              className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
            >
              <button
                type="button"
                onClick={toggleVoiceInput}
                title="Speak with microphone"
                className={`p-2.5 rounded-lg border transition-colors cursor-pointer shrink-0 ${
                  recording
                    ? 'bg-red-600 text-white border-red-600'
                    : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Speak or type your English response..."
                className="flex-1 px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                disabled={sending || !inputText.trim()}
                className="py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sending ? 'Replying...' : 'Send'}</span>
              </button>
            </form>
          </div>

          {/* Right Zone: Objectives & Unified Intelligence Bridge */}
          <div className="lg:col-span-4 space-y-5">
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <h3 className="text-sm font-bold">Scenario Objectives</h3>
              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
                {selectedScenario.objectives.map((obj, idx) => (
                  <li key={idx}>{obj}</li>
                ))}
              </ul>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <h3 className="text-sm font-bold">Unified Mood Vocabulary Targets</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Include any of these words from your Mood Mode bank naturally in dialogue for +12 Bonus XP per word:
              </p>
              <div className="flex flex-wrap gap-2">
                {targetWords.map((w) => (
                  <span
                    key={w}
                    className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>

            {lastMistakeId && (
              <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 space-y-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Unified Intelligence · Grammar Slip Logged
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Turn your recent Simulator grammar mistake into an interactive Detective Mystery Case to master that exact structure.
                </p>
                <button
                  type="button"
                  onClick={() => onConvertMistakeToDetective(lastMistakeId)}
                  className="w-full py-2 px-3 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                >
                  Convert Mistake to Detective Case →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
