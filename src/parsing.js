const { FILE_ROLES } = require("./constants");

const ROLE_DECLARATION_PATTERNS = {
  page: /^@page$/,
  document: /^@document$/,
  layout: /^@layout\s+([A-Z][A-Za-z0-9]*)(?:\((.*?)\))?$/,
  component: /^@component\s+([A-Z][A-Za-z0-9]*)\((.*?)\)$/,
};

const SIMPLE_PATH_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const SIMPLE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ASSIGNMENT_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const COMPONENT_NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;
const USE_PATTERN = /^@use\s+([A-Za-z0-9_/-]+)(?:\((.*)\))?$/;
const LOAD_PATTERN = /^@load\s+([^\s]+)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/;
const PAGINATE_PATTERN = /^@paginate\s+([A-Za-z_][A-Za-z0-9_]*)\s+by\s+(\d+)$/;
const COMPARISON_PATTERN = /^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/;

function stripCommentsPreserveLines(source) {
  return String(source || "").replace(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replace(/[^\r\n]/g, " "),
  );
}

function firstNonEmptyLineIndex(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim()) return index;
  }
  return -1;
}

function getDirectiveName(trimmedLine) {
  const match = String(trimmedLine || "").match(/^@([A-Za-z]+)/);
  return match ? match[1].toLowerCase() : null;
}

function isFileDeclaration(trimmedLine) {
  const directive = getDirectiveName(trimmedLine);
  return Boolean(directive && FILE_ROLES.has(directive));
}

function parseDeclaration(trimmedLine) {
  const role = getDirectiveName(trimmedLine);
  if (!role || !FILE_ROLES.has(role)) return null;

  const match = String(trimmedLine).match(ROLE_DECLARATION_PATTERNS[role]);
  if (!match) {
    return { kind: "invalid", role, name: null, params: [], rawParams: "" };
  }

  const rawParams = match[2] || "";
  const parameterResult = validateParameterList(rawParams);
  return {
    kind: parameterResult.valid ? "valid" : "invalid",
    role,
    name: match[1] || (role === "document" ? "Document" : null),
    params: parameterResult.params,
    rawParams,
    error: parameterResult.error || null,
  };
}

function parseParameterList(rawParams) {
  const result = validateParameterList(rawParams);
  return result.params;
}

function validateParameterList(rawParams) {
  const value = String(rawParams || "").trim();
  if (!value) return { valid: true, params: [], error: null };

  const split = splitTopLevelCommas(value);
  if (!split.valid) return { valid: false, params: split.parts, error: split.error };

  const params = split.parts.map((part) => part.trim());
  const invalid = params.find((param) => !SIMPLE_IDENTIFIER_PATTERN.test(param));
  return invalid
    ? { valid: false, params, error: `Invalid prop identifier: ${invalid}` }
    : { valid: true, params, error: null };
}

function parseUseDirective(trimmedLine) {
  const match = String(trimmedLine || "").match(USE_PATTERN);
  if (!match) return { valid: false, target: null, args: [], error: "Invalid @use directive" };

  const parsedArgs = parseNamedArguments(match[2] || "");
  return {
    valid: parsedArgs.valid,
    target: match[1],
    args: parsedArgs.args,
    rawArgs: match[2] || "",
    error: parsedArgs.error || null,
  };
}

function parseNamedArguments(rawArgs) {
  const value = String(rawArgs || "").trim();
  if (!value) return { valid: true, args: [], error: null };

  const split = splitTopLevelCommas(value);
  if (!split.valid) return { valid: false, args: [], error: split.error };

  const args = [];
  for (const entry of split.parts) {
    const index = entry.indexOf("=");
    if (index === -1) {
      return { valid: false, args, error: `Invalid @use argument: ${entry}` };
    }

    const key = entry.slice(0, index).trim();
    const rawValue = entry.slice(index + 1).trim();
    if (!SIMPLE_IDENTIFIER_PATTERN.test(key) || !rawValue) {
      return { valid: false, args, error: `Invalid @use argument: ${entry}` };
    }

    args.push({ key, value: parseArgumentValue(rawValue), rawValue, raw: entry });
  }

  return { valid: true, args, error: null };
}

function parseArgumentValue(rawValue) {
  const value = String(rawValue || "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseImportDirective(trimmedLine) {
  const match = String(trimmedLine || "").match(/^@import\s+([\s\S]+)$/);
  const value = match ? match[1].trim() : "";
  return { valid: Boolean(value), target: value || null };
}

function parseLoadDirective(trimmedLine) {
  const match = String(trimmedLine || "").match(LOAD_PATTERN);
  return {
    valid: Boolean(match),
    target: match ? match[1] : null,
    source: match ? match[1] : null,
    alias: match ? match[2] || null : null,
  };
}

function parsePaginateDirective(trimmedLine) {
  const match = String(trimmedLine || "").match(PAGINATE_PATTERN);
  if (!match) return { valid: false, source: null, perPage: null };
  const perPage = Number.parseInt(match[2], 10);
  return { valid: Number.isInteger(perPage) && perPage > 0, source: match[1], perPage };
}

function parseForHeader(trimmedLine) {
  const tokens = String(trimmedLine || "").trim().split(/\s+/);
  if (tokens.length < 4 || tokens[0] !== "@for" || tokens[2] !== "in") {
    return { valid: false, error: `Invalid @for syntax: ${trimmedLine}` };
  }

  const itemName = tokens[1];
  const collectionPath = tokens[3];
  if (!SIMPLE_IDENTIFIER_PATTERN.test(itemName)) {
    return { valid: false, error: `Invalid @for item name: ${itemName}` };
  }
  if (!/^[A-Za-z0-9_.]+$/.test(collectionPath)) {
    return { valid: false, error: `Invalid @for collection path: ${collectionPath}` };
  }

  const options = { limit: null, offset: 0, sort: null };
  let index = 4;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === "limit" || token === "offset") {
      const parsed = Number.parseInt(tokens[index + 1], 10);
      if (Number.isInteger(parsed)) options[token] = Math.max(0, parsed);
      index += 2;
      continue;
    }
    if (token === "sort") {
      const field = tokens[index + 1];
      const direction = tokens[index + 2];
      if (field && /^[A-Za-z0-9_.]+$/.test(field)) {
        options.sort = { field, direction: direction === "desc" ? "desc" : "asc" };
      }
      index += 3;
      continue;
    }
    return { valid: false, error: `Invalid @for syntax: ${trimmedLine}` };
  }

  return { valid: true, itemName, collectionPath, options, error: null };
}

function parseCondition(rawCondition) {
  const condition = String(rawCondition || "").trim();
  if (!condition) return { valid: false, error: "A condition is required" };

  const comparison = condition.match(COMPARISON_PATTERN);
  if (!comparison) {
    return { valid: SIMPLE_PATH_PATTERN.test(condition), left: condition, operator: null, right: null };
  }

  return {
    valid: isConditionValue(comparison[1].trim()) && isConditionValue(comparison[3].trim()),
    left: comparison[1].trim(),
    operator: comparison[2],
    right: comparison[3].trim(),
  };
}

function isConditionValue(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return true;
  if (["true", "false", "null"].includes(value)) return true;
  if (!Number.isNaN(Number(value))) return true;
  return SIMPLE_PATH_PATTERN.test(value) || value === "$index";
}

function parseAssignmentLine(trimmedLine) {
  const line = String(trimmedLine || "").trim();
  if (!line || line.startsWith("#") || line.startsWith("//")) {
    return { valid: true, ignored: true, key: null, value: null };
  }
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.+)$/);
  return match
    ? { valid: true, ignored: false, key: match[1], value: match[2] }
    : { valid: false, ignored: false, key: null, value: null };
}

function splitTopLevelCommas(value) {
  const parts = [];
  let current = "";
  let quoteChar = "";

  for (const char of String(value || "")) {
    if (char === '"' || char === "'") {
      if (!quoteChar) quoteChar = char;
      else if (quoteChar === char) quoteChar = "";
      current += char;
      continue;
    }
    if (!quoteChar && char === ",") {
      if (!current.trim()) return { valid: false, parts, error: "Invalid comma-separated list" };
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (quoteChar) return { valid: false, parts, error: "Unclosed string in comma-separated list" };
  if (current.trim()) parts.push(current.trim());
  return { valid: true, parts, error: null };
}

function scanCurveaSource(source) {
  const sanitizedSource = stripCommentsPreserveLines(source);
  const lines = sanitizedSource.replace(/\r/g, "").split("\n");
  const contexts = lines.map(() => ({ kind: "body", block: null, depth: 0 }));
  const blocks = [];
  const flowStack = [];
  let rawBlock = null;

  for (let line = 0; line < lines.length; line += 1) {
    const trimmed = lines[line].trim();

    if (rawBlock) {
      contexts[line] = { kind: `raw-${rawBlock.directive}`, block: rawBlock.directive, depth: rawBlock.depth };
      if (rawBlock.directive === "code") {
        if (trimmed === "@endcode") {
          rawBlock.endLine = line;
          blocks.push(rawBlock);
          rawBlock = null;
        }
        continue;
      }

      if (startsEngineNestedBlock(trimmed)) {
        rawBlock.depth += 1;
        continue;
      }
      if (trimmed === "@end") {
        rawBlock.depth -= 1;
        if (rawBlock.depth === 0) {
          rawBlock.endLine = line;
          blocks.push(rawBlock);
          rawBlock = null;
        }
      }
      continue;
    }

    contexts[line] = { kind: "body", block: flowStack.at(-1)?.directive || null, depth: flowStack.length };
    if (!trimmed) continue;

    if (trimmed === "@code") {
      rawBlock = { directive: "code", startLine: line, endLine: -1, depth: 1 };
      contexts[line] = { kind: "directive", block: "code", depth: flowStack.length };
      continue;
    }

    if (flowStack.length === 0 && ["@data", "@seo", "@style", "@script"].includes(trimmed)) {
      const directive = trimmed.slice(1);
      rawBlock = { directive, startLine: line, endLine: -1, depth: 1 };
      contexts[line] = { kind: "directive", block: directive, depth: 0 };
      continue;
    }

    if (/^@if\s+/.test(trimmed)) {
      flowStack.push({ directive: "if", startLine: line });
      contexts[line] = { kind: "directive", block: "if", depth: flowStack.length - 1 };
      continue;
    }
    if (/^@for\s+/.test(trimmed)) {
      flowStack.push({ directive: "for", startLine: line });
      contexts[line] = { kind: "directive", block: "for", depth: flowStack.length - 1 };
      continue;
    }
    if (trimmed === "@end" && flowStack.length > 0) {
      const opened = flowStack.pop();
      blocks.push({ ...opened, endLine: line });
      contexts[line] = { kind: "directive", block: opened.directive, depth: flowStack.length };
      continue;
    }
    if (/^@(elseif\s+|else$)/.test(trimmed)) {
      contexts[line] = { kind: "directive", block: flowStack.at(-1)?.directive || null, depth: Math.max(0, flowStack.length - 1) };
    }
  }

  if (rawBlock) blocks.push(rawBlock);
  for (const opened of flowStack) blocks.push({ ...opened, endLine: -1 });

  return { lines, contexts, blocks };
}

function startsEngineNestedBlock(trimmed) {
  return trimmed === "@data"
    || trimmed === "@style"
    || trimmed === "@script"
    || trimmed.startsWith("@if ")
    || trimmed.startsWith("@for ");
}

function analyzeDocumentStructure(source) {
  const scan = scanCurveaSource(source);
  const structure = {
    declaration: null,
    declarationLine: -1,
    hasFileRoleDirective: false,
    bodyStartLine: -1,
    scan,
  };

  let flowDepth = 0;
  for (let line = 0; line < scan.lines.length; line += 1) {
    const trimmed = scan.lines[line].trim();
    const context = scan.contexts[line];
    if (!trimmed || context.kind.startsWith("raw-")) continue;

    if (/^@(?:if|for)\s+/.test(trimmed)) flowDepth += 1;
    if (trimmed === "@end" && flowDepth > 0) flowDepth -= 1;

    if (flowDepth === 0 && isFileDeclaration(trimmed)) {
      structure.hasFileRoleDirective = true;
      if (!structure.declaration) {
        structure.declaration = parseDeclaration(trimmed);
        structure.declarationLine = line;
      }
      continue;
    }

    if (structure.declaration && structure.bodyStartLine === -1 && !isEngineTopLevelDirective(trimmed)) {
      structure.bodyStartLine = line;
    }
  }

  return structure;
}

function isEngineTopLevelDirective(trimmed) {
  return /^@(use|import|load|paginate)\b/.test(trimmed)
    || ["@data", "@seo", "@style", "@script"].includes(trimmed);
}

function getCompletionContextAt(source, offset) {
  const prefix = String(source || "").slice(0, offset);
  const currentLineNumber = prefix.split(/\r?\n/).length - 1;
  const scan = scanCurveaSource(prefix);
  const currentLine = scan.lines[currentLineNumber] || "";
  const context = scan.contexts[currentLineNumber] || { kind: "body" };
  const beforeInterpolation = currentLine.lastIndexOf("{{");
  const afterInterpolation = currentLine.lastIndexOf("}}");

  return {
    inCodeBlock: context.kind === "raw-code",
    inRawBlock: context.kind.startsWith("raw-"),
    rawBlock: context.block,
    inDirectiveLine: /^\s*@/.test(currentLine),
    inInterpolation: beforeInterpolation > afterInterpolation,
  };
}

function collectUsedComponentsFromLine(trimmedLine, lineNumber, usedComponents) {
  for (const match of String(trimmedLine || "").matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) {
    if (!usedComponents.has(match[1])) usedComponents.set(match[1], lineNumber);
  }
}

function collectComponentTags(source) {
  const scan = scanCurveaSource(source);
  const tags = [];
  for (let line = 0; line < scan.lines.length; line += 1) {
    if (scan.contexts[line].kind.startsWith("raw-")) continue;
    for (const match of scan.lines[line].matchAll(/<\/?([A-Z][A-Za-z0-9]*)\b/g)) {
      tags.push({ name: match[1], line, character: (match.index || 0) + (match[0].startsWith("</") ? 2 : 1) });
    }
  }
  return tags;
}

function collectInterpolations(source) {
  const scan = scanCurveaSource(source);
  const expressions = [];
  for (let line = 0; line < scan.lines.length; line += 1) {
    const kind = scan.contexts[line].kind;
    if (["raw-code", "raw-style", "raw-script", "raw-data"].includes(kind)) continue;
    for (const match of scan.lines[line].matchAll(/\{\{\s*([\s\S]*?)\s*\}\}/g)) {
      expressions.push({ expression: match[1].trim(), line, character: match.index || 0, length: match[0].length });
    }
  }
  return expressions;
}

function isSimplePath(value) {
  return SIMPLE_PATH_PATTERN.test(String(value || ""));
}

function isComponentName(value) {
  return COMPONENT_NAME_PATTERN.test(String(value || ""));
}

function isAssignmentKey(value) {
  return ASSIGNMENT_KEY_PATTERN.test(String(value || ""));
}

function isHtmlOpeningTag(text) {
  return /^<[A-Za-z][\w:-]*(\s[^>]*)?>$/.test(text) && !isHtmlClosingTag(text);
}

function isHtmlClosingTag(text) {
  return /^<\/[A-Za-z][\w:-]*\s*>$/.test(text);
}

function isSelfClosingHtmlTag(text) {
  if (text.endsWith("/>")) return true;
  const match = text.match(/^<([A-Za-z][\w:-]*)/);
  if (!match) return false;
  return new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]).has(match[1].toLowerCase());
}

function isFullInlineHtmlElement(text) {
  return /^<([A-Za-z][\w:-]*)(\s[^>]*)?>[^<]+<\/[A-Za-z][\w:-]*>$/.test(text);
}

module.exports = {
  ASSIGNMENT_KEY_PATTERN,
  COMPONENT_NAME_PATTERN,
  SIMPLE_IDENTIFIER_PATTERN,
  SIMPLE_PATH_PATTERN,
  analyzeDocumentStructure,
  collectComponentTags,
  collectInterpolations,
  collectUsedComponentsFromLine,
  firstNonEmptyLineIndex,
  getCompletionContextAt,
  getDirectiveName,
  isAssignmentKey,
  isComponentName,
  isFileDeclaration,
  isFullInlineHtmlElement,
  isHtmlClosingTag,
  isHtmlOpeningTag,
  isSelfClosingHtmlTag,
  isSimplePath,
  parseAssignmentLine,
  parseCondition,
  parseDeclaration,
  parseForHeader,
  parseImportDirective,
  parseLoadDirective,
  parseNamedArguments,
  parsePaginateDirective,
  parseParameterList,
  parseUseDirective,
  scanCurveaSource,
  splitTopLevelCommas,
  stripCommentsPreserveLines,
  validateParameterList,
};
