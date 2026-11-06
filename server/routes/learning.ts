import { Router } from 'express';
import {
  askAiTeacher,
  checkAndReserveQuota,
  generateDetectiveCaseAi,
  generateMoodStory,
  generateMoodVocabulary,
  isGeminiConfigured,
  synthesizeSpeechWav,
  transcribeAudioBase64,
  generateSimulatorTurn,
} from '../ai.ts';
import { db, nowIso, uuid } from '../db.ts';
import {
  type AuthenticatedRequest,
  getHydratedUser,
  rateLimit,
  recordLearningProgress,
  requireAuth,
} from '../security.ts';

export const learningRouter = Router();

// ============================================================================
// 1. MOOD MODE (Vocabulary, Flashcards, Stories, Comprehension)
// ============================================================================

learningRouter.get('/mood/content', requireAuth, (req: AuthenticatedRequest, res) => {
  const mood = String(req.query.mood || 'Curious');
  const words = db
    .prepare(
      `SELECT v.*, uv.mastery_level, uv.used_in_simulator_count
       FROM vocabulary v
       LEFT JOIN user_vocabulary uv ON uv.vocabulary_id = v.id AND uv.user_id = ?
       WHERE v.mood_tag = ?
       ORDER BY v.created_at DESC
       LIMIT 20`
    )
    .all(req.userId!, mood);

  const storiesRaw = db
    .prepare(
      `SELECT * FROM stories
       WHERE mood_tag = ? AND (is_curated = 1 OR user_id = ?)
       ORDER BY created_at DESC
       LIMIT 10`
    )
    .all(mood, req.userId!) as Array<Record<string, any>>;

  const stories = storiesRaw.map((s) => ({
    ...s,
    vocabulary: JSON.parse(s.vocabulary_json || '[]'),
    questions: JSON.parse(s.questions_json || '[]'),
  }));

  const savedBank = db
    .prepare(
      `SELECT v.*, uv.mastery_level, uv.used_in_simulator_count
       FROM user_vocabulary uv
       JOIN vocabulary v ON v.id = uv.vocabulary_id
       WHERE uv.user_id = ?
       ORDER BY uv.last_reviewed_at DESC
       LIMIT 30`
    )
    .all(req.userId!);

  res.json({ words, stories, savedBank });
});

learningRouter.post('/mood/generate-vocab', requireAuth, rateLimit('ai_vocab', 10, 60_000), async (req: AuthenticatedRequest, res) => {
  const { mood = 'Curious' } = req.body || {};
  const quota = checkAndReserveQuota(req.userId!, 'mood_vocab', 2);
  if (!quota.allowed) {
    res.status(403).json({ error: quota.reason });
    return;
  }

  const profile = db.prepare('SELECT cefr_level FROM profiles WHERE user_id = ?').get(req.userId!) as {
    cefr_level: string;
  };
  db.prepare('UPDATE profiles SET current_mood = ?, updated_at = ? WHERE user_id = ?').run(
    mood,
    nowIso(),
    req.userId!
  );

  try {
    const generated = await generateMoodVocabulary({
      userId: req.userId!,
      mood,
      cefrLevel: profile.cefr_level || 'B1',
    });

    const now = nowIso();
    const inserted: Array<Record<string, any>> = [];
    for (const item of generated) {
      const id = uuid();
      db.prepare(`
        INSERT INTO vocabulary (
          id, word, phonetic, part_of_speech, cefr_level, mood_tag,
          definition_en, translation_uz, translation_ru, example_en, example_uz, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        item.word,
        item.phonetic,
        item.part_of_speech,
        profile.cefr_level || 'B1',
        mood,
        item.definition_en,
        item.translation_uz,
        item.translation_ru,
        item.example_en,
        item.example_uz,
        now
      );
      db.prepare(`
        INSERT OR IGNORE INTO user_vocabulary (id, user_id, vocabulary_id, mastery_level, last_reviewed_at)
        VALUES (?, ?, ?, 1, ?)
      `).run(uuid(), req.userId!, id, now);
      inserted.push({ id, ...item, cefr_level: profile.cefr_level, mood_tag: mood, mastery_level: 1 });
    }

    recordLearningProgress(req.userId!, 20);
    res.json({ words: inserted, user: getHydratedUser(req.userId!) });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'Failed to generate AI vocabulary.' });
  }
});

learningRouter.post('/mood/review-word', requireAuth, (req: AuthenticatedRequest, res) => {
  const { vocabularyId, remembered } = req.body || {};
  if (!vocabularyId) {
    res.status(400).json({ error: 'vocabularyId is required.' });
    return;
  }

  const existing = db
    .prepare('SELECT id, mastery_level FROM user_vocabulary WHERE user_id = ? AND vocabulary_id = ?')
    .get(req.userId!, vocabularyId) as { id: string; mastery_level: number } | undefined;

  const now = nowIso();
  let nextLevel = remembered ? 2 : 1;
  if (existing) {
    nextLevel = remembered ? Math.min(5, existing.mastery_level + 1) : Math.max(1, existing.mastery_level - 1);
    db.prepare('UPDATE user_vocabulary SET mastery_level = ?, last_reviewed_at = ? WHERE id = ?').run(
      nextLevel,
      now,
      existing.id
    );
  } else {
    db.prepare(`
      INSERT INTO user_vocabulary (id, user_id, vocabulary_id, mastery_level, last_reviewed_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuid(), req.userId!, vocabularyId, nextLevel, now);
  }

  recordLearningProgress(req.userId!, remembered ? 10 : 4, {
    retention_score: remembered ? Math.min(100, nextLevel * 20) : 45,
  });

  res.json({ masteryLevel: nextLevel, user: getHydratedUser(req.userId!) });
});

learningRouter.post('/mood/generate-story', requireAuth, rateLimit('ai_story', 8, 60_000), async (req: AuthenticatedRequest, res) => {
  const { mood = 'Curious' } = req.body || {};
  const quota = checkAndReserveQuota(req.userId!, 'mood_story', 3);
  if (!quota.allowed) {
    res.status(403).json({ error: quota.reason });
    return;
  }

  const profile = db.prepare('SELECT cefr_level FROM profiles WHERE user_id = ?').get(req.userId!) as {
    cefr_level: string;
  };
  const targetRows = db
    .prepare(
      `SELECT v.word FROM user_vocabulary uv
       JOIN vocabulary v ON v.id = uv.vocabulary_id
       WHERE uv.user_id = ?
       ORDER BY uv.last_reviewed_at DESC LIMIT 4`
    )
    .all(req.userId!) as Array<{ word: string }>;

  const targetWords = targetRows.map((r) => r.word);

  try {
    const storyData = await generateMoodStory({
      userId: req.userId!,
      mood,
      cefrLevel: profile.cefr_level || 'B1',
      targetWords,
    });

    const id = uuid();
    const now = nowIso();
    db.prepare(`
      INSERT INTO stories (
        id, user_id, title, mood_tag, cefr_level, content_en, summary_uz,
        vocabulary_json, questions_json, is_curated, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      id,
      req.userId!,
      storyData.title,
      mood,
      profile.cefr_level || 'B1',
      storyData.content_en,
      storyData.summary_uz,
      JSON.stringify(storyData.vocabulary || []),
      JSON.stringify(storyData.questions || []),
      now
    );

    recordLearningProgress(req.userId!, 25);
    res.json({
      story: {
        id,
        ...storyData,
        mood_tag: mood,
        cefr_level: profile.cefr_level || 'B1',
      },
      user: getHydratedUser(req.userId!),
    });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'Failed to generate adaptive story.' });
  }
});

learningRouter.post('/mood/submit-quiz', requireAuth, (req: AuthenticatedRequest, res) => {
  const { correctCount = 0, totalQuestions = 1 } = req.body || {};
  const pct = Math.round((Number(correctCount) / Math.max(1, Number(totalQuestions))) * 100);
  recordLearningProgress(req.userId!, 18, { reading_score: pct });
  res.json({ readingScore: pct, user: getHydratedUser(req.userId!) });
});

// ============================================================================
// 2. SIMULATOR MODE (9 RPG Scenarios + Unified Mood Vocab + Mistake Tracking)
// ============================================================================

learningRouter.get('/simulator/scenarios', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db.prepare('SELECT * FROM scenarios WHERE is_active = 1').all() as Array<Record<string, any>>;
  const scenarios = rows.map((r) => ({
    ...r,
    objectives: JSON.parse(r.objectives_json || '[]'),
  }));

  // Unified Intelligence: pull active vocabulary from learner's Mood Mode bank
  const moodVocab = db
    .prepare(
      `SELECT v.id, v.word, v.translation_uz
       FROM user_vocabulary uv
       JOIN vocabulary v ON v.id = uv.vocabulary_id
       WHERE uv.user_id = ?
       ORDER BY uv.mastery_level ASC, uv.last_reviewed_at DESC
       LIMIT 5`
    )
    .all(req.userId!);

  res.json({ scenarios, targetMoodVocab: moodVocab });
});

learningRouter.post('/simulator/start', requireAuth, (req: AuthenticatedRequest, res) => {
  const { scenarioId } = req.body || {};
  const scenario = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(scenarioId) as
    | Record<string, any>
    | undefined;
  if (!scenario) {
    res.status(404).json({ error: 'Scenario not found.' });
    return;
  }

  let moodWords = db
    .prepare(
      `SELECT v.word FROM user_vocabulary uv
       JOIN vocabulary v ON v.id = uv.vocabulary_id
       WHERE uv.user_id = ? LIMIT 4`
    )
    .all(req.userId!) as Array<{ word: string }>;

  if (moodWords.length === 0) {
    moodWords = db.prepare('SELECT word FROM vocabulary LIMIT 3').all() as Array<{ word: string }>;
  }

  const targetWords = moodWords.map((w) => w.word);
  const initialMessages = [
    {
      role: 'ai',
      text: scenario.opening_line,
      timestamp: nowIso(),
    },
  ];

  const convId = uuid();
  const now = nowIso();
  db.prepare(`
    INSERT INTO conversations (id, user_id, scenario_id, target_vocab_json, messages_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(convId, req.userId!, scenario.id, JSON.stringify(targetWords), JSON.stringify(initialMessages), now, now);

  res.status(201).json({
    conversationId: convId,
    targetWords,
    messages: initialMessages,
    scenario: { ...scenario, objectives: JSON.parse(scenario.objectives_json || '[]') },
  });
});

learningRouter.post('/simulator/turn', requireAuth, rateLimit('ai_simulator', 15, 60_000), async (req: AuthenticatedRequest, res) => {
  const { conversationId, message } = req.body || {};
  if (!conversationId || !message || !String(message).trim()) {
    res.status(400).json({ error: 'Conversation ID and spoken/typed message are required.' });
    return;
  }

  const quota = checkAndReserveQuota(req.userId!, 'simulator', 2);
  if (!quota.allowed) {
    res.status(403).json({ error: quota.reason });
    return;
  }

  const conv = db
    .prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?')
    .get(conversationId, req.userId!) as Record<string, any> | undefined;
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found.' });
    return;
  }

  const scenario = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(conv.scenario_id) as Record<string, any>;
  const messages = JSON.parse(conv.messages_json || '[]');
  const targetWords: string[] = JSON.parse(conv.target_vocab_json || '[]');

  try {
    const turnResult = await generateSimulatorTurn({
      userId: req.userId!,
      scenario,
      history: messages,
      userMessage: String(message).trim(),
      targetMoodWords: targetWords,
    });

    const now = nowIso();
    let recordedMistakeId: string | null = null;

    // Unified Intelligence: persist real Simulator grammar mistakes so Detective Mode can turn them into mystery cases!
    if (turnResult.grammar_ok === false && turnResult.corrected) {
      recordedMistakeId = uuid();
      db.prepare(`
        INSERT INTO mistakes (
          id, user_id, source_mode, grammar_topic, original_text,
          corrected_text, explanation_en, explanation_uz, resolved, created_at
        ) VALUES (?, ?, 'simulator', ?, ?, ?, ?, ?, 0, ?)
      `).run(
        recordedMistakeId,
        req.userId!,
        turnResult.grammar_topic || 'sentence_structure',
        String(message).trim(),
        turnResult.corrected,
        turnResult.explanation_en || '',
        turnResult.explanation_uz || '',
        now
      );
    }

    // Unified Intelligence: reward Mood vocabulary reuse in Simulator
    if (Array.isArray(turnResult.used_mood_vocab) && turnResult.used_mood_vocab.length > 0) {
      for (const usedWord of turnResult.used_mood_vocab) {
        const vocabRow = db
          .prepare('SELECT id FROM vocabulary WHERE LOWER(word) = LOWER(?) LIMIT 1')
          .get(String(usedWord)) as { id: string } | undefined;
        if (vocabRow) {
          db.prepare(`
            UPDATE user_vocabulary
            SET used_in_simulator_count = used_in_simulator_count + 1,
                mastery_level = MIN(5, mastery_level + 1),
                last_reviewed_at = ?
            WHERE user_id = ? AND vocabulary_id = ?
          `).run(now, req.userId!, vocabRow.id);
        }
      }
    }

    const userTurnObj = {
      role: 'user',
      text: String(message).trim(),
      timestamp: now,
      feedback: {
        grammar_ok: turnResult.grammar_ok,
        corrected: turnResult.corrected,
        grammar_topic: turnResult.grammar_topic,
        explanation_en: turnResult.explanation_en,
        explanation_uz: turnResult.explanation_uz,
        used_mood_vocab: turnResult.used_mood_vocab,
        pronunciation_tip: turnResult.pronunciation_tip,
        score: turnResult.score,
      },
    };
    const aiTurnObj = {
      role: 'ai',
      text: turnResult.ai_reply,
      timestamp: nowIso(),
    };

    const updatedMessages = [...messages, userTurnObj, aiTurnObj];
    db.prepare(`
      UPDATE conversations
      SET messages_json = ?, grammar_score = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(updatedMessages), turnResult.score, now, conv.id);

    const bonusXp = (turnResult.used_mood_vocab?.length || 0) * 12;
    recordLearningProgress(req.userId!, 20 + bonusXp, {
      speaking_score: turnResult.score,
      grammar_score: turnResult.grammar_ok ? Math.max(85, turnResult.score) : Math.min(72, turnResult.score),
    });

    res.json({
      messages: updatedMessages,
      recordedMistakeId,
      user: getHydratedUser(req.userId!),
    });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'Simulator turn failed.' });
  }
});

// ============================================================================
// 3. DETECTIVE MODE (Mystery Board + Validated Solutions + Mistake Converter)
// ============================================================================

learningRouter.get('/detective/cases', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM detective_cases
       WHERE is_curated = 1 OR user_id = ?
       ORDER BY created_at DESC LIMIT 20`
    )
    .all(req.userId!) as Array<Record<string, any>>;

  const cases = rows.map((c) => {
    const ev = db.prepare('SELECT * FROM evidence WHERE case_id = ?').all(c.id);
    // Do NOT send culprit_id before investigation submission so answers are server-validated!
    return {
      id: c.id,
      title: c.title,
      grammar_topic: c.grammar_topic,
      cefr_level: c.cefr_level,
      premise: c.premise,
      timeline: JSON.parse(c.timeline_json || '[]'),
      suspects: JSON.parse(c.suspects_json || '[]'),
      evidence: ev.map((e: any) => ({
        id: e.id,
        label: e.label,
        statement_with_clue: e.statement_with_clue,
        // Keep grammar note hidden until solved
      })),
      source_mistake_id: c.source_mistake_id,
    };
  });

  const mistakes = db
    .prepare('SELECT * FROM mistakes WHERE user_id = ? ORDER BY created_at DESC LIMIT 15')
    .all(req.userId!);

  res.json({ cases, mistakes });
});

learningRouter.post('/detective/solve', requireAuth, (req: AuthenticatedRequest, res) => {
  const { caseId, accusedSuspectId } = req.body || {};
  const c = db.prepare('SELECT * FROM detective_cases WHERE id = ?').get(caseId) as
    | Record<string, any>
    | undefined;
  if (!c) {
    res.status(404).json({ error: 'Case not found.' });
    return;
  }

  const solved = accusedSuspectId === c.culprit_id;
  const fullEvidence = db.prepare('SELECT * FROM evidence WHERE case_id = ?').all(c.id);

  if (solved && c.source_mistake_id) {
    db.prepare('UPDATE mistakes SET resolved = 1 WHERE id = ? AND user_id = ?').run(
      c.source_mistake_id,
      req.userId!
    );
  }

  recordLearningProgress(req.userId!, solved ? 35 : 8, {
    grammar_score: solved ? 95 : 55,
  });

  res.json({
    solved,
    culpritId: c.culprit_id,
    grammarSmokingGun: c.grammar_smoking_gun,
    explanationEn: c.explanation_en,
    explanationUz: c.explanation_uz,
    evidenceDetails: fullEvidence,
    user: getHydratedUser(req.userId!),
  });
});

learningRouter.post('/detective/generate', requireAuth, rateLimit('ai_detective', 8, 60_000), async (req: AuthenticatedRequest, res) => {
  const { grammarTopic = 'tenses', mistakeId } = req.body || {};
  const quota = checkAndReserveQuota(req.userId!, 'detective', 4);
  if (!quota.allowed) {
    res.status(403).json({ error: quota.reason });
    return;
  }

  const profile = db.prepare('SELECT cefr_level FROM profiles WHERE user_id = ?').get(req.userId!) as {
    cefr_level: string;
  };

  let mistakeContext: { original: string; corrected: string; explanation_en: string } | undefined;
  let effectiveTopic = grammarTopic;

  if (mistakeId) {
    const m = db
      .prepare('SELECT * FROM mistakes WHERE id = ? AND user_id = ?')
      .get(mistakeId, req.userId!) as Record<string, any> | undefined;
    if (m) {
      effectiveTopic = m.grammar_topic || grammarTopic;
      mistakeContext = {
        original: m.original_text,
        corrected: m.corrected_text,
        explanation_en: m.explanation_en,
      };
    }
  }

  try {
    const generated = await generateDetectiveCaseAi({
      userId: req.userId!,
      grammarTopic: effectiveTopic,
      cefrLevel: profile.cefr_level || 'B2',
      mistakeContext,
    });

    const caseId = uuid();
    const now = nowIso();
    db.prepare(`
      INSERT INTO detective_cases (
        id, user_id, title, grammar_topic, cefr_level, premise,
        timeline_json, suspects_json, culprit_id, grammar_smoking_gun,
        explanation_en, explanation_uz, source_mistake_id, is_curated, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      caseId,
      req.userId!,
      generated.title,
      effectiveTopic,
      profile.cefr_level || 'B2',
      generated.premise,
      JSON.stringify(generated.timeline || []),
      JSON.stringify(generated.suspects || []),
      generated.culprit_id,
      generated.grammar_smoking_gun,
      generated.explanation_en,
      generated.explanation_uz,
      mistakeId || null,
      now
    );

    const insertEv = db.prepare(`
      INSERT INTO evidence (id, case_id, label, statement_with_clue, has_grammar_contradiction, grammar_note)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const clientEvidence: Array<Record<string, any>> = [];
    for (const ev of generated.evidence || []) {
      const evId = uuid();
      insertEv.run(evId, caseId, ev.label, ev.statement_with_clue, ev.has_grammar_contradiction ? 1 : 0, ev.grammar_note);
      clientEvidence.push({
        id: evId,
        label: ev.label,
        statement_with_clue: ev.statement_with_clue,
      });
    }

    if (mistakeId) {
      db.prepare('UPDATE mistakes SET converted_case_id = ? WHERE id = ?').run(caseId, mistakeId);
    }

    res.status(201).json({
      caseItem: {
        id: caseId,
        title: generated.title,
        grammar_topic: effectiveTopic,
        cefr_level: profile.cefr_level || 'B2',
        premise: generated.premise,
        timeline: generated.timeline,
        suspects: generated.suspects,
        evidence: clientEvidence,
        source_mistake_id: mistakeId || null,
      },
      user: getHydratedUser(req.userId!),
    });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'Failed to generate Detective mystery case.' });
  }
});

// ============================================================================
// 4. AI TEACHER & PERSONALIZED STUDY PLAN + VOICE (TTS / STT)
// ============================================================================

learningRouter.post('/teacher/ask', requireAuth, rateLimit('ai_teacher', 15, 60_000), async (req: AuthenticatedRequest, res) => {
  const { question, mode = 'explain' } = req.body || {};
  if (!question || !String(question).trim()) {
    res.status(400).json({ error: 'Enter an English question or sentence.' });
    return;
  }

  const quota = checkAndReserveQuota(req.userId!, 'ai_teacher', 2);
  if (!quota.allowed) {
    res.status(403).json({ error: quota.reason });
    return;
  }

  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.userId!) as Record<string, any>;
  const recentMistakes = db
    .prepare('SELECT grammar_topic, original_text FROM mistakes WHERE user_id = ? AND resolved = 0 LIMIT 3')
    .all(req.userId!) as Array<{ grammar_topic: string; original_text: string }>;

  const contextStr = `CEFR ${profile.cefr_level}, Mood: ${profile.current_mood}, Retention: ${profile.retention_score}%, Grammar: ${profile.grammar_score}%, Speaking: ${profile.speaking_score}%, Unresolved Mistakes: ${
    recentMistakes.map((m) => `${m.grammar_topic} ("${m.original_text}")`).join('; ') || 'none recorded yet'
  }`;

  try {
    const reply = await askAiTeacher({
      userId: req.userId!,
      question: String(question).trim(),
      mode,
      learnerContext: contextStr,
    });

    if (mode === 'study_plan') {
      db.prepare('UPDATE profiles SET personalized_plan_json = ?, updated_at = ? WHERE user_id = ?').run(
        JSON.stringify(reply),
        nowIso(),
        req.userId!
      );
    }

    recordLearningProgress(req.userId!, 12);
    res.json({ reply, user: getHydratedUser(req.userId!) });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'AI Teacher unavailable.' });
  }
});

learningRouter.post('/voice/tts', requireAuth, rateLimit('ai_tts', 20, 60_000), async (req: AuthenticatedRequest, res) => {
  const { text, voiceName } = req.body || {};
  if (!text || !String(text).trim()) {
    res.status(400).json({ error: 'Text is required for speech synthesis.' });
    return;
  }

  const quota = checkAndReserveQuota(req.userId!, 'tts', 1);
  if (!quota.allowed) {
    res.status(403).json({ error: quota.reason, fallbackToBrowserSpeech: true });
    return;
  }

  if (!isGeminiConfigured()) {
    res.status(503).json({ error: 'Gemini TTS not configured.', fallbackToBrowserSpeech: true });
    return;
  }

  try {
    const { base64Wav } = await synthesizeSpeechWav({
      userId: req.userId!,
      text: String(text),
      voiceName,
    });
    res.json({ base64Wav, mimeType: 'audio/wav', user: getHydratedUser(req.userId!) });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'TTS generation failed.', fallbackToBrowserSpeech: true });
  }
});

learningRouter.post('/voice/stt', requireAuth, rateLimit('ai_stt', 15, 60_000), async (req: AuthenticatedRequest, res) => {
  const { base64Audio, mimeType } = req.body || {};
  if (!base64Audio) {
    res.status(400).json({ error: 'Audio payload is required.' });
    return;
  }

  const quota = checkAndReserveQuota(req.userId!, 'stt', 1);
  if (!quota.allowed) {
    res.status(403).json({ error: quota.reason });
    return;
  }

  try {
    const { transcript } = await transcribeAudioBase64({
      userId: req.userId!,
      base64Audio,
      mimeType: mimeType || 'audio/webm',
    });
    recordLearningProgress(req.userId!, 8, { pronunciation_score: transcript.length > 8 ? 88 : 70 });
    res.json({ transcript, user: getHydratedUser(req.userId!) });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'Audio transcription failed.' });
  }
});

// ============================================================================
// 5. USER DASHBOARD OVERVIEW, USAGE HISTORY & NOTIFICATIONS
// ============================================================================

learningRouter.get('/dashboard-summary', requireAuth, (req: AuthenticatedRequest, res) => {
  const vocabSavedCount = (
    db.prepare('SELECT COUNT(*) as c FROM user_vocabulary WHERE user_id = ?').get(req.userId!) as { c: number }
  ).c;
  const simulatorConversationsCount = (
    db.prepare('SELECT COUNT(*) as c FROM conversations WHERE user_id = ?').get(req.userId!) as { c: number }
  ).c;
  const unresolvedMistakes = db
    .prepare('SELECT * FROM mistakes WHERE user_id = ? AND resolved = 0 ORDER BY created_at DESC LIMIT 5')
    .all(req.userId!);
  const achievements = db
    .prepare('SELECT * FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC')
    .all(req.userId!);
  const usageHistory = db
    .prepare(
      `SELECT id, feature_mode, model_name, total_tokens, audio_seconds, credits_charged, status, created_at
       FROM usage_logs
       WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 25`
    )
    .all(req.userId!);
  const notifications = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 15')
    .all(req.userId!);

  const modeBreakdown = db
    .prepare(
      `SELECT feature_mode as mode, COUNT(*) as sessions, SUM(credits_charged) as credits
       FROM usage_logs
       WHERE user_id = ? AND status = 'success'
       GROUP BY feature_mode`
    )
    .all(req.userId!);

  res.json({
    stats: {
      vocabSavedCount,
      simulatorConversationsCount,
    },
    unresolvedMistakes,
    achievements,
    usageHistory,
    notifications,
    modeBreakdown,
  });
});

learningRouter.post('/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.userId!);
  res.json({ ok: true });
});

// ============================================================================
// 6. VISUAL QUEST & SPEED MATCH ARENA GAME
// ============================================================================

const CURATED_VISUAL_SCENES: any[] = [
  {
    id: 'oxford_gothic_library',
    title: 'The Gothic Archival Vault Mystery',
    category: 'Oxford Academic Investigation',
    cefrLevel: 'B2',
    imageSrc: '/src/assets/images/scene_oxford_gothic_library_1793800920229.jpg',
    briefing:
      'A confidential handwritten historical manuscript disappeared from the Oxford archival reading room. Inspect the bookshelves, stained-glass gallery, and reading carrels to recover evidence and solve the grammar riddles.',
    objectiveEn: 'Inspect 4 interactive hotspots, pronounce the forensic terms, and solve the grammar puzzles.',
    objectiveUz: '4 ta interaktiv dalil nuqtasini toping, so‘zlarni talaffuz qiling va grammatik jumboqlarni yeching.',
    hotspots: [
      {
        id: 'oxford_codex',
        title: 'Ancient Archival Codex',
        xPct: 29,
        yPct: 40,
        clueWord: 'manuscript',
        phonetic: '/ˈmæn.jə.skrɪpt/',
        definitionEn: 'A book, document, or piece of music written by hand rather than typed or printed.',
        translationUz: 'qo‘lyozma',
        grammarQuestion: 'Which sentence correctly uses the Past Continuous tense?',
        options: [
          'While the archivist was cataloging books, the alarm sounded.',
          'While the archivist was cataloged books, the alarm had sound.',
          'While the archivist cataloging books, the alarm was sounding.',
        ],
        correctIndex: 0,
        explanationEn: 'Past Continuous ("was cataloging") describes an action in progress when interrupted by a past event ("sounded").',
        explanationUz: 'Davomli o‘tgan zamon ("was cataloging") boshqa qisqa harakat ("sounded") bilan to‘xtatilganda ishlatiladi.',
      },
      {
        id: 'oxford_clock',
        title: 'Grandfather Brass Chronometer',
        xPct: 76,
        yPct: 70,
        clueWord: 'chronological',
        phonetic: '/ˌkrɒn.əˈlɒdʒ.ɪ.kəl/',
        definitionEn: 'Arranged in the order of time occurrence.',
        translationUz: 'xronologik, vaqt ketma-ketligidagi',
        grammarQuestion: 'Complete the sentence: "The timeline must be analyzed in ___ order."',
        options: ['chronological', 'chronology', 'chronologically'],
        correctIndex: 0,
        explanationEn: 'The adjective "chronological" modifies the noun "order".',
        explanationUz: '"Order" otini sifat ("chronological") aniqlab keladi.',
      },
      {
        id: 'oxford_window',
        title: 'Stained-Glass Arched Gallery',
        xPct: 18,
        yPct: 24,
        clueWord: 'illuminated',
        phonetic: '/ɪˈluː.mɪ.neɪ.tɪd/',
        definitionEn: 'Lit up with light or decorated with gold and bright colors in medieval texts.',
        translationUz: 'yoritilgan, naqshinkor',
        grammarQuestion: 'Choose the correct passive voice sentence:',
        options: [
          'The gallery was illuminated by morning sunlight.',
          'The gallery was illuminate by morning sunlight.',
          'The gallery has being illuminated by morning sunlight.',
        ],
        correctIndex: 0,
        explanationEn: 'Past simple passive requires "was/were + past participle" ("was illuminated").',
        explanationUz: 'O‘tgan zamon majhul nisbati "was + V3" ("was illuminated") bo‘ladi.',
      },
      {
        id: 'oxford_stairs',
        title: 'Spiral Vault Staircase',
        xPct: 91,
        yPct: 80,
        clueWord: 'labyrinthine',
        phonetic: '/ˌlæb.əˈrɪn.θaɪn/',
        definitionEn: 'Complicated, intricate, and resembling an ancient maze.',
        translationUz: 'chigal, labirintsimon',
        grammarQuestion: 'Choose the correct preposition: "The suspect vanished ___ the staircase."',
        options: ['down', 'at', 'on'],
        correctIndex: 0,
        explanationEn: 'Movement descending stairs takes "down the staircase".',
        explanationUz: 'Zina bo‘ylab pastga harakatlanish uchun "down" qo‘llanadi.',
      },
    ],
  },
  {
    id: 'silicon_ai_lab',
    title: 'Silicon Valley AI Quantum Breach',
    category: 'Cyber Investigation',
    cefrLevel: 'B2',
    imageSrc: '/src/assets/images/scene_silicon_ai_lab_1793800921046.jpg',
    briefing:
      'An unauthorized neural network parameter export occurred at 02:15 AM from the flagship AI lab. Examine the quantum server rack, holographic whiteboard, biometric access gate, and terminal screen.',
    objectiveEn: 'Recover the 4 encrypted security tokens by solving conditional and passive cybersecurity sentences.',
    objectiveUz: 'Shart va majhul nisbatdagi kiberxavfsizlik savollariga javob berib, 4 ta tokenni qo‘lga kiriting.',
    hotspots: [
      {
        id: 'silicon_server',
        title: 'Quantum Server Core',
        xPct: 14,
        yPct: 62,
        clueWord: 'encryption',
        phonetic: '/ɪnˈkrɪp.ʃən/',
        definitionEn: 'The process of converting information or data into a secure secret code.',
        translationUz: 'shifrlash, maxfiylashtirish',
        grammarQuestion: 'Choose the correct Third Conditional sentence:',
        options: [
          "If the firewall had been active, the breach wouldn't have occurred.",
          "If the firewall was active, the breach wouldn't occur.",
          "If the firewall would be active, the breach hadn't occurred.",
        ],
        correctIndex: 0,
        explanationEn: 'Third conditional for past hypothetical: "If + had been, ... wouldn\'t have + V3".',
        explanationUz: 'Uchinchi tur shart ergash gap: "If + had been, ... wouldn\'t have occurred".',
      },
      {
        id: 'silicon_hologram',
        title: 'Holographic Neural Board',
        xPct: 37,
        yPct: 54,
        clueWord: 'algorithm',
        phonetic: '/ˈæl.ɡə.rɪ.ðəm/',
        definitionEn: 'A precise step-by-step procedure for solving a computational problem.',
        translationUz: 'algoritm',
        grammarQuestion: 'Choose the correct sentence:',
        options: [
          'The algorithm is capable of processing billions of tokens.',
          'The algorithm is capable to process billions of tokens.',
          'The algorithm capable of process billions of tokens.',
        ],
        correctIndex: 0,
        explanationEn: '"Capable of" is followed by a gerund ("processing").',
        explanationUz: '"Capable of" dan keyin fe’lning -ing shakli ("processing") keladi.',
      },
      {
        id: 'silicon_terminal',
        title: 'Biometric Access Gate',
        xPct: 69,
        yPct: 66,
        clueWord: 'authenticate',
        phonetic: '/ɔːˈθen.tɪ.keɪt/',
        definitionEn: 'To prove that someone or something is genuine and authorized.',
        translationUz: 'haqiqiyligini tasdiqlamoq',
        grammarQuestion: 'Complete: "Every engineer must ___ their credentials before entering."',
        options: ['authenticate', 'authenticating', 'authenticated'],
        correctIndex: 0,
        explanationEn: 'Modal verb "must" requires the bare infinitive ("authenticate").',
        explanationUz: '"Must" modal fe’lidan so‘ng asosiy fe’l noaniq shaklda ("authenticate") bo‘ladi.',
      },
      {
        id: 'silicon_skyline',
        title: 'Panoramic City Viewpoint',
        xPct: 88,
        yPct: 40,
        clueWord: 'panoramic',
        phonetic: '/ˌpæn.əˈræm.ɪk/',
        definitionEn: 'With a wide view of an extensive area in all directions.',
        translationUz: 'keng qamrovli, panoramali',
        grammarQuestion: 'Choose the correct word: "The conference room offers a ___ view of the valley."',
        options: ['panoramic', 'panoramically', 'panorama'],
        correctIndex: 0,
        explanationEn: 'Adjective "panoramic" describes the noun "view".',
        explanationUz: '"View" so‘zi oldidan sifat "panoramic" keladi.',
      },
    ],
  },
  {
    id: 'zurich_bistro',
    title: 'The Midnight Zurich Bistro',
    category: 'Diplomatic Intrigue',
    cefrLevel: 'B1',
    imageSrc: '/src/assets/images/scene_zurich_bistro_1793800922188.jpg',
    briefing:
      'During an international diplomatic dinner, an envelope was exchanged inside a rain-swept European bistro. Examine the private corner booth, wine decanter, wood paneling, and rainy window.',
    objectiveEn: 'Investigate the hospitality setting and unlock the dialogue vocabulary.',
    objectiveUz: 'Bistro muhitidagi dalillarni o‘rganib, restoran va diplomatik muloqot so‘zlarini egallang.',
    hotspots: [
      {
        id: 'bistro_booth',
        title: 'Corner VIP Table',
        xPct: 24,
        yPct: 60,
        clueWord: 'convivial',
        phonetic: '/kənˈvɪv.i.əl/',
        definitionEn: 'Cheerful, friendly, and lively atmosphere.',
        translationUz: 'samimiy, do‘stona',
        grammarQuestion: 'Complete: "The atmosphere at the table was remarkably ___."',
        options: ['convivial', 'convivially', 'conviviality'],
        correctIndex: 0,
        explanationEn: 'Predicate adjective following "was remarkably" is "convivial".',
        explanationUz: '"Was remarkably" dan so‘ng sifat "convivial" ishlatiladi.',
      },
      {
        id: 'bistro_wine',
        title: 'Sommelier Decanter Table',
        xPct: 24,
        yPct: 80,
        clueWord: 'beverage',
        phonetic: '/ˈbev.ər.ɪdʒ/',
        definitionEn: 'A drink, especially one other than water.',
        translationUz: 'ichimlik',
        grammarQuestion: 'Choose the correct modal sentence for ordering politely:',
        options: [
          'Could we please have another carafe of water?',
          'May we to have another carafe of water?',
          'Could we having another carafe of water?',
        ],
        correctIndex: 0,
        explanationEn: '"Could we please have..." is polite standard English for requests.',
        explanationUz: 'Muloyim buyurtma berish uchun "Could we please have..." ishlatiladi.',
      },
      {
        id: 'bistro_window',
        title: 'Rainy Window Carrel',
        xPct: 8,
        yPct: 45,
        clueWord: 'ambience',
        phonetic: '/ˈæm.bi.əns/',
        definitionEn: 'The character and atmosphere of a place.',
        translationUz: 'muhit, fayz',
        grammarQuestion: 'Choose the correct preposition: "Rain droplets tapped ___ the window glass."',
        options: ['against', 'into', 'atwards'],
        correctIndex: 0,
        explanationEn: 'Preposition "against" is used for light collision with a surface.',
        explanationUz: 'Deraza oynasiga tegish uchun "against the window" qo‘llanadi.',
      },
      {
        id: 'bistro_panel',
        title: 'Carved Walnut Panel',
        xPct: 32,
        yPct: 28,
        clueWord: 'hospitality',
        phonetic: '/ˌhɒs.pɪˈtæl.ə.ti/',
        definitionEn: 'The friendly and generous reception and entertainment of guests.',
        translationUz: 'mehmondo‘stlik',
        grammarQuestion: 'Complete: "They expressed gratitude for the warm ___."',
        options: ['hospitality', 'hospitable', 'hospitably'],
        correctIndex: 0,
        explanationEn: 'Noun "hospitality" is required after the adjective "warm".',
        explanationUz: '"Warm" sifatidan keyin ot "hospitality" qo‘llanadi.',
      },
    ],
  },
];

const ARENA_DECK = [
  { id: 'a1', word: 'resilient', phonetic: '/rɪˈzɪl.i.ənt/', translationUz: 'bardoshli, chidamli', definitionEn: 'Able to recover steadily after difficulties.', category: 'Adjective' },
  { id: 'a2', word: 'articulate', phonetic: '/ɑːˈtɪk.jə.lət/', translationUz: 'ravon so‘zlaydigan, aniq', definitionEn: 'Expressing ideas clearly and effectively in speech.', category: 'Adjective' },
  { id: 'a3', word: 'negotiate', phonetic: '/nɪˈɡəʊ.ʃi.eɪt/', translationUz: 'muzokara olib bormoq', definitionEn: 'To discuss something formally to reach an agreement.', category: 'Verb' },
  { id: 'a4', word: 'composure', phonetic: '/kəmˈpəʊ.ʒər/', translationUz: 'og‘ir-bosiqlik, xotirjamlik', definitionEn: 'Calm self-control under pressure.', category: 'Noun' },
  { id: 'a5', word: 'itinerary', phonetic: '/aɪˈtɪn.ər.ər.i/', translationUz: 'sayohat yo‘nalishi, reja', definitionEn: 'A planned route or detailed journey schedule.', category: 'Noun' },
  { id: 'a6', word: 'unravel', phonetic: '/ʌnˈræv.əl/', translationUz: 'yechmoq, fosh etmoq', definitionEn: 'To solve or explain a mystery or complicated puzzle.', category: 'Verb' },
  { id: 'a7', word: 'mitigate', phonetic: '/ˈmɪt.ɪ.ɡeɪt/', translationUz: 'yumshatmoq, kamaytirmoq', definitionEn: 'To make something less harmful or severe.', category: 'Verb' },
  { id: 'a8', word: 'momentum', phonetic: '/məˈmen.təm/', translationUz: 'sur’at, shiddat', definitionEn: 'The force or speed with which something moves forward.', category: 'Noun' },
  { id: 'a9', word: 'solace', phonetic: '/ˈsɒl.ɪs/', translationUz: 'taskin, yupanch', definitionEn: 'Comfort received during a time of disappointment.', category: 'Noun' },
  { id: 'a10', word: 'replenish', phonetic: '/rɪˈplen.ɪʃ/', translationUz: 'qayta to‘ldirmoq, tiklamoq', definitionEn: 'To restore energy or supplies to full capacity.', category: 'Verb' },
  { id: 'a11', word: 'inquisitive', phonetic: '/ɪnˈkwɪz.ə.tɪv/', translationUz: 'qiziquvchan, sinchkov', definitionEn: 'Eager to investigate and learn new things.', category: 'Adjective' },
  { id: 'a12', word: 'radiant', phonetic: '/ˈreɪ.di.ənt/', translationUz: 'nurli, quvonchli', definitionEn: 'Shining brightly with obvious happiness and health.', category: 'Adjective' },
];

learningRouter.get('/game/scenes', requireAuth, (_req: AuthenticatedRequest, res) => {
  res.json({ scenes: CURATED_VISUAL_SCENES, arenaDeck: ARENA_DECK });
});

learningRouter.post('/game/solve-hotspot', requireAuth, (req: AuthenticatedRequest, res) => {
  const { sceneId, hotspotId, chosenIndex } = req.body || {};
  const scene = CURATED_VISUAL_SCENES.find((s) => s.id === sceneId);
  if (!scene) {
    res.status(404).json({ error: 'Scene not found.' });
    return;
  }
  const hotspot = scene.hotspots.find((h: any) => h.id === hotspotId);
  if (!hotspot) {
    res.status(404).json({ error: 'Hotspot not found.' });
    return;
  }

  const isCorrect = chosenIndex === hotspot.correctIndex;
  if (isCorrect) {
    // Add discovered word to learner's active vocabulary bank if not already there!
    const vocabRow = db
      .prepare('SELECT id FROM vocabulary WHERE LOWER(word) = LOWER(?) LIMIT 1')
      .get(hotspot.clueWord) as { id: string } | undefined;

    const now = nowIso();
    if (vocabRow) {
      db.prepare(`
        INSERT OR IGNORE INTO user_vocabulary (id, user_id, vocabulary_id, mastery_level, last_reviewed_at)
        VALUES (?, ?, ?, 2, ?)
      `).run(uuid(), req.userId!, vocabRow.id, now);
    }

    recordLearningProgress(req.userId!, 25, {
      grammar_score: 90,
      retention_score: 85,
    });
  }

  res.json({
    isCorrect,
    hotspot,
    user: getHydratedUser(req.userId!),
  });
});

learningRouter.post('/game/arena-result', requireAuth, (req: AuthenticatedRequest, res) => {
  const { score = 0, matches = 0, comboMax = 1 } = req.body || {};
  const xpAward = Math.min(150, Math.round(Number(score) / 10) + Number(comboMax) * 5);

  recordLearningProgress(req.userId!, xpAward, {
    retention_score: Math.min(100, 60 + Number(matches) * 5),
  });

  res.json({
    xpAwarded: xpAward,
    user: getHydratedUser(req.userId!),
  });
});

