import ts from 'typescript';
import path from 'node:path';
import { resolveDependency, toPosixPath } from './resolver.js';

export const SUPPORTED_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
]);

/**
 * Detects the programming language for a given file path based on extension.
 *
 * @param {string} filePath
 * @returns {'javascript' | 'typescript' | 'unknown'}
 */
export function detectLanguage(filePath) {
  if (typeof filePath !== 'string') return 'unknown';
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.d.ts') || lower.endsWith('.ts') || lower.endsWith('.tsx')) {
    return 'typescript';
  }
  if (
    lower.endsWith('.js') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs')
  ) {
    return 'javascript';
  }
  return 'unknown';
}

/**
 * Returns true if the file path is a supported JS/TS source file.
 *
 * @param {string} filePath
 * @returns {boolean}
 */
export function isSupportedJsTsFile(filePath) {
  return detectLanguage(filePath) !== 'unknown';
}

/**
 * Maps a file path to the appropriate TypeScript ScriptKind for accurate parsing.
 *
 * @param {string} filePath
 * @returns {ts.ScriptKind}
 */
function getScriptKind(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (lower.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (lower.endsWith('.ts') || lower.endsWith('.d.ts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/**
 * Checks if an AST node is a string literal or no-substitution template literal.
 *
 * @param {ts.Node} node
 * @returns {boolean}
 */
function isStringLiteralNode(node) {
  return Boolean(
    node &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
  );
}

/**
 * Extracts raw, AST-independent dependency declarations from JS/TS source content.
 *
 * @param {string} filePath - Relative file path
 * @param {string} content - Source code content
 * @returns {{
 *   rawDependencies: Array<{
 *     specifier: string,
 *     kind: 'import' | 'export' | 'require',
 *     sourceLocation: { startLine: number, endLine: number }
 *   }>,
 *   diagnostics: string[]
 * }}
 */
export function extractJsTsDependencies(filePath, content) {
  if (typeof content !== 'string' || content.length === 0) {
    return { rawDependencies: [], diagnostics: [] };
  }

  const scriptKind = getScriptKind(filePath);
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true, // setParentNodes
    scriptKind
  );

  const rawDependencies = [];
  const diagnostics = [];

  // Capture syntax diagnostics if present without failing
  if (sourceFile.parseDiagnostics && sourceFile.parseDiagnostics.length > 0) {
    for (const diag of sourceFile.parseDiagnostics) {
      const message = typeof diag.messageText === 'string'
        ? diag.messageText
        : diag.messageText.messageText;
      diagnostics.push(`Line ${sourceFile.getLineAndCharacterOfPosition(diag.start).line + 1}: ${message}`);
    }
  }

  /**
   * Helper to compute 1-based inclusive start and end line for an AST node.
   *
   * @param {ts.Node} node
   * @returns {{ startLine: number, endLine: number }}
   */
  function getLocation(node) {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    return {
      startLine: start.line + 1,
      endLine: end.line + 1,
    };
  }

  /**
   * Recursive AST visitor
   *
   * @param {ts.Node} node
   */
  function visit(node) {
    // 1. Static ESM import declaration: import ... from 'specifier'
    if (ts.isImportDeclaration(node)) {
      if (node.moduleSpecifier && isStringLiteralNode(node.moduleSpecifier)) {
        rawDependencies.push({
          specifier: node.moduleSpecifier.text,
          kind: 'import',
          sourceLocation: getLocation(node),
        });
      }
    }
    // 2. Static ESM export declaration with specifier: export ... from 'specifier'
    else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && isStringLiteralNode(node.moduleSpecifier)) {
        rawDependencies.push({
          specifier: node.moduleSpecifier.text,
          kind: 'export',
          sourceLocation: getLocation(node),
        });
      }
    }
    // 3. TypeScript import equals declaration: import x = require('specifier')
    else if (ts.isImportEqualsDeclaration(node)) {
      if (
        ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression &&
        isStringLiteralNode(node.moduleReference.expression)
      ) {
        rawDependencies.push({
          specifier: node.moduleReference.expression.text,
          kind: 'require',
          sourceLocation: getLocation(node),
        });
      }
    }
    // 4. Call expression: require('specifier') or dynamic import('specifier')
    else if (ts.isCallExpression(node)) {
      // CommonJS require('specifier')
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length === 1 &&
        isStringLiteralNode(node.arguments[0])
      ) {
        rawDependencies.push({
          specifier: node.arguments[0].text,
          kind: 'require',
          sourceLocation: getLocation(node),
        });
      }
      // Dynamic import('specifier')
      else if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length >= 1 &&
        isStringLiteralNode(node.arguments[0])
      ) {
        rawDependencies.push({
          specifier: node.arguments[0].text,
          kind: 'import',
          sourceLocation: getLocation(node),
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return { rawDependencies, diagnostics };
}

/**
 * Analyzes a single file and normalizes its dependencies against known repository files.
 *
 * @param {{ path: string, content: string }} file - Scanned file record
 * @param {Set<string>|string[]} [indexedPaths=[]] - Known repository-relative paths
 * @returns {{
 *   filePath: string,
 *   language: 'javascript' | 'typescript' | 'unknown',
 *   dependencies: Array<{
 *     sourcePath: string,
 *     targetPath: string | null,
 *     specifier: string,
 *     kind: 'import' | 'export' | 'require',
 *     language: 'javascript' | 'typescript',
 *     resolutionStatus: 'resolved' | 'external' | 'unresolved',
 *     sourceLocation: { startLine: number, endLine: number }
 *   }>,
 *   diagnostics: string[]
 * }}
 */
export function analyzeJsTsFile(file, indexedPaths = []) {
  if (!file || typeof file.path !== 'string') {
    throw new TypeError('file must be an object with a string path');
  }

  const normalizedPath = toPosixPath(file.path);
  const language = detectLanguage(normalizedPath);

  if (language === 'unknown') {
    return {
      filePath: normalizedPath,
      language,
      dependencies: [],
      diagnostics: [],
    };
  }

  const { rawDependencies, diagnostics } = extractJsTsDependencies(normalizedPath, file.content || '');

  const dependencies = rawDependencies.map((raw) => {
    const { targetPath, resolutionStatus } = resolveDependency(
      raw.specifier,
      normalizedPath,
      indexedPaths
    );

    return {
      sourcePath: normalizedPath,
      targetPath,
      specifier: raw.specifier,
      kind: raw.kind,
      language,
      resolutionStatus,
      sourceLocation: raw.sourceLocation,
    };
  });

  return {
    filePath: normalizedPath,
    language,
    dependencies,
    diagnostics,
  };
}

/**
 * Analyzes an array of scanned files and returns all normalized dependencies across the repository.
 *
 * @param {Array<{ path: string, content: string }>} files
 * @returns {{
 *   dependencies: Array<{
 *     sourcePath: string,
 *     targetPath: string | null,
 *     specifier: string,
 *     kind: 'import' | 'export' | 'require',
 *     language: 'javascript' | 'typescript',
 *     resolutionStatus: 'resolved' | 'external' | 'unresolved',
 *     sourceLocation: { startLine: number, endLine: number }
 *   }>,
 *   fileAnalyses: Map<string, object>,
 *   diagnostics: Array<{ filePath: string, message: string }>
 * }}
 */
export function analyzeRepositoryFiles(files) {
  if (!Array.isArray(files)) {
    throw new TypeError('files must be an array');
  }

  const indexedPaths = new Set(
    files
      .filter((f) => f && typeof f.path === 'string')
      .map((f) => toPosixPath(f.path))
  );

  const allDependencies = [];
  const fileAnalyses = new Map();
  const allDiagnostics = [];

  for (const file of files) {
    if (!file || typeof file.path !== 'string') continue;

    const analysis = analyzeJsTsFile(file, indexedPaths);
    fileAnalyses.set(analysis.filePath, analysis);
    allDependencies.push(...analysis.dependencies);

    if (analysis.diagnostics.length > 0) {
      for (const diag of analysis.diagnostics) {
        allDiagnostics.push({ filePath: analysis.filePath, message: diag });
      }
    }
  }

  return {
    dependencies: allDependencies,
    fileAnalyses,
    diagnostics: allDiagnostics,
  };
}
