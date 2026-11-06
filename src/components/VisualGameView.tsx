import React, { useEffect, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  Compass,
  FileSearch,
  Flame,
  HelpCircle,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
  XCircle,
  Zap,
} from 'lucide-react';
import { apiFetch, speakEnglishText } from '../api';
import { ArenaMatchCard, AuthUser, VisualScene, VisualSceneHotspot } from '../types';
import { ImageWithFallback } from './ImageWithFallback';

const COMPASS_BADGE = '/src/assets/images/game_artifact_compass_1793800921796.jpg';

interface VisualGameViewProps {
  user: AuthUser;
  onUserUpdated: (u: AuthUser) => void;
}

// Gentle Web Audio API synthesized sound generator for games
function playSynthesizedSound(type: 'correct' | 'wrong' | 'complete') {
  if (typeof window === 'undefined') return;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'correct') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === 'wrong') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else {
      // Complete fanfare
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.3); // C6
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
    }
  } catch {}
}

export const VisualGameView: React.FC<VisualGameViewProps> = ({ user, onUserUpdated }) => {
  const [activeGame, setActiveGame] = useState<'scene_quest' | 'speed_arena'>('scene_quest');
  const [scenes, setScenes] = useState<VisualScene[]>([]);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [arenaDeck, setArenaDeck] = useState<ArenaMatchCard[]>([]);
  const [unlockedHotspots, setUnlockedHotspots] = useState<Record<string, boolean>>({});
  const [activeHotspot, setActiveHotspot] = useState<VisualSceneHotspot | null>(null);

  // Hotspot puzzle state
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [puzzleResult, setPuzzleResult] = useState<{ isCorrect: boolean; explanation: string } | null>(null);
  const [solving, setSolving] = useState(false);

  // Speed Match Arena state
  const [arenaState, setArenaState] = useState<'READY' | 'PLAYING' | 'SUMMARY'>('READY');
  const [arenaTimeLeft, setArenaTimeLeft] = useState(45);
  const [arenaScore, setArenaScore] = useState(0);
  const [arenaCombo, setArenaCombo] = useState(1);
  const [arenaMaxCombo, setArenaMaxCombo] = useState(1);
  const [arenaMatches, setArenaMatches] = useState(0);
  const [currentArenaCard, setCurrentArenaCard] = useState<ArenaMatchCard | null>(null);
  const [arenaChoices, setArenaChoices] = useState<string[]>([]);
  const [feedbackEffect, setFeedbackEffect] = useState<'correct' | 'wrong' | null>(null);

  useEffect(() => {
    apiFetch<{ scenes: VisualScene[]; arenaDeck: ArenaMatchCard[] }>('/api/learning/game/scenes')
      .then((res) => {
        setScenes(res.scenes);
        setArenaDeck(res.arenaDeck);
      })
      .catch(() => {});
  }, []);

  const currentScene = scenes[selectedSceneIndex] || null;

  const handleOpenHotspot = (hotspot: VisualSceneHotspot) => {
    setActiveHotspot(hotspot);
    setSelectedOption(null);
    setPuzzleResult(null);
  };

  const handleSolveHotspot = async () => {
    if (!currentScene || !activeHotspot || selectedOption === null || solving) return;
    setSolving(true);
    try {
      const res = await apiFetch('/api/learning/game/solve-hotspot', {
        method: 'POST',
        body: JSON.stringify({
          sceneId: currentScene.id,
          hotspotId: activeHotspot.id,
          chosenIndex: selectedOption,
        }),
      });

      if (res.isCorrect) {
        playSynthesizedSound('correct');
        setUnlockedHotspots((prev) => ({ ...prev, [activeHotspot.id]: true }));
        setPuzzleResult({
          isCorrect: true,
          explanation: `${activeHotspot.explanationEn} (${activeHotspot.explanationUz})`,
        });
        onUserUpdated(res.user);

        // Check if all hotspots in this scene are now unlocked
        const nextUnlockedCount =
          currentScene.hotspots.filter((h) => unlockedHotspots[h.id] || h.id === activeHotspot.id).length;
        if (nextUnlockedCount >= currentScene.hotspots.length) {
          playSynthesizedSound('complete');
        }
      } else {
        playSynthesizedSound('wrong');
        setPuzzleResult({
          isCorrect: false,
          explanation: `Try again! Hint: ${activeHotspot.explanationEn}`,
        });
      }
    } catch {
    } finally {
      setSolving(false);
    }
  };

  // Speed Match Arena Loop
  const startSpeedArena = () => {
    if (arenaDeck.length === 0) return;
    setArenaScore(0);
    setArenaCombo(1);
    setArenaMaxCombo(1);
    setArenaMatches(0);
    setArenaTimeLeft(45);
    setArenaState('PLAYING');
    nextArenaTurn(arenaDeck);
  };

  const nextArenaTurn = (deck: ArenaMatchCard[]) => {
    const target = deck[Math.floor(Math.random() * deck.length)];
    setCurrentArenaCard(target);

    // Pick 3 distractor translations from other cards
    const distractors = deck
      .filter((c) => c.id !== target.id)
      .map((c) => c.translationUz);
    const shuffledDistractors = distractors.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options = [target.translationUz, ...shuffledDistractors].sort(() => 0.5 - Math.random());
    setArenaChoices(options);
  };

  const handleArenaChoice = (choice: string) => {
    if (!currentArenaCard || arenaState !== 'PLAYING') return;

    if (choice === currentArenaCard.translationUz) {
      playSynthesizedSound('correct');
      setFeedbackEffect('correct');
      const points = 100 * arenaCombo;
      setArenaScore((prev) => prev + points);
      setArenaMatches((prev) => prev + 1);
      const nextCombo = arenaCombo + 1;
      setArenaCombo(nextCombo);
      if (nextCombo > arenaMaxCombo) setArenaMaxCombo(nextCombo);
    } else {
      playSynthesizedSound('wrong');
      setFeedbackEffect('wrong');
      setArenaCombo(1);
    }

    setTimeout(() => {
      setFeedbackEffect(null);
      nextArenaTurn(arenaDeck);
    }, 250);
  };

  useEffect(() => {
    let timer: any;
    if (arenaState === 'PLAYING' && arenaTimeLeft > 0) {
      timer = setInterval(() => {
        setArenaTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            finishArenaGame();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [arenaState, arenaTimeLeft]);

  const finishArenaGame = async () => {
    setArenaState('SUMMARY');
    playSynthesizedSound('complete');
    try {
      const res = await apiFetch('/api/learning/game/arena-result', {
        method: 'POST',
        body: JSON.stringify({
          score: arenaScore,
          matches: arenaMatches,
          comboMax: arenaMaxCombo,
        }),
      });
      onUserUpdated(res.user);
    } catch {}
  };

  const unlockedCountInCurrentScene =
    currentScene?.hotspots.filter((h) => unlockedHotspots[h.id]).length || 0;

  return (
    <div className="space-y-6">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            Visual Learning Engine · Real Scenes · Gamified Audio & Clue Decryption
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Visual Quest & Vocabulary Game Arena
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Explore high-fidelity visual mystery locations to decrypt forensic English clues, or test your reaction speed in the Speed Match Arena.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 self-start">
          <button
            type="button"
            onClick={() => setActiveGame('scene_quest')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeGame === 'scene_quest'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Scene Clue Investigation
          </button>
          <button
            type="button"
            onClick={() => setActiveGame('speed_arena')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeGame === 'speed_arena'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Speed Word Arena
          </button>
        </div>
      </div>

      {/* GAME 1: SCENE CLUE INVESTIGATION */}
      {activeGame === 'scene_quest' && currentScene && (
        <div className="space-y-6">
          {/* Scene Selector Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {scenes.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelectedSceneIndex(idx);
                    setActiveHotspot(null);
                    setPuzzleResult(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    selectedSceneIndex === idx
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
              <span>Scene Progress:</span>
              <strong className="text-blue-600 dark:text-blue-400">
                {unlockedCountInCurrentScene} / {currentScene.hotspots.length} Decrypted
              </strong>
            </div>
          </div>

          {/* Interactive Visual Stage with Clickable Evidence Hotspots */}
          <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 shadow-sm select-none">
            <ImageWithFallback
              src={currentScene.imageSrc}
              alt={currentScene.title}
              className="w-full aspect-[16/9] object-cover"
            />

            {/* Ambient Gradient Scrim for Top HUD */}
            <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-5 flex items-start justify-between pointer-events-none">
              <div>
                <span className="text-xs text-blue-300 font-mono">
                  {currentScene.category} · CEFR {currentScene.cefrLevel}
                </span>
                <h2 className="text-lg font-bold text-white mt-0.5">{currentScene.title}</h2>
                <p className="text-xs text-slate-300 mt-1 max-w-2xl">{currentScene.briefing}</p>
              </div>

              <div className="bg-black/60 backdrop-blur border border-white/20 rounded-lg px-3 py-1.5 text-xs text-white flex items-center gap-2">
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                <span>Click markers to uncover forensic evidence</span>
              </div>
            </div>

            {/* Clickable Hotspot Pins Positioned Mathematically on the Photo Canvas */}
            {currentScene.hotspots.map((h) => {
              const unlocked = unlockedHotspots[h.id];
              const isSelected = activeHotspot?.id === h.id;
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => handleOpenHotspot(h)}
                  style={{ top: `${h.yPct}%`, left: `${h.xPct}%` }}
                  aria-label={`Inspect ${h.title}`}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 p-2 rounded-full cursor-pointer transition-transform hover:scale-125 focus:outline-none ${
                    unlocked
                      ? 'bg-emerald-500/90 text-white shadow-lg ring-2 ring-emerald-300 ring-offset-1'
                      : isSelected
                      ? 'bg-blue-600 text-white shadow-xl ring-4 ring-blue-400 animate-pulse'
                      : 'bg-amber-500/90 text-slate-950 hover:bg-amber-400 shadow-md ring-2 ring-white/50'
                  }`}
                >
                  {unlocked ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <HelpCircle className="w-4 h-4" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Hotspot Investigation Panel */}
          {activeHotspot && (
            <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <p className="text-xs text-slate-500">Forensic Clue Item</p>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {activeHotspot.title} —{' '}
                    <span className="text-blue-600 dark:text-blue-400 font-mono">
                      {activeHotspot.clueWord}
                    </span>
                    <span className="text-xs font-mono font-normal text-slate-500 ml-2">
                      {activeHotspot.phonetic}
                    </span>
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    speakEnglishText(`${activeHotspot.clueWord}. ${activeHotspot.definitionEn}`)
                  }
                  className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer self-start"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Pronounce Word</span>
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <p className="font-semibold text-slate-700 dark:text-slate-300">English Meaning</p>
                  <p className="text-slate-600 dark:text-slate-400 mt-1">{activeHotspot.definitionEn}</p>
                </div>
                <div className="p-3.5 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                  <p className="font-semibold text-blue-700 dark:text-blue-300">O‘zbekcha Tarjimasi</p>
                  <p className="text-blue-800 dark:text-blue-200 mt-1">{activeHotspot.translationUz}</p>
                </div>
              </div>

              {/* Grammar Decryption Challenge */}
              <div className="space-y-3 pt-2">
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  Decryption Puzzle: {activeHotspot.grammarQuestion}
                </p>

                <div className="grid gap-2">
                  {activeHotspot.options.map((opt, idx) => {
                    const isSelected = selectedOption === idx;
                    const isCorrect = puzzleResult && activeHotspot.correctIndex === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={puzzleResult?.isCorrect}
                        onClick={() => setSelectedOption(idx)}
                        className={`w-full text-left p-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                          puzzleResult
                            ? isCorrect
                              ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                              : isSelected
                              ? 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200'
                              : 'border-slate-200 dark:border-slate-800 opacity-60'
                            : isSelected
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>

                {!puzzleResult?.isCorrect ? (
                  <button
                    type="button"
                    disabled={selectedOption === null || solving}
                    onClick={handleSolveHotspot}
                    className="py-2.5 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>{solving ? 'Verifying...' : 'Unlock Evidence (+25 XP)'}</span>
                  </button>
                ) : (
                  <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300">
                    <p className="font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Clue Decrypted! Word added to your active vocabulary bank.
                    </p>
                    <p className="mt-1">{puzzleResult.explanation}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* GAME 2: SPEED MATCH ARENA */}
      {activeGame === 'speed_arena' && (
        <div className="max-w-2xl mx-auto space-y-6">
          {arenaState === 'READY' && (
            <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-5">
              <div className="w-20 h-20 mx-auto rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
                <ImageWithFallback
                  src={COMPASS_BADGE}
                  alt="Game Arena Insignia"
                  className="w-full h-full object-cover"
                />
              </div>

              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Speed Match Arena
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  45 Seconds · Combo Multipliers · Real-Time Audio Feedback
                </p>
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-md mx-auto">
                Test your instinctual English-to-Uzbek recognition speed. Build combo streaks for maximum XP bonuses and rapid memory consolidation.
              </p>

              <button
                type="button"
                onClick={startSpeedArena}
                className="py-3 px-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 shadow-md cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>Start Speed Duel</span>
              </button>
            </div>
          )}

          {arenaState === 'PLAYING' && currentArenaCard && (
            <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
              {/* Unobtrusive HUD */}
              <div className="flex items-center justify-between text-xs font-mono tabular-nums border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold">
                  <Clock className="w-4 h-4" />
                  <span className="text-base">{arenaTimeLeft}s</span>
                </div>

                <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold">
                  <Flame className="w-4 h-4" />
                  <span>Combo x{arenaCombo}</span>
                </div>

                <div>
                  <span className="text-slate-500">Score: </span>
                  <span className="text-base font-bold text-slate-900 dark:text-white">{arenaScore}</span>
                </div>
              </div>

              {/* Central Target Card */}
              <div
                className={`p-6 rounded-xl border text-center transition-all ${
                  feedbackEffect === 'correct'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 scale-105'
                    : feedbackEffect === 'wrong'
                    ? 'border-red-500 bg-red-50/50 dark:bg-red-950/40 scale-95'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
                }`}
              >
                <p className="text-xs text-slate-500 uppercase tracking-wider font-mono">
                  {currentArenaCard.category}
                </p>
                <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {currentArenaCard.word}
                </h3>
                <p className="text-sm font-mono text-slate-500 mt-1">{currentArenaCard.phonetic}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                  {currentArenaCard.definitionEn}
                </p>
              </div>

              {/* 4 Fast-Action Choice Buttons */}
              <div className="grid grid-cols-2 gap-3">
                {arenaChoices.map((choice, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleArenaChoice(choice)}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-950/40 text-sm font-semibold text-slate-900 dark:text-white transition-all active:scale-95 cursor-pointer text-center"
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </div>
          )}

          {arenaState === 'SUMMARY' && (
            <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-5">
              <Sparkles className="w-10 h-10 text-amber-500 mx-auto" />
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Round Complete!
                </h2>
                <p className="text-xs text-slate-500 mt-1">Results logged to your profile</p>
              </div>

              <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono tabular-nums text-xs">
                <div>
                  <p className="text-slate-500">Final Score</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{arenaScore}</p>
                </div>
                <div>
                  <p className="text-slate-500">Matches</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{arenaMatches}</p>
                </div>
                <div>
                  <p className="text-slate-500">Max Combo</p>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                    x{arenaMaxCombo}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={startSpeedArena}
                className="py-2.5 px-6 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Play Another Round</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
