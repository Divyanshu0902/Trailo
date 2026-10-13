/**
 * In-memory source loader managing fetching, caching, and race condition prevention.
 */
export class SourceLoader {
  /**
   * @param {typeof fetch} [fetchFn]
   */
  constructor(fetchFn) {
    this.fetchFn = typeof fetchFn === 'function' ? fetchFn : null;
    this.cache = new Map();
    this.activeRequestId = 0;
  }

  /**
   * Retrieves file content, using cache if available.
   * Discards responses from superseded requests.
   *
   * @param {string} filePath - Repository-relative file path
   * @returns {Promise<{
   *   isStale: boolean,
   *   data?: {
   *     path: string,
   *     content: string,
   *     lineCount: number,
   *     language: string,
   *     size: number,
   *     extension: string
   *   },
   *   error?: {
   *     code: string,
   *     message: string
   *   }
   * }>}
   */
  async loadSource(filePath) {
    const requestId = ++this.activeRequestId;

    if (!filePath || typeof filePath !== 'string') {
      return {
        isStale: requestId !== this.activeRequestId,
        error: {
          code: 'INVALID_FILE_PATH',
          message: 'File path must be a non-empty string',
        },
      };
    }

    // Check in-memory cache first
    if (this.cache.has(filePath)) {
      return {
        isStale: requestId !== this.activeRequestId,
        data: this.cache.get(filePath),
      };
    }

    try {
      const url = `/api/files?path=${encodeURIComponent(filePath)}`;
      let res;
      if (this.fetchFn) {
        res = await this.fetchFn(url);
      } else if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
        res = await window.fetch(url);
      } else {
        res = await fetch(url);
      }

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        const err = errorBody?.error || {
          code: `HTTP_${res.status}`,
          message: `Server returned HTTP ${res.status}`,
        };
        return {
          isStale: requestId !== this.activeRequestId,
          error: err,
        };
      }

      const data = await res.json();
      this.cache.set(filePath, data);

      return {
        isStale: requestId !== this.activeRequestId,
        data,
      };
    } catch (err) {
      return {
        isStale: requestId !== this.activeRequestId,
        error: {
          code: err.code || 'NETWORK_ERROR',
          message: err.message || 'Failed to fetch source content',
        },
      };
    }
  }

  /**
   * Clears the in-memory cache (e.g. when scanning a new repository).
   */
  clearCache() {
    this.cache.clear();
    this.activeRequestId = 0;
  }
}

export const defaultSourceLoader = new SourceLoader();
