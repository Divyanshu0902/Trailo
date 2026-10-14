import { GoogleGenAI } from '@google/genai';

/**
 * Trailo Ask Trailo — Gemini Adapter Error
 */
export class GeminiAdapterError extends Error {
  /**
   * @param {string} code - Standard Trailo AI error code
   * @param {string} message - Sanitized user-facing error message
   * @param {unknown} [originalError=null] - Upstream error instance
   * @param {number} [status=500] - Suggested HTTP status
   */
  constructor(code, message, originalError = null, status = 500) {
    super(message);
    this.name = 'GeminiAdapterError';
    this.code = code;
    this.status = status;
    this.originalError = originalError;
  }
}

/**
 * Normalizes upstream SDK and network errors into predictable GeminiAdapterError instances.
 * Never leaks API keys, prompt contents, or source code excerpts into the error message.
 *
 * @param {unknown} error - Upstream error
 * @param {AbortSignal} [signal] - Optional request abort signal
 * @returns {GeminiAdapterError}
 */
export function normalizeGeminiError(error, signal) {
  if (error instanceof GeminiAdapterError) {
    return error;
  }

  if (signal?.aborted) {
    const isTimeout =
      signal.reason?.message === 'AI_TIMEOUT' ||
      signal.reason === 'AI_TIMEOUT' ||
      (error && typeof error === 'object' && 'message' in error && error.message === 'AI_TIMEOUT');
    if (isTimeout) {
      return new GeminiAdapterError('AI_TIMEOUT', 'The AI request timed out.', error, 504);
    }
    return new GeminiAdapterError('REQUEST_ABORTED', 'Request was cancelled by the client.', error, 499);
  }

  if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
    return new GeminiAdapterError('AI_TIMEOUT', 'The AI request timed out.', error, 504);
  }

  const errObj = error && typeof error === 'object' ? error : {};
  const status = 'status' in errObj ? Number(errObj.status) : ('code' in errObj ? Number(errObj.code) : 0);
  const message = ('message' in errObj && typeof errObj.message === 'string' ? errObj.message : '').toLowerCase();

  if (
    status === 429 ||
    message.includes('resource_exhausted') ||
    message.includes('quota') ||
    message.includes('rate limit')
  ) {
    return new GeminiAdapterError(
      'AI_RATE_LIMITED',
      'Gemini API rate limit or quota exceeded. Please try again later.',
      error,
      429
    );
  }

  if (
    status === 401 ||
    status === 403 ||
    (status === 400 && message.includes('api_key_invalid')) ||
    message.includes('api_key_invalid') ||
    message.includes('permission_denied') ||
    message.includes('api key not valid')
  ) {
    return new GeminiAdapterError(
      'AI_AUTH_ERROR',
      'Authentication failed for Gemini API. Please check your GEMINI_API_KEY.',
      error,
      502
    );
  }

  if (status === 404 || message.includes('model_not_found') || message.includes('not found')) {
    return new GeminiAdapterError(
      'AI_MODEL_UNAVAILABLE',
      'The requested Gemini model is currently unavailable.',
      error,
      503
    );
  }

  if ('code' in errObj && errObj.code === 'AI_NOT_CONFIGURED') {
    return new GeminiAdapterError(
      'AI_NOT_CONFIGURED',
      'GEMINI_API_KEY is not configured on the server.',
      error,
      503
    );
  }

  return new GeminiAdapterError(
    'AI_PROVIDER_ERROR',
    'An error occurred while communicating with the AI provider.',
    error,
    502
  );
}

/**
 * Creates an injectable streaming adapter for Google Gemini API using @google/genai.
 *
 * @param {object} [options={}]
 * @param {string} [options.apiKey] - Gemini API key (defaults to process.env.GEMINI_API_KEY)
 * @param {string} [options.model='gemini-3.8-flash'] - Target model identifier
 * @param {string} [options.thinkingLevel='MEDIUM'] - Thinking level
 * @param {object} [options.client] - Injected SDK client instance for testing
 * @returns {{
 *   modelName: string,
 *   isConfigured: () => boolean,
 *   streamAnswer: (params: { promptPayload: object, signal?: AbortSignal }) => AsyncGenerator<{ text: string }>
 * }}
 */
export function createGeminiAdapter(options = {}) {
  const apiKey = options.apiKey !== undefined ? options.apiKey : process.env.GEMINI_API_KEY;
  const model = options.model || 'gemini-3.8-flash';
  const thinkingLevel = options.thinkingLevel || 'MEDIUM';
  let client = options.client || null;

  function isConfigured() {
    return Boolean(client || (apiKey && typeof apiKey === 'string' && apiKey.trim().length > 0));
  }

  function getClient() {
    if (client) return client;
    if (!apiKey) {
      throw new GeminiAdapterError(
        'AI_NOT_CONFIGURED',
        'GEMINI_API_KEY is not configured on the server.',
        null,
        503
      );
    }
    client = new GoogleGenAI({ apiKey });
    return client;
  }

  async function* streamAnswer({ promptPayload, signal }) {
    if (!isConfigured()) {
      throw new GeminiAdapterError(
        'AI_NOT_CONFIGURED',
        'GEMINI_API_KEY is not configured on the server.',
        null,
        503
      );
    }

    if (signal?.aborted) {
      throw normalizeGeminiError(new Error('Operation aborted'), signal);
    }

    const rawContents = Array.isArray(promptPayload?.contents) ? promptPayload.contents : [];
    const formattedContents = rawContents.map((item) => {
      if (item.parts) return item;
      return {
        role: item.role,
        parts: [{ text: item.text }],
      };
    });

    let activeClient;
    try {
      activeClient = getClient();
    } catch (err) {
      throw normalizeGeminiError(err, signal);
    }

    let responseStream;
    try {
      responseStream = await activeClient.models.generateContentStream({
        model,
        contents: formattedContents,
        config: {
          systemInstruction: promptPayload?.systemInstruction,
          thinkingConfig: {
            thinkingLevel,
          },
          abortSignal: signal,
        },
      });
    } catch (err) {
      throw normalizeGeminiError(err, signal);
    }

    try {
      for await (const chunk of responseStream) {
        if (signal?.aborted) {
          throw normalizeGeminiError(new Error('Operation aborted'), signal);
        }
        const text = chunk?.text;
        if (typeof text === 'string' && text.length > 0) {
          yield { text };
        }
      }
    } catch (err) {
      throw normalizeGeminiError(err, signal);
    }
  }

  return {
    modelName: model,
    isConfigured,
    streamAnswer,
  };
}

