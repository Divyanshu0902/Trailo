import express from 'express';
import crypto from 'node:crypto';
import { retrieveEvidence } from './retriever.js';
import { buildPrompt } from './promptBuilder.js';
import { validateCitations } from './citationValidator.js';
import { createGeminiAdapter } from './geminiAdapter.js';

/**
 * Trailo Ask Trailo — SSE Streaming Route
 *
 * Implements POST /api/ask/stream according to docs/ASK_TRAILO_SPEC.md §7.
 */

/**
 * Formats and writes a single Server-Sent Event frame.
 *
 * @param {import('express').Response} res
 * @param {string} event
 * @param {object} data
 */
function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Creates the Express router for Ask Trailo Q&A streaming.
 *
 * @param {object} params
 * @param {import('../indexer/indexStore.js').IndexStore} params.store - Active index store
 * @param {object} [params.geminiAdapter] - Model adapter instance (injectable for testing)
 * @param {number} [params.timeoutMs=60000] - Upstream request timeout in milliseconds
 * @param {Console|object} [params.logger=console] - Logger instance
 * @returns {express.Router}
 */
export function createQuestionRoutes({
  store,
  geminiAdapter,
  timeoutMs = 60000,
  logger = console,
} = {}) {
  const router = express.Router();
  const adapter = geminiAdapter || createGeminiAdapter();

  router.post('/ask/stream', async (req, res) => {
    // 1. Content-Type check
    if (!req.is('application/json')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request content-type must be application/json.',
        },
      });
    }

    const { repositoryId, question, history } = req.body || {};

    // 2. Validate repositoryId presence and format
    if (!repositoryId || typeof repositoryId !== 'string' || !repositoryId.trim()) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Field repositoryId is required.',
        },
      });
    }

    // 3. Snapshot preconditions
    const snapshot = store?.currentSnapshot;
    if (!snapshot) {
      return res.status(404).json({
        error: {
          code: 'REPOSITORY_NOT_FOUND',
          message: 'No active indexed repository found. Please index a repository first.',
        },
      });
    }

    if (snapshot.id !== repositoryId.trim()) {
      return res.status(409).json({
        error: {
          code: 'REPOSITORY_CHANGED',
          message: 'The submitted repository ID does not match the active snapshot ID.',
        },
      });
    }

    // 4. Validate question content and length
    if (typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({
        error: {
          code: 'INVALID_QUESTION',
          message: 'Field question must be a non-empty string.',
        },
      });
    }

    if (question.length > 4000) {
      return res.status(400).json({
        error: {
          code: 'INVALID_QUESTION',
          message: 'Question exceeds maximum allowed length of 4000 characters.',
        },
      });
    }

    // 5. Validate history if present
    if (history !== undefined && !Array.isArray(history)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Field history must be an array when provided.',
        },
      });
    }

    // 6. Check adapter configuration
    const isConfigured = Boolean(
      adapter &&
      (typeof adapter.isConfigured === 'function'
        ? adapter.isConfigured()
        : typeof adapter.streamAnswer === 'function')
    );

    if (!isConfigured) {
      return res.status(503).json({
        error: {
          code: 'AI_NOT_CONFIGURED',
          message: 'GEMINI_API_KEY is not configured on the server.',
        },
      });
    }

    // 7. Retrieve evidence from the active snapshot
    let evidence;
    let diagnostics;
    try {
      const retrievalResult = retrieveEvidence(question, snapshot);
      evidence = retrievalResult.evidence;
      diagnostics = retrievalResult.diagnostics;
    } catch (err) {
      return res.status(500).json({
        error: {
          code: 'RETRIEVAL_ERROR',
          message: 'An error occurred while retrieving evidence from the repository.',
        },
      });
    }

    const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const modelName = adapter.modelName || 'gemini-3.8-flash';

    // 8. Insufficient evidence handling: stream explanation without calling Gemini
    if (!evidence || evidence.length === 0) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders?.();

      sendSSE(res, 'start', {
        requestId,
        repositoryId: snapshot.id,
        model: modelName,
      });

      const helpfulMsg = "I couldn't find relevant code in the currently indexed repository to answer this question. Try mentioning a specific file path, function name, or module identifier.";
      sendSSE(res, 'delta', { text: helpfulMsg });

      sendSSE(res, 'complete', {
        answer: helpfulMsg,
        citations: [],
        metadata: {
          requestId,
          model: modelName,
          evidenceCount: 0,
          validCitationCount: 0,
          insufficientEvidence: true,
        },
      });
      return res.end();
    }

    // 9. Build Prompt & Request-Scoped Evidence Map
    let promptPayload;
    try {
      promptPayload = buildPrompt({ question, evidence, history });
    } catch (err) {
      return res.status(500).json({
        error: {
          code: 'PROMPT_ERROR',
          message: 'Failed to construct prompt payload.',
        },
      });
    }

    const evidenceMap = new Map();
    for (const item of evidence) {
      evidenceMap.set(item.evidenceId, item);
    }

    // 10. AbortController, Timeout, and Disconnect Handling
    const abortController = new AbortController();
    let isTimedOut = false;
    let clientDisconnected = false;

    const timeoutTimer = setTimeout(() => {
      isTimedOut = true;
      abortController.abort(new Error('AI_TIMEOUT'));
    }, timeoutMs);

    res.on('close', () => {
      if (!res.writableEnded) {
        clientDisconnected = true;
        abortController.abort(new Error('CLIENT_ABORT'));
      }
    });

    // 11. Two-phase upstream initialization
    // Phase 1: Initialize stream and await first token/handshake BEFORE committing HTTP headers.
    const stream = adapter.streamAnswer({
      promptPayload,
      signal: abortController.signal,
    });

    let firstText = '';
    let removeAbortListener;

    try {
      const abortPromise = new Promise((_, reject) => {
        if (abortController.signal.aborted) {
          reject(abortController.signal.reason || new Error('AI_TIMEOUT'));
          return;
        }
        const onAbort = () => reject(abortController.signal.reason || new Error('AI_TIMEOUT'));
        abortController.signal.addEventListener('abort', onAbort, { once: true });
        removeAbortListener = () => abortController.signal.removeEventListener('abort', onAbort);
      });

      while (!firstText) {
        const nextPromise = stream.next();
        // Prevent unhandled rejection if race rejects first (e.g. timeout / client abort) and nextPromise rejects later
        nextPromise.catch(() => {});

        const nextResult = await Promise.race([nextPromise, abortPromise]);
        if (nextResult.done) {
          break;
        }

        const text = nextResult.value?.text;
        if (typeof text === 'string' && text.length > 0) {
          firstText = text;
          break;
        }
      }
    } catch (err) {
      removeAbortListener?.();
      clearTimeout(timeoutTimer);
      try {
        await stream.return?.();
      } catch {
        // ignore generator cleanup error
      }

      if (clientDisconnected || res.writableEnded) {
        return;
      }

      let errCode = 'AI_PROVIDER_ERROR';
      let errMessage = 'An error occurred during AI generation.';
      let errStatus = 502;

      if (isTimedOut || err?.code === 'AI_TIMEOUT' || err?.message === 'AI_TIMEOUT') {
        errCode = 'AI_TIMEOUT';
        errMessage = 'The AI request timed out.';
        errStatus = 504;
      } else if (err?.code) {
        errCode = err.code;
        errMessage = err.message;
        errStatus = err.status || (err.code === 'AI_RATE_LIMITED' ? 429 : (err.code === 'AI_MODEL_UNAVAILABLE' ? 503 : 502));
      }

      logger?.warn?.(`[AskTrailo] Pre-stream generation error: ${errCode}`);

      return res.status(errStatus).json({
        error: {
          code: errCode,
          message: errMessage,
        },
      });
    } finally {
      removeAbortListener?.();
    }

    if (clientDisconnected || res.writableEnded) {
      clearTimeout(timeoutTimer);
      try {
        await stream.return?.();
      } catch {
        // ignore
      }
      return;
    }

    // Handle empty stream: if generator completed without producing any non-empty text chunks
    if (!firstText) {
      clearTimeout(timeoutTimer);
      try {
        await stream.return?.();
      } catch {
        // ignore
      }
      logger?.warn?.('[AskTrailo] Pre-stream generation error: AI_PROVIDER_ERROR (empty stream)');
      return res.status(502).json({
        error: {
          code: 'AI_PROVIDER_ERROR',
          message: 'The AI provider returned an empty response.',
        },
      });
    }

    // Phase 2: Upstream connection succeeded and first non-empty text chunk is available; commit SSE headers and stream chunks
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    sendSSE(res, 'start', {
      requestId,
      repositoryId: snapshot.id,
      model: modelName,
    });

    let accumulatedAnswer = firstText;
    sendSSE(res, 'delta', { text: firstText });

    try {
      for await (const chunk of stream) {
        if (clientDisconnected || res.writableEnded) {
          break;
        }
        if (typeof chunk?.text === 'string' && chunk.text.length > 0) {
          accumulatedAnswer += chunk.text;
          sendSSE(res, 'delta', { text: chunk.text });
        }
      }

      if (clientDisconnected || res.writableEnded) {
        return;
      }

      // 12. Snapshot consistency re-verification before completing
      if (!store.currentSnapshot || store.currentSnapshot.id !== snapshot.id) {
        sendSSE(res, 'error', {
          error: {
            code: 'REPOSITORY_CHANGED',
            message: 'The active repository snapshot changed while generating the answer.',
          },
        });
        return res.end();
      }

      // 13. Validate citations against captured snapshot and request evidence
      const validation = validateCitations(accumulatedAnswer, evidenceMap, snapshot);

      sendSSE(res, 'complete', {
        answer: validation.sanitizedAnswer,
        citations: validation.validCitations,
        metadata: {
          requestId,
          model: modelName,
          evidenceCount: evidence.length,
          validCitationCount: validation.validCitations.length,
          invalidMarkerCount: validation.invalidEvidenceIds.length,
        },
      });
      res.end();
    } catch (err) {
      if (clientDisconnected || res.writableEnded) {
        return;
      }

      let errCode = 'AI_PROVIDER_ERROR';
      let errMessage = 'An error occurred during AI generation.';

      if (isTimedOut || err?.code === 'AI_TIMEOUT' || err?.message === 'AI_TIMEOUT') {
        errCode = 'AI_TIMEOUT';
        errMessage = 'The AI request timed out.';
      } else if (err?.code) {
        errCode = err.code;
        errMessage = err.message;
      }

      logger?.warn?.(`[AskTrailo] Mid-stream generation error: ${errCode}`);

      sendSSE(res, 'error', {
        error: {
          code: errCode,
          message: errMessage,
        },
      });
      res.end();
    } finally {
      clearTimeout(timeoutTimer);
    }
  });

  return router;
}

