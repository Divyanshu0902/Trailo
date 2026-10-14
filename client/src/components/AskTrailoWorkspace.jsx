import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AskTrailoIcon, CloseIcon } from './Icons.jsx';

/**
 * Reads an SSE stream from a fetch Response body and emits parsed events to a callback.
 * Correctly handles CRLF and LF delimiters, split frames, multiple events per network chunk,
 * and trailing buffered data.
 *
 * @param {ReadableStream<Uint8Array>} body
 * @param {(event: string, data: any) => void} onEvent
 * @param {AbortSignal} [signal]
 */
async function readSSEStream(body, onEvent, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => {});
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary;
      while ((boundary = buffer.match(/\r?\n\r?\n/))) {
        const rawEvent = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);

        if (!rawEvent.trim()) continue;

        const lines = rawEvent.split(/\r?\n/);
        let eventName = 'message';
        let dataStr = '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataStr += line.slice(5).trim();
          }
        }

        if (dataStr) {
          try {
            const data = JSON.parse(dataStr);
            onEvent(eventName, data);
          } catch {
            // Non-JSON SSE data ignored
          }
        }
      }
    }

    // Flush remaining buffer at end of stream if any
    if (buffer.trim()) {
      const lines = buffer.split(/\r?\n/);
      let eventName = 'message';
      let dataStr = '';
      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataStr += line.slice(5).trim();
        }
      }
      if (dataStr) {
        try {
          const data = JSON.parse(dataStr);
          onEvent(eventName, data);
        } catch {
          // ignore
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}

/**
 * Pure React inline parser that renders safe formatted text with clickable citations.
 * Uses safe text nodes and protects against XSS.
 *
 * @param {string} text
 * @param {Map<string, object>} citationMap
 * @param {(citation: object) => void} onCitationClick
 * @param {boolean} isStreaming
 * @returns {React.ReactNode[]}
 */
function renderInlineContent(text, citationMap, onCitationClick, isStreaming) {
  if (!text) return [];

  // Match citation markers [E1], inline code `code`, and bold **text**
  const regex = /(\[E\d+\]|`[^`]+`|\*\*[^*]+\*\*)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;

    // Check citation marker [E1]
    const citationMatch = part.match(/^\[(E\d+)\]$/);
    if (citationMatch) {
      const evidenceId = citationMatch[1];
      const citation = citationMap?.get(evidenceId);

      // Only make clickable if citation is validated after complete
      if (citation && !isStreaming) {
        const fileName = citation.filePath.split('/').pop() || citation.filePath;
        return (
          <button
            key={`cit-${index}`}
            type="button"
            className="ask-citation-badge"
            onClick={() => onCitationClick && onCitationClick(citation)}
            title={`Inspect ${citation.filePath} (lines ${citation.startLine}–${citation.endLine})`}
            aria-label={`Citation ${evidenceId}: ${citation.filePath} lines ${citation.startLine} to ${citation.endLine}`}
          >
            <span className="cit-id">[{evidenceId}]</span>
            <span className="cit-loc">{fileName}:{citation.startLine}</span>
          </button>
        );
      }

      // If streaming or unverified, render as inactive marker
      return (
        <span key={`cit-raw-${index}`} className="ask-citation-raw">
          [{evidenceId}]
        </span>
      );
    }

    // Inline code `...`
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={`code-${index}`} className="ask-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold **...**
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={`bold-${index}`}>
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Regular plain text
    return <React.Fragment key={`txt-${index}`}>{part}</React.Fragment>;
  });
}

/**
 * Safely renders markdown-style text, code blocks, lists, and citations without HTML injection.
 *
 * @param {string} markdown
 * @param {Array<object>} citations
 * @param {(citation: object) => void} onCitationClick
 * @param {boolean} isStreaming
 * @returns {React.ReactNode}
 */
function SafeMarkdownRenderer({ markdown, citations = [], onCitationClick, isStreaming = false }) {
  const citationMap = useMemo(() => {
    const map = new Map();
    if (Array.isArray(citations)) {
      for (const c of citations) {
        if (c?.evidenceId) map.set(c.evidenceId, c);
      }
    }
    return map;
  }, [citations]);

  if (!markdown) return null;

  // Split text by markdown fenced code blocks ```lang ... ```
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  const elements = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    const textBefore = markdown.slice(lastIndex, match.index);
    if (textBefore) {
      elements.push({ type: 'text', content: textBefore });
    }

    elements.push({
      type: 'code',
      lang: match[1] || '',
      content: match[2] || '',
    });

    lastIndex = match.index + match[0].length;
  }

  const trailingText = markdown.slice(lastIndex);
  if (trailingText) {
    elements.push({ type: 'text', content: trailingText });
  }

  return (
    <div className="ask-markdown-content">
      {elements.map((block, bIdx) => {
        if (block.type === 'code') {
          return (
            <div key={`block-${bIdx}`} className="ask-code-container">
              {block.lang && <div className="ask-code-lang">{block.lang}</div>}
              <pre className="ask-code-block">
                <code>{block.content}</code>
              </pre>
            </div>
          );
        }

        // Process text block lines (paragraphs, bullet lists, numbered lists)
        const lines = block.content.split('\n');
        const paragraphs = [];
        let currentList = null;

        lines.forEach((line, lineIdx) => {
          const trimmed = line.trim();

          // Bullet list item
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const itemText = trimmed.slice(2);
            if (!currentList || currentList.type !== 'ul') {
              currentList = { type: 'ul', items: [] };
              paragraphs.push(currentList);
            }
            currentList.items.push(itemText);
            return;
          }

          // Numbered list item
          const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
          if (numMatch) {
            const itemText = numMatch[2];
            if (!currentList || currentList.type !== 'ol') {
              currentList = { type: 'ol', items: [] };
              paragraphs.push(currentList);
            }
            currentList.items.push(itemText);
            return;
          }

          // Not a list item
          currentList = null;

          if (!trimmed) {
            // Blank line separator
            return;
          }

          // Header
          if (trimmed.startsWith('### ')) {
            paragraphs.push({ type: 'h3', text: trimmed.slice(4) });
            return;
          }
          if (trimmed.startsWith('## ')) {
            paragraphs.push({ type: 'h2', text: trimmed.slice(3) });
            return;
          }

          // Regular paragraph line
          paragraphs.push({ type: 'p', text: line });
        });

        return (
          <React.Fragment key={`block-${bIdx}`}>
            {paragraphs.map((p, pIdx) => {
              if (p.type === 'ul') {
                return (
                  <ul key={`ul-${pIdx}`} className="ask-list-ul">
                    {p.items.map((it, itIdx) => (
                      <li key={`li-${itIdx}`}>
                        {renderInlineContent(it, citationMap, onCitationClick, isStreaming)}
                      </li>
                    ))}
                  </ul>
                );
              }
              if (p.type === 'ol') {
                return (
                  <ol key={`ol-${pIdx}`} className="ask-list-ol">
                    {p.items.map((it, itIdx) => (
                      <li key={`oli-${itIdx}`}>
                        {renderInlineContent(it, citationMap, onCitationClick, isStreaming)}
                      </li>
                    ))}
                  </ol>
                );
              }
              if (p.type === 'h2') {
                return (
                  <h4 key={`h2-${pIdx}`} className="ask-content-h2">
                    {renderInlineContent(p.text, citationMap, onCitationClick, isStreaming)}
                  </h4>
                );
              }
              if (p.type === 'h3') {
                return (
                  <h5 key={`h3-${pIdx}`} className="ask-content-h3">
                    {renderInlineContent(p.text, citationMap, onCitationClick, isStreaming)}
                  </h5>
                );
              }
              return (
                <p key={`p-${pIdx}`} className="ask-content-p">
                  {renderInlineContent(p.text, citationMap, onCitationClick, isStreaming)}
                </p>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * Ask Trailo Workspace Component.
 * Implements conversational codebase Q&A grounded in repository evidence with streaming answers,
 * session-only React memory state, and verified clickable citations.
 */
export function AskTrailoWorkspace({
  repositoryId,
  repositoryPath,
  repositoryName = '',
  onCitationClick,
  activeHighlight,
}) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(true);

  const abortRef = useRef(null);
  const timelineRef = useRef(null);
  const textareaRef = useRef(null);
  const activeRepoIdRef = useRef(repositoryId);

  // Auto-scroll timeline to bottom on new messages or deltas
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [messages]);

  // Session-only: when repository snapshot ID changes, abort and reset in-memory conversation
  useEffect(() => {
    if (activeRepoIdRef.current && activeRepoIdRef.current !== repositoryId) {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      setMessages([]);
      setInputText('');
      setIsGenerating(false);
    }
    activeRepoIdRef.current = repositoryId;
  }, [repositoryId]);

  // Component unmount cleanup
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  /**
   * Dispatches a question to POST /api/ask/stream and streams deltas into React memory.
   */
  const handleSendQuestion = useCallback(
    async (textToSend) => {
      const trimmed = (textToSend || inputText).trim();
      if (!trimmed || isGenerating) return;

      if (!repositoryId) {
        return;
      }

      // Reset composer
      setInputText('');

      const userMsgId = `user_${Date.now()}`;
      const assistantMsgId = `asst_${Date.now()}`;

      // Bounded prior conversation history (maximum 6 completed turns)
      const priorHistory = messages
        .filter((m) => (m.status === 'completed' || m.role === 'user') && typeof m.content === 'string' && m.content.trim())
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      // Add user turn and pending assistant turn
      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          role: 'user',
          content: trimmed,
          timestamp: new Date(),
        },
        {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          citations: [],
          metadata: null,
          status: 'streaming',
          originalQuestion: trimmed,
          timestamp: new Date(),
        },
      ]);

      setIsGenerating(true);

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const response = await fetch('/api/ask/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            repositoryId,
            question: trimmed,
            history: priorHistory,
          }),
          signal: abortController.signal,
        });

        // 1. Pre-stream HTTP errors before SSE handshake
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => null);
          const errObj = errorPayload?.error || {
            code: `HTTP_${response.status}`,
            message: `Server returned HTTP ${response.status}`,
          };

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    status: 'error',
                    error: errObj,
                  }
                : msg
            )
          );
          return;
        }

        // 2. Consume SSE stream using TextDecoder and event dispatcher
        await readSSEStream(
          response.body,
          (eventName, eventData) => {
            if (eventName === 'delta') {
              if (eventData?.text) {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          content: msg.content + eventData.text,
                        }
                      : msg
                  )
                );
              }
            } else if (eventName === 'complete') {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? {
                        ...msg,
                        content: eventData.answer || msg.content,
                        citations: eventData.citations || [],
                        metadata: eventData.metadata || null,
                        status: 'completed',
                      }
                    : msg
                )
              );
            } else if (eventName === 'error') {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? {
                        ...msg,
                        status: 'error',
                        error: eventData.error || {
                          code: 'AI_PROVIDER_ERROR',
                          message: 'An error occurred during AI generation.',
                        },
                      }
                    : msg
                )
              );
            }
          },
          abortController.signal
        );
      } catch (err) {
        if (err.name === 'AbortError' || abortController.signal.aborted) {
          // User cancelled generation
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    status: 'stopped',
                  }
                : msg
            )
          );
        } else {
          // Network or unexpected failure
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    status: 'error',
                    error: {
                      code: 'NETWORK_ERROR',
                      message: err.message || 'Failed to communicate with Ask Trailo server.',
                    },
                  }
                : msg
            )
          );
        }
      } finally {
        setIsGenerating(false);
        abortRef.current = null;
      }
    },
    [inputText, isGenerating, repositoryId, messages]
  );

  /**
   * User action to stop generation in-flight.
   */
  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsGenerating(false);
  }, []);

  /**
   * Resets and clears the session-only conversation timeline.
   */
  const handleNewConversation = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setMessages([]);
    setInputText('');
    setIsGenerating(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  /**
   * Handles keyboard Enter (submit) and Shift+Enter (newline).
   */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion();
    }
  };

  const samplePrompts = [
    'Where is the repository scanner implemented and how does it walk directories?',
    'How are module imports and dependencies extracted into graph nodes and edges?',
    'What is the structure of IndexStore and how are chunks created?',
  ];

  return (
    <div className="ask-workspace" role="region" aria-label="Ask Trailo Workspace">
      {/* Workspace Header Bar */}
      <div className="ask-workspace-header">
        <div className="ask-header-left">
          <div className="ask-header-badge">
            <AskTrailoIcon size={18} />
          </div>
          <span className="ask-header-title">Ask Trailo</span>
          {repositoryName && (
            <span className="ask-repo-badge" title={repositoryPath || repositoryName}>
              {repositoryName}
            </span>
          )}
          <span className="ask-model-badge">gemini-3.8-flash</span>
        </div>

        <div className="ask-header-actions">
          <button
            type="button"
            className="btn-new-conversation"
            onClick={handleNewConversation}
            title="Clear in-memory conversation"
            aria-label="New Conversation"
          >
            <span className="new-conv-icon" aria-hidden="true">+</span>
            <span>New Chat</span>
          </button>
        </div>
      </div>

      {/* Hosted AI Source Privacy Disclosure Banner */}
      {showPrivacyNotice && (
        <div className="ask-privacy-banner" role="note" aria-label="Hosted AI Privacy Disclosure">
          <div className="privacy-banner-content">
            <span className="privacy-shield-icon" aria-hidden="true">🔒</span>
            <span className="privacy-banner-text">
              <strong>Hosted AI Disclosure:</strong> Questions and relevant indexed source code excerpts are sent to Google’s hosted Gemini API for answer generation. Full repository code, environment secrets, and credentials are never transmitted.
            </span>
          </div>
          <button
            type="button"
            className="btn-privacy-dismiss"
            onClick={() => setShowPrivacyNotice(false)}
            title="Dismiss notice"
            aria-label="Dismiss privacy disclosure"
          >
            <CloseIcon size={12} />
          </button>
        </div>
      )}

      {/* Conversation Timeline */}
      <div ref={timelineRef} className="ask-timeline" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="ask-empty-state">
            <div className="ask-empty-icon-badge">
              <AskTrailoIcon size={36} />
            </div>
            <h3 className="ask-empty-title">Code-Grounded Q&amp;A</h3>
            <p className="ask-empty-desc">
              Ask questions about <strong>{repositoryName || 'your codebase'}</strong>. Answers are derived strictly from your indexed files and grounded with verifiable source code citations.
            </p>

            <div className="ask-sample-prompts">
              <span className="sample-prompts-label">Try asking:</span>
              <div className="sample-prompts-list">
                {samplePrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="sample-prompt-pill"
                    onClick={() => handleSendQuestion(prompt)}
                  >
                    <span>{prompt}</span>
                    <span className="sample-prompt-arrow" aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={msg.id || index}
              className={`ask-message-row ${msg.role === 'user' ? 'is-user' : 'is-assistant'}`}
            >
              {/* Message Header */}
              <div className="ask-message-header">
                <div className="ask-message-author-group">
                  <div className={`ask-avatar ${msg.role === 'user' ? 'avatar-user' : 'avatar-assistant'}`}>
                    {msg.role === 'user' ? 'You' : <AskTrailoIcon size={14} />}
                  </div>
                  <span className="ask-author-name">
                    {msg.role === 'user' ? 'You' : 'Trailo'}
                  </span>
                </div>
                <span className="ask-message-time">
                  {msg.timestamp?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || ''}
                </span>
              </div>

              {/* Message Body */}
              <div className="ask-message-body">
                {msg.role === 'user' ? (
                  <div className="ask-user-content">{msg.content}</div>
                ) : (
                  <>
                    {/* Rendered Answer Text */}
                    {msg.content ? (
                      <SafeMarkdownRenderer
                        markdown={msg.content}
                        citations={msg.citations}
                        onCitationClick={onCitationClick}
                        isStreaming={msg.status === 'streaming'}
                      />
                    ) : msg.status === 'streaming' ? (
                      <div className="ask-streaming-placeholder">
                        <span className="streaming-pulse-dot" />
                        <span>Searching codebase evidence &amp; generating answer...</span>
                      </div>
                    ) : null}

                    {/* Streaming Cursor */}
                    {msg.status === 'streaming' && msg.content && (
                      <span className="ask-typing-cursor" aria-hidden="true">▍</span>
                    )}

                    {/* Insufficient Evidence Notice */}
                    {msg.metadata?.insufficientEvidence && (
                      <div className="ask-insufficient-banner">
                        <span className="notice-icon" aria-hidden="true">💡</span>
                        <span>
                          No direct code chunks matched this query in the current index. Try referencing specific file names, exported functions, or classes.
                        </span>
                      </div>
                    )}

                    {/* Sources Cited Drawer */}
                    {msg.status === 'completed' && Array.isArray(msg.citations) && msg.citations.length > 0 && (
                      <div className="ask-sources-box" role="region" aria-label="Validated Citations">
                        <div className="ask-sources-header">
                          <span className="sources-icon" aria-hidden="true">📑</span>
                          <span className="sources-title">
                            Sources Cited ({msg.citations.length})
                          </span>
                        </div>
                        <div className="ask-sources-grid">
                          {msg.citations.map((cit) => {
                            const isHighlightActive =
                              activeHighlight &&
                              activeHighlight.evidenceId === cit.evidenceId;
                            const fileName = cit.filePath.split('/').pop() || cit.filePath;

                            return (
                              <button
                                key={cit.evidenceId}
                                type="button"
                                className={`ask-source-card ${isHighlightActive ? 'is-active' : ''}`}
                                onClick={() => onCitationClick && onCitationClick(cit)}
                                title={`Open ${cit.filePath}:${cit.startLine}–${cit.endLine}`}
                                aria-label={`View ${fileName} lines ${cit.startLine} to ${cit.endLine}`}
                              >
                                <span className="source-card-id">[{cit.evidenceId}]</span>
                                <div className="source-card-text">
                                  <span className="source-card-filename">{fileName}</span>
                                  <span className="source-card-range">
                                    L{cit.startLine}–L{cit.endLine}
                                  </span>
                                </div>
                                <span className="source-card-open" aria-hidden="true">↗</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Error State Display */}
                    {msg.status === 'error' && (
                      <div className="ask-error-card" role="alert">
                        <div className="ask-error-header">
                          <span className="error-icon" aria-hidden="true">⚠️</span>
                          <span className="error-code">{msg.error?.code || 'ERROR'}</span>
                        </div>
                        <p className="error-text">
                          {msg.error?.message || 'An unexpected error occurred during generation.'}
                        </p>

                        {msg.error?.code === 'AI_NOT_CONFIGURED' ? (
                          <div className="ask-config-instruction">
                            <code>GEMINI_API_KEY</code> is not configured. Add it to your server <code>.env</code> file:
                            <pre><code>GEMINI_API_KEY=your_gemini_api_key</code></pre>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn-retry-action"
                            onClick={() => handleSendQuestion(msg.originalQuestion)}
                          >
                            <span>↻</span> Retry Question
                          </button>
                        )}
                      </div>
                    )}

                    {/* Stopped State Display */}
                    {msg.status === 'stopped' && (
                      <div className="ask-stopped-card">
                        <span className="stopped-icon" aria-hidden="true">⏹</span>
                        <span>Generation was stopped.</span>
                        {msg.originalQuestion && (
                          <button
                            type="button"
                            className="btn-retry-inline"
                            onClick={() => handleSendQuestion(msg.originalQuestion)}
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Question Composer Form */}
      <div className="ask-composer-area">
        <form
          className="ask-composer-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSendQuestion();
          }}
        >
          <div className="ask-input-wrapper">
            <textarea
              ref={textareaRef}
              className="ask-textarea"
              placeholder={
                isGenerating
                  ? 'Generating response...'
                  : 'Ask a question about this repository (e.g., Where is scanRepository defined?)...'
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value.slice(0, 4000))}
              onKeyDown={handleKeyDown}
              disabled={isGenerating}
              rows={Math.min(5, Math.max(1, inputText.split('\n').length))}
              aria-label="Ask a question about the repository"
            />
          </div>

          <div className="ask-composer-toolbar">
            <div className="composer-hints">
              <span className="char-count">{inputText.length} / 4000</span>
              <span className="shortcut-hint">Enter to send • Shift+Enter for newline</span>
            </div>

            <div className="composer-button-group">
              {isGenerating ? (
                <button
                  type="button"
                  className="btn-stop-generating"
                  onClick={handleStop}
                  title="Stop generating answer"
                  aria-label="Stop generation"
                >
                  <span className="stop-square" aria-hidden="true">■</span>
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="submit"
                  className="btn-send-question"
                  disabled={!inputText.trim()}
                  title="Send question to Ask Trailo"
                  aria-label="Send question"
                >
                  <span>Ask</span>
                  <span className="send-arrow" aria-hidden="true">→</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
