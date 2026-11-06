import { GoogleGenAI, Type } from '@google/genai';
import { db, getAiSetting, nowIso, todayDateStr, uuid } from './db.ts';
import { syncUserEntitlementsAndQuotas } from './security.ts';

function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey === 'YOUR_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isGeminiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey !== 'YOUR_GEMINI_API_KEY');
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  planId: string;
}

export function checkAndReserveQuota(
  userId: string,
  featureMode: 'mood_vocab' | 'mood_story' | 'simulator' | 'detective' | 'ai_teacher' | 'tts' | 'stt',
  creditsNeeded = 1
): QuotaCheckResult {
  syncUserEntitlementsAndQuotas(userId);

  // 1. Check Global Daily Cost Cap Circuit Breaker
  const globalCap = parseFloat(getAiSetting('global_daily_usd_cap', '50.00')) || 50;
  const todayPrefix = todayDateStr();
  const todaySpend = (
    db
      .prepare('SELECT COALESCE(SUM(estimated_cost_usd), 0) as total FROM usage_logs WHERE created_at LIKE ?')
      .get(`${todayPrefix}%`) as { total: number }
  ).total;

  if (todaySpend >= globalCap) {
    return {
      allowed: false,
      reason: 'Platform daily AI cost protection cap reached. Admin can raise the cap in Super Admin > AI Controls.',
      planId: 'FREE',
    };
  }

  // 2. Verify server-side subscription status (NEVER trust frontend)
  const sub = db
    .prepare('SELECT plan_id, status FROM subscriptions WHERE user_id = ?')
    .get(userId) as { plan_id: string; status: string } | undefined;

  const effectivePlanId =
    sub && (sub.status === 'active' || sub.status === 'trialing') ? sub.plan_id : 'FREE';

  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(effectivePlanId) as Record<string, any>;
  const credits = db.prepare('SELECT * FROM credits WHERE user_id = ?').get(userId) as Record<string, any>;

  const totalCreditsAvailable =
    (credits.monthly_allowance || 0) + (credits.bonus_credits || 0) - (credits.monthly_used || 0);

  if (totalCreditsAvailable < creditsNeeded) {
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, is_read, created_at)
      VALUES (?, ?, 'quota', 'Monthly AI Credits Reached', 'You have used all monthly AI credits on your current tier. Upgrade your plan or earn referral credits to continue generating new AI sessions.', 0, ?)
    `).run(uuid(), userId, nowIso());
    return {
      allowed: false,
      reason: 'Monthly AI credit allowance exhausted. Upgrade your subscription or redeem bonus credits.',
      planId: effectivePlanId,
    };
  }

  // 3. Per-mode daily entitlement checks
  if (featureMode === 'mood_vocab' && credits.daily_vocab_used >= plan.daily_vocab_limit) {
    return {
      allowed: false,
      reason: `Daily Mood Vocabulary generation limit (${plan.daily_vocab_limit}/day on ${plan.name}) reached.`,
      planId: effectivePlanId,
    };
  }
  if (featureMode === 'mood_story' && credits.daily_story_used >= plan.daily_story_limit) {
    return {
      allowed: false,
      reason: `Daily Adaptive Story limit (${plan.daily_story_limit}/day on ${plan.name}) reached.`,
      planId: effectivePlanId,
    };
  }
  if (featureMode === 'simulator' && credits.daily_simulator_used >= plan.daily_simulator_turns) {
    return {
      allowed: false,
      reason: `Daily Simulator RPG turn limit (${plan.daily_simulator_turns}/day on ${plan.name}) reached.`,
      planId: effectivePlanId,
    };
  }
  if (featureMode === 'detective' && credits.daily_detective_used >= plan.daily_detective_cases) {
    return {
      allowed: false,
      reason: `Daily Detective Mystery generation limit (${plan.daily_detective_cases}/day on ${plan.name}) reached.`,
      planId: effectivePlanId,
    };
  }
  if (featureMode === 'ai_teacher') {
    if (!plan.has_ai_teacher && credits.daily_teacher_used >= plan.daily_ai_teacher_msgs) {
      return {
        allowed: false,
        reason: `Daily AI Teacher preview limit (${plan.daily_ai_teacher_msgs} messages/day) reached. Upgrade to Premium or Pro for full AI Teacher access.`,
        planId: effectivePlanId,
      };
    }
    if (credits.daily_teacher_used >= plan.daily_ai_teacher_msgs) {
      return {
        allowed: false,
        reason: `Daily AI Teacher message limit (${plan.daily_ai_teacher_msgs}/day) reached.`,
        planId: effectivePlanId,
      };
    }
  }
  if ((featureMode === 'tts' || featureMode === 'stt') && plan.monthly_voice_minutes > 0) {
    if (credits.monthly_voice_seconds_used >= plan.monthly_voice_minutes * 60) {
      return {
        allowed: false,
        reason: `Monthly AI Voice allowance (${plan.monthly_voice_minutes} min) reached.`,
        planId: effectivePlanId,
      };
    }
  } else if ((featureMode === 'tts' || featureMode === 'stt') && !plan.has_voice_mode) {
    return {
      allowed: false,
      reason: 'Neural AI Voice synthesis & server transcription require Premium, Pro, or Yearly plan (browser Web Speech remains free).',
      planId: effectivePlanId,
    };
  }

  return { allowed: true, planId: effectivePlanId };
}

export function recordAiUsage(params: {
  userId: string;
  featureMode: 'mood_vocab' | 'mood_story' | 'simulator' | 'detective' | 'ai_teacher' | 'tts' | 'stt';
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  audioSeconds?: number;
  creditsCharged: number;
  status: 'success' | 'error';
  errorMessage?: string;
}): number {
  const inputRate = parseFloat(getAiSetting('input_cost_per_1m_usd', '0.15')) || 0.15;
  const outputRate = parseFloat(getAiSetting('output_cost_per_1m_usd', '0.60')) || 0.6;
  const ttsRatePerMin = parseFloat(getAiSetting('tts_cost_per_minute_usd', '0.015')) || 0.015;

  const tokenCost =
    (params.promptTokens / 1_000_000) * inputRate +
    (params.completionTokens / 1_000_000) * outputRate;
  const audioCost = ((params.audioSeconds || 0) / 60) * ttsRatePerMin;
  const totalCostUsd = Number((tokenCost + audioCost).toFixed(6));

  db.prepare(`
    INSERT INTO usage_logs (
      id, user_id, feature_mode, model_name, prompt_tokens, completion_tokens,
      total_tokens, audio_seconds, estimated_cost_usd, credits_charged, status, error_message, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuid(),
    params.userId,
    params.featureMode,
    params.modelName,
    params.promptTokens,
    params.completionTokens,
    params.promptTokens + params.completionTokens,
    params.audioSeconds || 0,
    totalCostUsd,
    params.status === 'success' ? params.creditsCharged : 0,
    params.status,
    params.errorMessage || null,
    nowIso()
  );

  if (params.status === 'success') {
    const colMap: Record<string, string> = {
      mood_vocab: 'daily_vocab_used = daily_vocab_used + 1',
      mood_story: 'daily_story_used = daily_story_used + 1',
      simulator: 'daily_simulator_used = daily_simulator_used + 1',
      detective: 'daily_detective_used = daily_detective_used + 1',
      ai_teacher: 'daily_teacher_used = daily_teacher_used + 1',
      tts: `monthly_voice_seconds_used = monthly_voice_seconds_used + ${Math.ceil(params.audioSeconds || 6)}`,
      stt: `monthly_voice_seconds_used = monthly_voice_seconds_used + ${Math.ceil(params.audioSeconds || 6)}`,
    };
    const colUpdate = colMap[params.featureMode] || 'monthly_used = monthly_used';
    db.prepare(`
      UPDATE credits
      SET monthly_used = monthly_used + ?,
          ${colUpdate}
      WHERE user_id = ?
    `).run(params.creditsCharged, params.userId);
  }

  return totalCostUsd;
}

export async function generateMoodVocabulary(params: {
  userId: string;
  mood: string;
  cefrLevel: string;
}): Promise<Array<Record<string, string>>> {
  const model = getAiSetting('text_model', 'gemini-3.8-flash');
  const ai = getClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Set it in Settings > Secrets.');
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `Generate 3 high-utility English vocabulary words tailored for an English learner at CEFR level ${params.cefrLevel} who currently selected the learning mood "${params.mood}" (strictly educational language learning, never medical or mental health advice). Provide accurate IPA phonetics, part of speech, English definition, natural Uzbek Latin translation, Russian translation, English example sentence, and Uzbek translation of the example.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              phonetic: { type: Type.STRING },
              part_of_speech: { type: Type.STRING },
              definition_en: { type: Type.STRING },
              translation_uz: { type: Type.STRING },
              translation_ru: { type: Type.STRING },
              example_en: { type: Type.STRING },
              example_uz: { type: Type.STRING },
            },
            required: [
              'word',
              'phonetic',
              'part_of_speech',
              'definition_en',
              'translation_uz',
              'translation_ru',
              'example_en',
              'example_uz',
            ],
          },
        },
      },
    });

    const usage = response.usageMetadata;
    recordAiUsage({
      userId: params.userId,
      featureMode: 'mood_vocab',
      modelName: model,
      promptTokens: usage?.promptTokenCount || 180,
      completionTokens: usage?.candidatesTokenCount || 260,
      creditsCharged: 2,
      status: 'success',
    });

    return JSON.parse((response.text ?? '[]').trim());
  } catch (err: any) {
    recordAiUsage({
      userId: params.userId,
      featureMode: 'mood_vocab',
      modelName: model,
      promptTokens: 0,
      completionTokens: 0,
      creditsCharged: 0,
      status: 'error',
      errorMessage: err?.message || 'Gemini error',
    });
    throw err;
  }
}

export async function generateMoodStory(params: {
  userId: string;
  mood: string;
  cefrLevel: string;
  targetWords: string[];
}): Promise<Record<string, any>> {
  const model = getAiSetting('text_model', 'gemini-3.8-flash');
  const ai = getClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Set it in Settings > Secrets.');
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `Write an engaging 140-to-190-word contemporary English short story for CEFR level ${params.cefrLevel} matching the tone of mood "${params.mood}" (strictly educational fiction, no psychological diagnosis). Naturally weave in these vocabulary words if natural: ${params.targetWords.join(', ')}. Include a concise Uzbek summary, 4 key vocabulary items with Uzbek translations, and 2 multiple-choice reading comprehension questions (each with 3 options and 0-indexed correctIndex).`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content_en: { type: Type.STRING },
            summary_uz: { type: Type.STRING },
            vocabulary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  translation_uz: { type: Type.STRING },
                },
                required: ['word', 'translation_uz'],
              },
            },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ['question', 'options', 'correctIndex', 'explanation'],
              },
            },
          },
          required: ['title', 'content_en', 'summary_uz', 'vocabulary', 'questions'],
        },
      },
    });

    const usage = response.usageMetadata;
    recordAiUsage({
      userId: params.userId,
      featureMode: 'mood_story',
      modelName: model,
      promptTokens: usage?.promptTokenCount || 220,
      completionTokens: usage?.candidatesTokenCount || 450,
      creditsCharged: 3,
      status: 'success',
    });

    return JSON.parse((response.text ?? '{}').trim());
  } catch (err: any) {
    recordAiUsage({
      userId: params.userId,
      featureMode: 'mood_story',
      modelName: model,
      promptTokens: 0,
      completionTokens: 0,
      creditsCharged: 0,
      status: 'error',
      errorMessage: err?.message,
    });
    throw err;
  }
}

export async function generateSimulatorTurn(params: {
  userId: string;
  scenario: Record<string, any>;
  history: Array<{ role: string; text: string }>;
  userMessage: string;
  targetMoodWords: string[];
}): Promise<Record<string, any>> {
  const model = getAiSetting('text_model', 'gemini-3.8-flash');
  const ai = getClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Set it in Settings > Secrets.');
  }

  const transcript = params.history
    .slice(-8)
    .map((m) => `${m.role === 'ai' ? params.scenario.role_ai : 'Learner'}: ${m.text}`)
    .join('\n');

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `Scenario: "${params.scenario.title}" (${params.scenario.setting_description}).
You are roleplaying as: ${params.scenario.role_ai}.
The learner is roleplaying as: ${params.scenario.role_user} (CEFR ${params.scenario.cefr_level}).
Target vocabulary from the learner's Mood Mode bank: ${params.targetMoodWords.join(', ') || 'none'}.

Conversation so far:
${transcript}
Learner's latest reply: "${params.userMessage}"

Tasks:
1. Stay in character and write a natural 1-3 sentence response advancing the real-life scenario.
2. Honestly evaluate the learner's latest reply for English grammar & natural phrasing (do NOT invent mistakes if the sentence is already natural and grammatically valid!).
3. If there is a real grammar error, classify grammar_topic strictly as one of: tenses, articles, prepositions, pronouns, conditionals, passive_voice, reported_speech, modal_verbs, sentence_structure. Provide the corrected sentence, brief English explanation, and brief Uzbek explanation.
4. List which of the target vocabulary words (${params.targetMoodWords.join(', ')}) the learner successfully used in their latest reply.
5. Give an honest turn score from 0 to 100 based solely on clarity, grammar, and appropriateness of this reply.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            ai_reply: { type: Type.STRING },
            grammar_ok: { type: Type.BOOLEAN },
            corrected: { type: Type.STRING },
            grammar_topic: { type: Type.STRING },
            explanation_en: { type: Type.STRING },
            explanation_uz: { type: Type.STRING },
            used_mood_vocab: { type: Type.ARRAY, items: { type: Type.STRING } },
            pronunciation_tip: { type: Type.STRING },
            score: { type: Type.INTEGER },
          },
          required: [
            'ai_reply',
            'grammar_ok',
            'corrected',
            'grammar_topic',
            'explanation_en',
            'explanation_uz',
            'used_mood_vocab',
            'pronunciation_tip',
            'score',
          ],
        },
      },
    });

    const usage = response.usageMetadata;
    recordAiUsage({
      userId: params.userId,
      featureMode: 'simulator',
      modelName: model,
      promptTokens: usage?.promptTokenCount || 320,
      completionTokens: usage?.candidatesTokenCount || 280,
      creditsCharged: 2,
      status: 'success',
    });

    return JSON.parse((response.text ?? '{}').trim());
  } catch (err: any) {
    recordAiUsage({
      userId: params.userId,
      featureMode: 'simulator',
      modelName: model,
      promptTokens: 0,
      completionTokens: 0,
      creditsCharged: 0,
      status: 'error',
      errorMessage: err?.message,
    });
    throw err;
  }
}

export async function generateDetectiveCaseAi(params: {
  userId: string;
  grammarTopic: string;
  cefrLevel: string;
  mistakeContext?: { original: string; corrected: string; explanation_en: string };
}): Promise<Record<string, any>> {
  const model = getAiSetting('text_model', 'gemini-3.8-flash');
  const ai = getClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Set it in Settings > Secrets.');
  }

  const mistakePrompt = params.mistakeContext
    ? `IMPORTANT UNIFIED INTELLIGENCE REQUIREMENT: Build the culprit's statement around the exact type of grammar mistake the learner recently made ("${params.mistakeContext.original}" -> should be "${params.mistakeContext.corrected}").`
    : '';

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `Design a logically consistent, engaging fictional grammar mystery case for Detective Mode at CEFR level ${params.cefrLevel} targeting the English grammar topic "${params.grammarTopic}".
${mistakePrompt}
Rules for consistency:
- Provide 3 suspects with unique IDs ("suspect_1", "suspect_2", "suspect_3").
- Exactly ONE suspect (matching culprit_id) has BOTH a clear grammar error in "${params.grammarTopic}" inside their statement AND a timeline/alibi contradiction proving they are the culprit.
- The other 2 suspects MUST use 100% grammatically accurate English and consistent alibis.
- Provide 3 timeline events and 3 evidence items (exactly 1 with has_grammar_contradiction: true).
- Provide clear English and Uzbek explanations of the grammar clue.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            premise: { type: Type.STRING },
            timeline: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  time: { type: Type.STRING },
                  event: { type: Type.STRING },
                },
                required: ['time', 'event'],
              },
            },
            suspects: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  occupation: { type: Type.STRING },
                  alibi_time: { type: Type.STRING },
                  statement: { type: Type.STRING },
                },
                required: ['id', 'name', 'occupation', 'alibi_time', 'statement'],
              },
            },
            evidence: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  statement_with_clue: { type: Type.STRING },
                  has_grammar_contradiction: { type: Type.BOOLEAN },
                  grammar_note: { type: Type.STRING },
                },
                required: ['label', 'statement_with_clue', 'has_grammar_contradiction', 'grammar_note'],
              },
            },
            culprit_id: { type: Type.STRING },
            grammar_smoking_gun: { type: Type.STRING },
            explanation_en: { type: Type.STRING },
            explanation_uz: { type: Type.STRING },
          },
          required: [
            'title',
            'premise',
            'timeline',
            'suspects',
            'evidence',
            'culprit_id',
            'grammar_smoking_gun',
            'explanation_en',
            'explanation_uz',
          ],
        },
      },
    });

    const usage = response.usageMetadata;
    recordAiUsage({
      userId: params.userId,
      featureMode: 'detective',
      modelName: model,
      promptTokens: usage?.promptTokenCount || 350,
      completionTokens: usage?.candidatesTokenCount || 550,
      creditsCharged: 4,
      status: 'success',
    });

    return JSON.parse((response.text ?? '{}').trim());
  } catch (err: any) {
    recordAiUsage({
      userId: params.userId,
      featureMode: 'detective',
      modelName: model,
      promptTokens: 0,
      completionTokens: 0,
      creditsCharged: 0,
      status: 'error',
      errorMessage: err?.message,
    });
    throw err;
  }
}

export async function askAiTeacher(params: {
  userId: string;
  question: string;
  mode: 'explain' | 'correct' | 'exercise' | 'study_plan';
  learnerContext: string;
}): Promise<Record<string, any>> {
  const model = getAiSetting('text_model', 'gemini-3.8-flash');
  const systemInstruction = getAiSetting(
    'teacher_system_prompt',
    'You are MindQuest AI Teacher, an expert English coach fluent in English, Uzbek, and Russian.'
  );
  const ai = getClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Set it in Settings > Secrets.');
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `Learner Profile & Real Activity Context: ${params.learnerContext}
Task Mode: ${params.mode}
Learner Input: "${params.question}"

Provide:
- answer_en: Clear, structured English response / explanation / corrected version
- summary_uz: Helpful Uzbek (Latin) explanation of the key rule or takeaway
- pronunciation_guide: IPA or stress tip for key words involved
- practice_exercise: One quick interactive check question with answer`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer_en: { type: Type.STRING },
            summary_uz: { type: Type.STRING },
            pronunciation_guide: { type: Type.STRING },
            practice_question: { type: Type.STRING },
            practice_answer: { type: Type.STRING },
          },
          required: ['answer_en', 'summary_uz', 'pronunciation_guide', 'practice_question', 'practice_answer'],
        },
      },
    });

    const usage = response.usageMetadata;
    recordAiUsage({
      userId: params.userId,
      featureMode: 'ai_teacher',
      modelName: model,
      promptTokens: usage?.promptTokenCount || 240,
      completionTokens: usage?.candidatesTokenCount || 340,
      creditsCharged: 2,
      status: 'success',
    });

    return JSON.parse((response.text ?? '{}').trim());
  } catch (err: any) {
    recordAiUsage({
      userId: params.userId,
      featureMode: 'ai_teacher',
      modelName: model,
      promptTokens: 0,
      completionTokens: 0,
      creditsCharged: 0,
      status: 'error',
      errorMessage: err?.message,
    });
    throw err;
  }
}

export async function synthesizeSpeechWav(params: {
  userId: string;
  text: string;
  voiceName?: string;
}): Promise<{ base64Wav: string }> {
  const model = getAiSetting('tts_model', 'gemini-3.8-flash-lite-tts');
  const ai = getClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const trimmedText = params.text.slice(0, 500);
  const estimatedSeconds = Math.max(3, Math.round(trimmedText.split(/\s+/).length / 2.4));

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: trimmedText,
              speechMetadata: {
                style: 'Clear, natural, warm international English instructor',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: params.voiceName || 'Kore',
            },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error('No audio output returned from TTS model.');
    }

    const usage = response.usageMetadata;
    recordAiUsage({
      userId: params.userId,
      featureMode: 'tts',
      modelName: model,
      promptTokens: usage?.promptTokenCount || 60,
      completionTokens: usage?.candidatesTokenCount || 120,
      audioSeconds: estimatedSeconds,
      creditsCharged: 1,
      status: 'success',
    });

    return { base64Wav: base64Audio };
  } catch (err: any) {
    recordAiUsage({
      userId: params.userId,
      featureMode: 'tts',
      modelName: model,
      promptTokens: 0,
      completionTokens: 0,
      audioSeconds: 0,
      creditsCharged: 0,
      status: 'error',
      errorMessage: err?.message,
    });
    throw err;
  }
}

export async function transcribeAudioBase64(params: {
  userId: string;
  base64Audio: string;
  mimeType: string;
}): Promise<{ transcript: string }> {
  const model = getAiSetting('transcribe_model', 'gemini-3.5-transcribe');
  const ai = getClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: params.mimeType || 'audio/webm',
              data: params.base64Audio,
            },
          },
          { text: 'Transcribe this spoken English audio accurately. Output only the spoken words.' },
        ],
      },
    });

    const usage = response.usageMetadata;
    recordAiUsage({
      userId: params.userId,
      featureMode: 'stt',
      modelName: model,
      promptTokens: usage?.promptTokenCount || 120,
      completionTokens: usage?.candidatesTokenCount || 40,
      audioSeconds: 6,
      creditsCharged: 1,
      status: 'success',
    });

    return { transcript: (response.text ?? '').trim() };
  } catch (err: any) {
    recordAiUsage({
      userId: params.userId,
      featureMode: 'stt',
      modelName: model,
      promptTokens: 0,
      completionTokens: 0,
      creditsCharged: 0,
      status: 'error',
      errorMessage: err?.message,
    });
    throw err;
  }
}
