/**
 * Scanner rules and safety configuration for Trailo repository scanner.
 */

export const DEFAULT_LIMITS = {
  maxFiles: 1000,
  maxFileSizeBytes: 500 * 1024, // 500 KB per file
  maxTotalBytes: 20 * 1024 * 1024, // 20 MB total indexed content
};

export const DEFAULT_ALLOWED_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
]);

export const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.output',
  'vendor',
  '__pycache__',
]);

export const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.webp',
  '.svg',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.wasm',
  '.bin',
  '.dat',
  '.mp3',
  '.mp4',
  '.wav',
  '.ttf',
  '.woff',
  '.woff2',
  '.eot',
  '.pyc',
  '.class',
  '.o',
  '.obj',
]);

const SECRET_FILENAME_PATTERNS = [
  /^\.env(\..+)?$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\..+)?$/i,
  /\.(pem|key|pfx|p12|pkcs12)$/i,
  /credentials\.json$/i,
  /service-account.*\.json$/i,
];

/**
 * Checks if a directory should be skipped.
 * Skips hidden directories (starting with '.') and common build/dependency folders.
 *
 * @param {string} dirName
 * @returns {boolean}
 */
export function isIgnoredDirectory(dirName) {
  if (!dirName || dirName === '.' || dirName === '..') return false;
  if (dirName.startsWith('.')) return true;
  return IGNORED_DIRECTORY_NAMES.has(dirName.toLowerCase());
}

/**
 * Checks if a filename indicates a hidden file, environment file, or potential secret.
 *
 * @param {string} fileName
 * @returns {boolean}
 */
export function isIgnoredOrSecretFile(fileName) {
  if (!fileName) return true;
  if (fileName.startsWith('.')) return true;
  return SECRET_FILENAME_PATTERNS.some((pattern) => pattern.test(fileName));
}

/**
 * Checks if a file extension is in the supported allowlist.
 *
 * @param {string} extension - File extension including leading dot (e.g. '.js')
 * @param {Set<string>} [allowedExtensions=DEFAULT_ALLOWED_EXTENSIONS]
 * @returns {boolean}
 */
export function isAllowedSourceFile(extension, allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS) {
  if (!extension) return false;
  return allowedExtensions.has(extension.toLowerCase());
}

/**
 * Inspects a buffer to determine if it contains null bytes, indicating binary content.
 *
 * @param {Buffer} buffer
 * @param {number} [bytesToCheck=8192]
 * @returns {boolean}
 */
export function isBinaryBuffer(buffer, bytesToCheck = 8192) {
  const length = Math.min(buffer.length, bytesToCheck);
  for (let i = 0; i < length; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}
