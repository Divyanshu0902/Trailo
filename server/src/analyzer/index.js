export {
  resolveDependency,
  isRelativeSpecifier,
  toPosixPath,
  DEFAULT_RESOLVE_EXTENSIONS,
  DEFAULT_INDEX_EXTENSIONS,
} from './resolver.js';

export {
  detectLanguage,
  isSupportedJsTsFile,
  extractJsTsDependencies,
  analyzeJsTsFile,
  analyzeRepositoryFiles,
  SUPPORTED_EXTENSIONS,
} from './jsTsAnalyzer.js';
