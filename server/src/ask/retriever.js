/**
 * Trailo Ask Trailo — Retrieval Module (Version 1)
 *
 * Deterministic lexical, identifier, path, and dependency-graph retrieval engine.
 * Ranks in-memory source chunks without external search infrastructure or vector DBs.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'were', 'will', 'with', 'do', 'does', 'did', 'how',
  'what', 'where', 'which', 'who', 'why', 'can', 'could', 'should',
  'would', 'this', 'there', 'their', 'they', 'i', 'we', 'you',
]);

const LOW_DISCRIMINATION_WORDS = new Set([
  'file', 'files', 'code', 'function', 'method', 'class', 'module',
  'script', 'line', 'lines', 'repo', 'repository', 'project',
]);

export const DEFAULT_RETRIEVAL_OPTIONS = {
  maxChunks: 8,
  hardMaxChunks: 10,
  maxLines: 500,
  maxBytes: 32000,
  maxChunksPerFile: 3,
  minRelevanceThreshold: 12,
};

/**
 * Tokenizes a query string into normalized search tokens, exact identifiers,
 * camelCase fragments, snake_case fragments, and path segments.
 *
 * @param {string} query
 * @returns {{
 *   rawQuery: string,
 *   tokens: string[],
 *   exactIdentifiers: string[],
 *   pathTokens: string[]
 * }}
 */
export function tokenizeQuery(query) {
  if (!query || typeof query !== 'string') {
    return { rawQuery: '', tokens: [], exactIdentifiers: [], pathTokens: [] };
  }

  const rawQuery = query.trim();
  const normalizedQuery = rawQuery.replace(/\\/g, '/');
  const tokenSet = new Set();
  const exactIdentifiers = new Set();
  const pathTokens = new Set();

  // Match path-like strings with slashes (e.g. "src/scanner/scanner.js" or "src\scanner\scanner.js")
  const pathMatches = normalizedQuery.match(/[a-zA-Z0-9_.\-]+(?:\/[a-zA-Z0-9_.\-]+)+/g) || [];
  for (const p of pathMatches) {
    const cleanPath = p.replace(/^[./]+/, '');
    pathTokens.add(cleanPath.toLowerCase());
    for (const seg of cleanPath.split('/')) {
      if (seg && !STOP_WORDS.has(seg.toLowerCase())) {
        tokenSet.add(seg.toLowerCase());
      }
    }
  }

  // Match file names with extensions (e.g. "scanner.js", "App.jsx")
  const fileExtMatches = normalizedQuery.match(/[a-zA-Z0-9_\-]+\.[a-zA-Z0-9]+/g) || [];
  for (const f of fileExtMatches) {
    pathTokens.add(f.toLowerCase());
    tokenSet.add(f.toLowerCase());
  }

  // Match identifiers and words
  const words = rawQuery.match(/[a-zA-Z0-9_]+/g) || [];

  for (const word of words) {
    const lower = word.toLowerCase();

    // Preserve original identifier if longer than 2 characters
    if (word.length >= 2 && !STOP_WORDS.has(lower)) {
      tokenSet.add(lower);
      if (/[A-Z]/.test(word) || word.includes('_')) {
        exactIdentifiers.add(word);
      }
    }

    // Split camelCase (e.g. "validateRelativeFilePath" -> "validate", "relative", "file", "path")
    const camelParts = word.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' ');
    if (camelParts.length > 1) {
      for (const part of camelParts) {
        const pLower = part.toLowerCase();
        if (pLower.length >= 2 && !STOP_WORDS.has(pLower)) {
          tokenSet.add(pLower);
        }
      }
    }

    // Split snake_case (e.g. "is_subpath_or_equal" -> "is", "subpath", "or", "equal")
    const snakeParts = word.split('_');
    if (snakeParts.length > 1) {
      for (const part of snakeParts) {
        const pLower = part.toLowerCase();
        if (pLower.length >= 2 && !STOP_WORDS.has(pLower)) {
          tokenSet.add(pLower);
        }
      }
    }
  }

  return {
    rawQuery,
    tokens: Array.from(tokenSet),
    exactIdentifiers: Array.from(exactIdentifiers),
    pathTokens: Array.from(pathTokens),
  };
}

/**
 * Detects whether the query expresses an inbound, outbound, or general relational intent.
 *
 * @param {string} query
 * @returns {'inbound' | 'outbound' | 'relational' | 'general'}
 */
export function detectDependencyIntent(query) {
  if (!query || typeof query !== 'string') return 'general';
  const q = query.toLowerCase();

  // Inbound questions: who uses / calls / imports X?
  if (
    /who\s+(uses|calls|imports|references|invokes)/.test(q) ||
    /where\s+is\s+.*(used|called|imported|invoked|referenced)/.test(q) ||
    /dependents?\s+of/.test(q) ||
    /callers?\s+of/.test(q) ||
    /what\s+(calls|uses|imports)\s+/.test(q)
  ) {
    return 'inbound';
  }

  // Outbound questions: what does X import / call / depend on?
  if (
    /what\s+does\s+.*(import|use|call|depend\s+on|require)/.test(q) ||
    /dependencies\s+of/.test(q) ||
    /imports\s+of/.test(q) ||
    /outbound\s+dependencies/.test(q)
  ) {
    return 'outbound';
  }

  // Cross-file relational / flow questions: how does X connect to Y?
  if (
    /how\s+does\s+.*(connect|flow|interact|communicate|link)\s+(with|to)/.test(q) ||
    /flow\s+between/.test(q) ||
    /relationship\s+between/.test(q)
  ) {
    return 'relational';
  }

  return 'general';
}

/**
 * Scores a single chunk against query tokens and path criteria.
 *
 * @param {object} chunk - Chunker chunk record
 * @param {object} queryTokens - Output from tokenizeQuery
 * @param {object} [fileRecord] - Optional file metadata from snapshot
 * @returns {{ score: number, reasons: string[] }}
 */
export function scoreChunk(chunk, queryTokens, fileRecord) {
  let score = 0;
  const reasons = [];
  const text = chunk.text || '';
  const textLower = text.toLowerCase();
  const filePath = (chunk.filePath || '').toLowerCase();
  const fileName = filePath.split('/').pop() || filePath;

  // 1. Exact path matches
  for (const pt of queryTokens.pathTokens) {
    if (filePath === pt || filePath.endsWith(`/${pt}`)) {
      score += 80;
      reasons.push(`exact-path-match:${pt}`);
    } else if (fileName === pt) {
      score += 45;
      reasons.push(`filename-match:${pt}`);
    } else if (filePath.includes(pt)) {
      score += 25;
      reasons.push(`path-substr-match:${pt}`);
    }
  }

  // 2. Exact identifier matches (case-sensitive and word-boundary aware)
  const matchedExactTokens = new Set();
  for (const id of queryTokens.exactIdentifiers) {
    const wordRegex = new RegExp(`\\b${escapeRegExp(id)}\\b`, 'g');
    const matches = text.match(wordRegex);
    if (matches && matches.length > 0) {
      // Base score per unique identifier + modest bonus for occurrences
      const idScore = 30 + Math.min(matches.length * 3, 15);
      score += idScore;
      reasons.push(`exact-identifier:${id}(x${matches.length})`);
      matchedExactTokens.add(id.toLowerCase());

      // Declaration line bonus: if identifier appears with export, function, class, or const
      const declRegex = new RegExp(`(export\\s+)?(function|class|const|let|var|type|interface)\\s+${escapeRegExp(id)}\\b`);
      if (declRegex.test(text)) {
        score += 25;
        reasons.push(`identifier-declaration:${id}`);
      }
    }
  }

  // 3. General query token matches in text
  for (const token of queryTokens.tokens) {
    // Only skip if this exact identifier was already matched with exact casing
    if (matchedExactTokens.has(token)) continue;

    const isLowDiscrimination = LOW_DISCRIMINATION_WORDS.has(token);
    const wordRegex = new RegExp(`\\b${escapeRegExp(token)}\\b`, 'gi');
    const matches = textLower.match(wordRegex);

    if (matches && matches.length > 0) {
      const weight = isLowDiscrimination ? 1 : 5;
      const tokenScore = weight + Math.min(matches.length * 1.5, 6);
      score += tokenScore;
      reasons.push(`token-match:${token}(x${matches.length})`);
    }

    // Path segment match bonus
    if (filePath.includes(token) && !isLowDiscrimination) {
      score += 8;
      reasons.push(`path-token:${token}`);
    }
  }

  // 4. Entry point / index file slight boost when query is broad
  if (fileName === 'index.js' || fileName === 'index.ts' || fileName === 'app.js' || fileName === 'main.js') {
    if (score > 10) {
      score += 5;
      reasons.push('entry-point-file');
    }
  }

  return { score, reasons };
}

/**
 * Expands candidates using inbound and outbound dependency indexes from snapshot.
 *
 * @param {Array<object>} topCandidates - Initial scored candidates
 * @param {object} snapshot - Active index snapshot
 * @param {string} intent - Dependency intent
 * @param {number} budget - Remaining chunk budget
 * @returns {Array<object>} Expanded candidate chunks with reasons
 */
export function expandDependencyGraph(topCandidates, snapshot, intent, budget = 4) {
  if (!snapshot || !Array.isArray(topCandidates) || topCandidates.length === 0 || budget <= 0) {
    return [];
  }

  const expanded = [];
  const seenChunkIds = new Set(topCandidates.map((c) => c.chunk.chunkId));
  const primaryFiles = new Set(topCandidates.slice(0, 3).map((c) => c.chunk.filePath));

  for (const filePath of primaryFiles) {
    if (expanded.length >= budget) break;

    // 1. Inbound dependencies: files that import this candidate
    if (intent === 'inbound' || intent === 'relational' || intent === 'general') {
      const inboundList = snapshot.inboundDeps?.get(filePath) || [];
      for (const dep of inboundList) {
        if (expanded.length >= budget) break;
        if (!dep.sourcePath) continue;

        // Find the chunk in the importing file covering the import statement
        const sourceChunks = snapshot.chunksByFile?.get(dep.sourcePath) || [];
        const declLine = dep.sourceLocation?.startLine;

        let matchedChunk = null;
        if (typeof declLine === 'number' && declLine > 0) {
          matchedChunk = sourceChunks.find((c) => c.startLine <= declLine && c.endLine >= declLine);
        }
        if (!matchedChunk && sourceChunks.length > 0) {
          matchedChunk = sourceChunks[0]; // first chunk usually has imports
        }

        if (matchedChunk && !seenChunkIds.has(matchedChunk.chunkId)) {
          seenChunkIds.add(matchedChunk.chunkId);
          expanded.push({
            chunk: matchedChunk,
            score: 22,
            reasons: [`inbound-dependency-from:${dep.sourcePath}`],
            isGraphExpansion: true,
          });
        }
      }
    }

    // 2. Outbound dependencies: files imported by this candidate
    if (intent === 'outbound' || intent === 'relational' || intent === 'general') {
      const outboundList = snapshot.outboundDeps?.get(filePath) || [];
      for (const dep of outboundList) {
        if (expanded.length >= budget) break;
        if (!dep.targetPath) continue;

        const targetChunks = snapshot.chunksByFile?.get(dep.targetPath) || [];
        if (targetChunks.length > 0 && !seenChunkIds.has(targetChunks[0].chunkId)) {
          seenChunkIds.add(targetChunks[0].chunkId);
          expanded.push({
            chunk: targetChunks[0],
            score: 20,
            reasons: [`outbound-dependency-to:${dep.targetPath}`],
            isGraphExpansion: true,
          });
        }
      }
    }
  }

  return expanded;
}

/**
 * Pure deterministic retrieval function for Ask Trailo.
 *
 * @param {string} question - User question
 * @param {object} snapshot - Active in-memory repository index snapshot
 * @param {object} [options={}] - Optional retrieval limits and overrides
 * @returns {{
 *   evidence: Array<{
 *     evidenceId: string,
 *     chunkId: string,
 *     filePath: string,
 *     startLine: number,
 *     endLine: number,
 *     lineCount: number,
 *     text: string,
 *     language: string,
 *     score: number,
 *     reasons: string[]
 *   }>,
 *   evidenceMap: Map<string, object>,
 *   diagnostics: {
 *     queryTokens: string[],
 *     intent: string,
 *     totalCandidatesScored: number,
 *     selectedCount: number,
 *     totalLines: number,
 *     totalBytes: number,
 *     hasSufficientEvidence: boolean,
 *     topScores: Array<{ chunkId: string, score: number, reasons: string[] }>
 *   }
 * }}
 */
export function retrieveEvidence(question, snapshot, options = {}) {
  const opts = {
    ...DEFAULT_RETRIEVAL_OPTIONS,
    ...options,
  };

  const maxChunks = Math.min(opts.maxChunks, opts.hardMaxChunks);
  const maxLines = opts.maxLines;
  const maxBytes = opts.maxBytes;
  const minThreshold = opts.minRelevanceThreshold;

  // 1. Defensive input handling
  if (!snapshot || !Array.isArray(snapshot.chunks) || snapshot.chunks.length === 0) {
    return {
      evidence: [],
      evidenceMap: new Map(),
      diagnostics: {
        queryTokens: [],
        intent: 'general',
        totalCandidatesScored: 0,
        selectedCount: 0,
        totalLines: 0,
        totalBytes: 0,
        hasSufficientEvidence: false,
        topScores: [],
      },
    };
  }

  // 2. Tokenize and detect intent
  const queryTokens = tokenizeQuery(question);
  const intent = detectDependencyIntent(question);

  if (queryTokens.tokens.length === 0 && queryTokens.pathTokens.length === 0) {
    return {
      evidence: [],
      evidenceMap: new Map(),
      diagnostics: {
        queryTokens: [],
        intent,
        totalCandidatesScored: 0,
        selectedCount: 0,
        totalLines: 0,
        totalBytes: 0,
        hasSufficientEvidence: false,
        topScores: [],
      },
    };
  }

  // 3. Score all chunks deterministically
  const scoredCandidates = [];

  for (const chunk of snapshot.chunks) {
    const fileRecord = snapshot.filesMap?.get(chunk.filePath);
    const { score, reasons } = scoreChunk(chunk, queryTokens, fileRecord);
    if (score > 0) {
      scoredCandidates.push({
        chunk,
        score,
        reasons,
        isGraphExpansion: false,
      });
    }
  }

  // Sort by score descending; break ties stably by chunkId
  scoredCandidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.chunk.chunkId.localeCompare(b.chunk.chunkId);
  });

  // 4. Perform bounded dependency graph expansion
  const topLexical = scoredCandidates.slice(0, 5);
  const expansionBudget = Math.max(0, maxChunks - topLexical.length);
  const graphCandidates = expandDependencyGraph(topLexical, snapshot, intent, expansionBudget);

  // Combine and deduplicate
  const allCandidatesMap = new Map();
  for (const c of scoredCandidates) {
    allCandidatesMap.set(c.chunk.chunkId, { ...c });
  }

  // Evaluate graph relationships consistently for all candidates relative to primary files
  const primaryFiles = new Set(topLexical.slice(0, 3).map((c) => c.chunk.filePath));
  for (const filePath of primaryFiles) {
    if (intent === 'inbound' || intent === 'relational' || intent === 'general') {
      const inboundList = snapshot.inboundDeps?.get(filePath) || [];
      for (const dep of inboundList) {
        if (!dep.sourcePath) continue;
        const sourceChunks = snapshot.chunksByFile?.get(dep.sourcePath) || [];
        const declLine = dep.sourceLocation?.startLine;
        let matchedChunk = null;
        if (typeof declLine === 'number' && declLine > 0) {
          matchedChunk = sourceChunks.find((c) => c.startLine <= declLine && c.endLine >= declLine);
        }
        if (!matchedChunk && sourceChunks.length > 0) {
          matchedChunk = sourceChunks[0];
        }
        if (matchedChunk && allCandidatesMap.has(matchedChunk.chunkId)) {
          const existing = allCandidatesMap.get(matchedChunk.chunkId);
          if (!existing.hasGraphBonus) {
            existing.score += 8;
            existing.reasons.push(`inbound-dependency-from:${dep.sourcePath}`);
            existing.hasGraphBonus = true;
          }
        }
      }
    }

    if (intent === 'outbound' || intent === 'relational' || intent === 'general') {
      const outboundList = snapshot.outboundDeps?.get(filePath) || [];
      for (const dep of outboundList) {
        if (!dep.targetPath) continue;
        const targetChunks = snapshot.chunksByFile?.get(dep.targetPath) || [];
        if (targetChunks.length > 0 && allCandidatesMap.has(targetChunks[0].chunkId)) {
          const existing = allCandidatesMap.get(targetChunks[0].chunkId);
          if (!existing.hasGraphBonus) {
            existing.score += 8;
            existing.reasons.push(`outbound-dependency-to:${dep.targetPath}`);
            existing.hasGraphBonus = true;
          }
        }
      }
    }
  }

  // Introduce newly discovered graph expansion candidates
  for (const gc of graphCandidates) {
    if (!allCandidatesMap.has(gc.chunk.chunkId)) {
      allCandidatesMap.set(gc.chunk.chunkId, gc);
    }
  }

  const finalRanked = Array.from(allCandidatesMap.values());
  finalRanked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.chunk.chunkId.localeCompare(b.chunk.chunkId);
  });

  // 5. Select evidence under strict context budgets
  const selected = [];
  const fileCounts = new Map();
  let totalLines = 0;
  let totalBytes = 0;

  for (const candidate of finalRanked) {
    if (selected.length >= maxChunks) break;
    if (candidate.score < minThreshold) break;

    const chunk = candidate.chunk;
    const fPath = chunk.filePath;
    const currentFileCount = fileCounts.get(fPath) || 0;

    // Diversity check: cap chunks from the same file
    if (currentFileCount >= opts.maxChunksPerFile) {
      continue;
    }

    // Line budget check
    if (totalLines + chunk.lineCount > maxLines) {
      continue;
    }

    // Byte budget check
    const chunkBytes = Buffer.byteLength(chunk.text || '', 'utf8');
    if (totalBytes + chunkBytes > maxBytes) {
      continue;
    }

    selected.push(candidate);
    fileCounts.set(fPath, currentFileCount + 1);
    totalLines += chunk.lineCount;
    totalBytes += chunkBytes;
  }

  // 6. Assign request-scoped evidence IDs (E1, E2, ...)
  const evidence = [];
  const evidenceMap = new Map();

  selected.forEach((item, index) => {
    const evidenceId = `E${index + 1}`;
    const fileRecord = snapshot.filesMap?.get(item.chunk.filePath);
    const evidenceItem = {
      evidenceId,
      chunkId: item.chunk.chunkId,
      filePath: item.chunk.filePath,
      startLine: item.chunk.startLine,
      endLine: item.chunk.endLine,
      lineCount: item.chunk.lineCount,
      text: item.chunk.text,
      language: fileRecord?.language || 'unknown',
      score: item.score,
      reasons: item.reasons,
    };

    evidence.push(evidenceItem);
    evidenceMap.set(evidenceId, evidenceItem);
  });

  // Check if top candidate achieves confidence threshold
  const hasSufficientEvidence = evidence.length > 0 && evidence[0].score >= minThreshold;

  return {
    evidence,
    evidenceMap,
    diagnostics: {
      queryTokens: queryTokens.tokens,
      intent,
      totalCandidatesScored: scoredCandidates.length,
      selectedCount: evidence.length,
      totalLines,
      totalBytes,
      hasSufficientEvidence,
      topScores: finalRanked.slice(0, 5).map((c) => ({
        chunkId: c.chunk.chunkId,
        score: c.score,
        reasons: c.reasons,
      })),
    },
  };
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

