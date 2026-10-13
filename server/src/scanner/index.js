export {
  scanRepository,
  countLines,
  toRelativePosixPath,
  ScannerError,
} from './scanner.js';

export {
  DEFAULT_LIMITS,
  DEFAULT_ALLOWED_EXTENSIONS,
  BINARY_EXTENSIONS,
  isIgnoredDirectory,
  isIgnoredOrSecretFile,
  isAllowedSourceFile,
  isBinaryBuffer,
} from './rules.js';
