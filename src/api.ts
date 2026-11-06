const TOKEN_STORAGE_KEY = 'mq_auth_token';
const CSRF_STORAGE_KEY = 'mq_csrf_token';

export function setAuthTokens(token: string | null, csrfToken?: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
  if (csrfToken) {
    localStorage.setItem(CSRF_STORAGE_KEY, csrfToken);
  } else if (token === null) {
    localStorage.removeItem(CSRF_STORAGE_KEY);
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const csrf = localStorage.getItem(CSRF_STORAGE_KEY);

  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (csrf) {
    headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/csv')) {
    return (await res.text()) as unknown as T;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data as T;
}

export async function speakEnglishText(text: string): Promise<'neural_wav' | 'browser_tts'> {
  try {
    const res = await apiFetch<{ base64Wav: string }>('/api/learning/voice/tts', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    if (res.base64Wav) {
      const audio = new Audio(`data:audio/wav;base64,${res.base64Wav}`);
      await audio.play();
      return 'neural_wav';
    }
  } catch {
    // Fallback to browser Web Speech synthesis when on Free tier or offline
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.96;
    window.speechSynthesis.speak(utterance);
  }
  return 'browser_tts';
}
