/**
 * Trailo Ask Trailo — Citation Validator Module
 *
 * Enforces referential integrity on model-emitted citation markers.
 * Guarantees that only evidence chunks retrieved for the current request
 * and verified against the captured repository snapshot become clickable citations.
 */

/**
 * Validates inline evidence markers against the request-scoped evidence map and snapshot.
 *
 * @param {string} answerText - Raw generated answer text containing [E1], [E2] markers
 * @param {Map<string, object>} evidenceMap - Map of evidenceId -> evidenceItem from retrieveEvidence
 * @param {object} snapshot - Active repository index snapshot
 * @returns {{
 *   validCitations: Array<{
 *     evidenceId: string,
 *     filePath: string,
 *     startLine: number,
 *     endLine: number,
 *     chunkId: string
 *   }>,
 *   invalidEvidenceIds: string[],
 *   totalMarkersFound: number,
 *   sanitizedAnswer: string
 * }}
 */
export function validateCitations(answerText, evidenceMap, snapshot) {
  if (typeof answerText !== 'string' || !answerText) {
    return {
      validCitations: [],
      invalidEvidenceIds: [],
      totalMarkersFound: 0,
      sanitizedAnswer: '',
    };
  }

  // Find all [E1], [E2], ... markers in the text
  const markerRegex = /\[(E\d+)\]/g;
  const foundMarkers = answerText.match(markerRegex) || [];
  const uniqueMarkerIds = Array.from(new Set(foundMarkers.map((m) => m.slice(1, -1))));

  const validCitations = [];
  const invalidEvidenceIds = [];
  const validIdSet = new Set();

  for (const evidenceId of uniqueMarkerIds) {
    // 1. Verify that evidenceId was supplied in this request's evidenceMap
    if (!evidenceMap || !evidenceMap.has(evidenceId)) {
      invalidEvidenceIds.push(evidenceId);
      continue;
    }

    const evidenceItem = evidenceMap.get(evidenceId);
    if (!evidenceItem || typeof evidenceItem !== 'object') {
      invalidEvidenceIds.push(evidenceId);
      continue;
    }

    const { filePath, startLine, endLine, chunkId } = evidenceItem;

    // 2. Path safety and traversal prevention
    if (!filePath || typeof filePath !== 'string' || filePath.includes('..') || filePath.startsWith('/')) {
      invalidEvidenceIds.push(evidenceId);
      continue;
    }

    // 3. Verify file exists in captured snapshot
    const fileRecord = snapshot?.filesMap?.get(filePath);
    if (!fileRecord) {
      invalidEvidenceIds.push(evidenceId);
      continue;
    }

    // 4. Verify 1-based integer line bounds
    if (
      !Number.isInteger(startLine) ||
      !Number.isInteger(endLine) ||
      startLine < 1 ||
      endLine < startLine ||
      (typeof fileRecord.lineCount === 'number' && endLine > fileRecord.lineCount)
    ) {
      invalidEvidenceIds.push(evidenceId);
      continue;
    }

    validIdSet.add(evidenceId);
    validCitations.push({
      evidenceId,
      filePath,
      startLine,
      endLine,
      chunkId: chunkId || `${filePath}:L${startLine}-L${endLine}`,
    });
  }

  // 5. Sanitize text: remove or neutralize unvalidated markers
  const sanitizedAnswer = sanitizeAnswerMarkers(answerText, validIdSet);

  return {
    validCitations,
    invalidEvidenceIds,
    totalMarkersFound: foundMarkers.length,
    sanitizedAnswer,
  };
}

/**
 * Removes or neutralizes unvalidated evidence markers from answer text.
 * Valid markers like [E1] remain intact; invalid markers like [E99] are stripped.
 *
 * @param {string} text
 * @param {Set<string>|Array<string>} validEvidenceIds
 * @returns {string} Sanitized answer text
 */
export function sanitizeAnswerMarkers(text, validEvidenceIds) {
  if (typeof text !== 'string') return '';
  const validSet = validEvidenceIds instanceof Set ? validEvidenceIds : new Set(validEvidenceIds);

  return text.replace(/([ \t])?\[(E\d+)\]([ \t])?/g, (match, lead, id, trail) => {
    if (validSet.has(id)) {
      return match;
    }
    // If surrounded by spaces on both sides, keep one space to prevent word joining
    if (lead && trail) {
      return ' ';
    }
    // If only leading or only trailing space, drop it cleanly
    return '';
  });
}

