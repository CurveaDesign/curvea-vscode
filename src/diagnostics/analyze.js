const path = require("path");

const { ISSUE_CODES, RESERVED_GLOBALS } = require("../constants");
const {
  collectComponentTags,
  collectInterpolations,
  getDirectiveName,
  isFileDeclaration,
  isSimplePath,
  parseAssignmentLine,
  parseCondition,
  parseDeclaration,
  parseForHeader,
  parseImportDirective,
  parseLoadDirective,
  parsePaginateDirective,
  parseUseDirective,
  stripCommentsPreserveLines,
} = require("../parsing");
const {
  findDataSource,
  findLayoutByTarget,
  resolveImportedComponents,
} = require("../workspace/scan");

function analyzeCurveaSource(source, workspaceIndex = emptyWorkspaceIndex(), filePath = "") {
  const originalLines = String(source || "").replace(/\r/g, "").split("\n");
  const lines = stripCommentsPreserveLines(source).replace(/\r/g, "").split("\n");
  const issues = [];
  const consumedLines = new Set();
  const declarations = [];
  const imports = [];
  const loads = [];
  let useDirective = null;
  let paginateDirective = null;
  let seoCount = 0;
  let hasContentBeforeDeclaration = false;
  let flowDepth = 0;

  for (let line = 0; line < lines.length; line += 1) {
    const trimmed = lines[line].trim();

    if (trimmed === "@code") {
      const end = findRawCodeEnd(lines, line);
      if (end === -1) {
        pushLineIssue(issues, ISSUE_CODES.invalidBlockStructure, "error", line, originalLines,
          "Unclosed @code block. Add @endcode to close it.");
        markRange(consumedLines, line, lines.length - 1);
        break;
      }
      markRange(consumedLines, line, end);
      line = end;
      continue;
    }

    if (declarations.length === 0 && trimmed && !isFileDeclaration(trimmed)) {
      hasContentBeforeDeclaration = true;
    }

    if (flowDepth === 0 && isFileDeclaration(trimmed)) {
      const declaration = parseDeclaration(trimmed);
      declarations.push({ ...declaration, line });
      consumedLines.add(line);

      if (declarations.length > 1) {
        pushLineIssue(issues, ISSUE_CODES.misplacedDeclaration, "error", line, originalLines,
          "Only one file declaration is allowed: @page, @layout Name, @component Name(props), or @document.");
      }
      if (declaration.kind !== "valid") {
        pushLineIssue(issues, ISSUE_CODES.invalidDeclaration, "error", line, originalLines,
          invalidDeclarationMessage(declaration.role, declaration.error));
      }
      if (declaration.role === "page" && hasContentBeforeDeclaration) {
        pushLineIssue(issues, ISSUE_CODES.misplacedDeclaration, "error", line, originalLines,
          "Page files must begin with @page. Only whitespace and blank lines may appear before it.");
      }
      continue;
    }

    const role = declarations[0]?.role || null;

    if (flowDepth === 0 && role === "page" && /^@use\s+/.test(trimmed)) {
      const parsed = parseUseDirective(trimmed);
      consumedLines.add(line);
      if (!parsed.valid) {
        pushLineIssue(issues, ISSUE_CODES.invalidDirectiveSyntax, "error", line, originalLines,
          parsed.error || `Invalid @use directive: ${trimmed}`);
      }
      if (useDirective) {
        pushLineIssue(issues, ISSUE_CODES.duplicateDirective, "error", line, originalLines,
          "Only one @use directive is allowed in a page.");
      } else {
        useDirective = { ...parsed, line };
      }
      continue;
    }

    if (flowDepth === 0 && /^@import\s+/.test(trimmed)) {
      const parsed = parseImportDirective(trimmed);
      consumedLines.add(line);
      if (!parsed.valid) {
        pushLineIssue(issues, ISSUE_CODES.invalidDirectiveSyntax, "error", line, originalLines,
          "Invalid @import directive. A component path is required.");
      } else {
        imports.push({ ...parsed, line });
      }
      continue;
    }

    if (flowDepth === 0 && /^@load\s+/.test(trimmed)) {
      const parsed = parseLoadDirective(trimmed);
      consumedLines.add(line);
      if (!parsed.valid) {
        pushLineIssue(issues, ISSUE_CODES.invalidDirectiveSyntax, "error", line, originalLines,
          `Invalid @load directive: ${trimmed}`);
      } else {
        loads.push({ ...parsed, line });
      }
      continue;
    }

    if (flowDepth === 0 && /^@paginate\b/.test(trimmed)) {
      const parsed = parsePaginateDirective(trimmed);
      consumedLines.add(line);
      if (role !== "page") {
        pushLineIssue(issues, ISSUE_CODES.invalidDirectiveRole, "error", line, originalLines,
          "@paginate is only allowed inside @page files.");
      }
      if (!parsed.valid) {
        pushLineIssue(issues, ISSUE_CODES.invalidPagination, "error", line, originalLines,
          "Invalid @paginate directive. Use @paginate <alias> by <positive integer>.");
      }
      if (paginateDirective) {
        pushLineIssue(issues, ISSUE_CODES.duplicateDirective, "error", line, originalLines,
          "Only one @paginate directive is allowed in a page.");
      } else {
        paginateDirective = { ...parsed, line };
      }
      continue;
    }

    if (flowDepth === 0 && ["@data", "@seo", "@style", "@script"].includes(trimmed)) {
      const directive = trimmed.slice(1);
      const end = findEngineBlockEnd(lines, line);
      consumedLines.add(line);
      if (end === -1) {
        pushLineIssue(issues, ISSUE_CODES.invalidBlockStructure, "error", line, originalLines,
          `Unclosed @${directive} block. Add @end to close it.`);
        markRange(consumedLines, line, lines.length - 1);
        break;
      }
      markRange(consumedLines, line, end);

      if (directive === "seo") {
        seoCount += 1;
        if (role !== "page") {
          pushLineIssue(issues, ISSUE_CODES.invalidDirectiveRole, "error", line, originalLines,
            "@seo is only allowed inside @page files.");
        }
        if (seoCount > 1) {
          pushLineIssue(issues, ISSUE_CODES.duplicateDirective, "error", line, originalLines,
            "Only one @seo block is allowed in a page.");
        }
      }

      if (directive === "data" || directive === "seo") {
        validateAssignmentBlock({
          directive,
          bodyLines: lines.slice(line + 1, end),
          startLine: line + 1,
          originalLines,
          issues,
        });
      }

      line = end;
      continue;
    }

    if (/^@(?:if|for)\s+/.test(trimmed)) flowDepth += 1;
    else if (trimmed === "@end" && flowDepth > 0) flowDepth -= 1;
  }

  if (declarations.length === 0) {
    pushLineIssue(issues, ISSUE_CODES.missingDeclaration, "error", 0, originalLines,
      "File must declare exactly one role: @page, @layout Name, @component Name(props), or @document.");
  }

  const declaration = declarations[0] || null;
  validateRoleLocation(declaration, filePath, originalLines, issues);
  validateTemplateBody(declaration, lines, consumedLines, originalLines, issues);
  validateFlowBlocks(lines, consumedLines, originalLines, issues);
  validateExpressions(source, issues, originalLines);
  validateImportsAndComponents(source, imports, workspaceIndex, issues, originalLines, consumedLines);
  validateComponentTagStructure(source, workspaceIndex, issues, originalLines);
  validateLayout(useDirective, workspaceIndex, issues, originalLines);
  validateLoads(loads, workspaceIndex, issues, originalLines);
  validatePagination(paginateDirective, loads, workspaceIndex, filePath, issues, originalLines);
  validateRelatedPageData(filePath, workspaceIndex, issues, originalLines);
  validateDocument(declaration, source, issues, originalLines);

  return dedupeIssues(issues);
}

function validateAssignmentBlock({ directive, bodyLines, startLine, originalLines, issues }) {
  const raw = bodyLines.join("\n").trim();
  if (!raw) return;

  if (directive === "data") {
    try {
      const parsed = JSON.parse(raw);
      if (isPlainObject(parsed)) {
        if (Object.prototype.hasOwnProperty.call(parsed, "CurrentYear")) {
          pushLineIssue(issues, ISSUE_CODES.reservedGlobal, "warning", startLine, originalLines,
            '"CurrentYear" is a reserved Curvea global and cannot be overridden.');
        }
        return;
      }
    } catch {
      // The engine falls back to assignment parsing.
    }
  }

  for (let index = 0; index < bodyLines.length; index += 1) {
    const parsed = parseAssignmentLine(bodyLines[index]);
    if (!parsed.valid) {
      pushLineIssue(issues, ISSUE_CODES.invalidDataEntry, "error", startLine + index, originalLines,
        `Invalid @${directive} entry: ${bodyLines[index].trim()}`);
    } else if (parsed.key && RESERVED_GLOBALS.has(parsed.key)) {
      pushLineIssue(issues, ISSUE_CODES.reservedGlobal, "warning", startLine + index, originalLines,
        `"${parsed.key}" is a reserved Curvea global and cannot be overridden.`);
    }
  }
}

function validateFlowBlocks(lines, consumedLines, originalLines, issues) {
  const stack = [];
  for (let line = 0; line < lines.length; line += 1) {
    if (consumedLines.has(line)) continue;
    const trimmed = lines[line].trim();
    if (!trimmed) continue;

    if (/^@if\b/.test(trimmed)) {
      const condition = trimmed.replace(/^@if\b/, "").trim();
      if (!condition) {
        pushLineIssue(issues, ISSUE_CODES.invalidDirectiveSyntax, "error", line, originalLines,
          "@if requires a condition.");
      } else if (!parseCondition(condition).valid) {
        pushLineIssue(issues, ISSUE_CODES.invalidDirectiveSyntax, "warning", line, originalLines,
          "Curvea conditions support a simple path or one comparison using ==, !=, >, <, >=, or <=.");
      }
      stack.push({ directive: "if", line, hasElse: false });
      continue;
    }

    if (/^@for\b/.test(trimmed)) {
      const parsed = parseForHeader(trimmed);
      if (!parsed.valid) {
        pushLineIssue(issues, ISSUE_CODES.invalidDirectiveSyntax, "error", line, originalLines, parsed.error);
      }
      stack.push({ directive: "for", line });
      continue;
    }

    if (/^@elseif\b/.test(trimmed) || trimmed === "@else") {
      const directive = trimmed.startsWith("@elseif") ? "elseif" : "else";
      const current = stack.at(-1);
      if (!current || current.directive !== "if") {
        pushLineIssue(issues, ISSUE_CODES.invalidBlockStructure, "error", line, originalLines,
          `@${directive} must appear inside an open @if block.`);
        continue;
      }
      if (directive === "elseif") {
        const condition = trimmed.replace(/^@elseif\b/, "").trim();
        if (!condition) {
          pushLineIssue(issues, ISSUE_CODES.invalidDirectiveSyntax, "error", line, originalLines,
            "@elseif requires a condition.");
        } else if (!parseCondition(condition).valid) {
          pushLineIssue(issues, ISSUE_CODES.invalidDirectiveSyntax, "warning", line, originalLines,
            "Curvea conditions support a simple path or one comparison.");
        }
        if (current.hasElse) {
          pushLineIssue(issues, ISSUE_CODES.invalidBlockStructure, "error", line, originalLines,
            "@elseif cannot appear after @else in the same @if block.");
        }
      } else if (current.hasElse) {
        pushLineIssue(issues, ISSUE_CODES.invalidBlockStructure, "error", line, originalLines,
          "Only one @else branch is allowed inside a single @if block.");
      } else {
        current.hasElse = true;
      }
      continue;
    }

    if (trimmed === "@end") {
      if (!stack.length) {
        pushLineIssue(issues, ISSUE_CODES.invalidBlockStructure, "error", line, originalLines,
          "Unexpected @end without a matching @if or @for block.");
      } else {
        stack.pop();
      }
      continue;
    }

    if (/^@endcode\b/.test(trimmed)) {
      pushLineIssue(issues, ISSUE_CODES.invalidBlockStructure, "error", line, originalLines,
        trimmed === "@endcode"
          ? "Unexpected @endcode without a matching literal @code block."
          : "Invalid @endcode syntax. Use exactly @endcode.");
    }
  }

  for (const opened of stack) {
    pushLineIssue(issues, ISSUE_CODES.invalidBlockStructure, "error", opened.line, originalLines,
      `Unclosed @${opened.directive} block. Add @end to close it.`);
  }
}

function validateExpressions(source, issues, originalLines) {
  for (const interpolation of collectInterpolations(source)) {
    if (!interpolation.expression || isSimplePath(interpolation.expression)) continue;
    pushIssue(issues, {
      code: ISSUE_CODES.invalidExpression,
      severity: "warning",
      line: interpolation.line,
      start: interpolation.character,
      end: interpolation.character + interpolation.length,
      message: "Unsupported interpolation expression. CurveaScript accepts only simple paths such as {{ page.title }}.",
    });
  }
}

function validateImportsAndComponents(source, imports, workspaceIndex, issues, originalLines, consumedLines) {
  const importedByName = new Map();
  const importedRecords = [];

  for (const entry of imports) {
    const resolved = resolveImportedComponents(entry.target, workspaceIndex);
    if (resolved.length === 0) {
      pushLineIssue(issues, ISSUE_CODES.unresolvedImport, "warning", entry.line, originalLines,
        `Component import target "${entry.target}" could not be resolved in src/components.`);
    }

    const names = entry.target.endsWith("/*")
      ? resolved.map((component) => path.posix.basename(component.importPath))
      : [path.posix.basename(entry.target.replace(/\\/g, "/"))];

    for (const name of names) {
      const component = resolved.find((candidate) => path.posix.basename(candidate.importPath || "") === name) || resolved[0] || null;
      const resolvedTarget = component?.importPath || entry.target.replace(/^\/+|\/+$/g, "");
      if (importedByName.has(name) && importedByName.get(name).resolvedTarget !== resolvedTarget) {
        pushLineIssue(issues, ISSUE_CODES.duplicateImport, "error", entry.line, originalLines,
          `Duplicate component import for "${name}". Resolve the conflicting import paths.`);
      } else {
        const record = { name, target: entry.target, resolvedTarget, line: entry.line, component };
        importedByName.set(name, record);
        importedRecords.push(record);
      }
    }
  }

  const builtIns = new Set(
    (workspaceIndex.components || []).filter((component) => component.builtIn).map((component) => component.name),
  );
  const used = new Map();
  for (const tag of collectComponentTags(source)) {
    if (consumedLines.has(tag.line)) continue;
    if (!used.has(tag.name)) used.set(tag.name, tag.line);
  }

  for (const [name, line] of used.entries()) {
    if (builtIns.has(name)) continue;
    const imported = importedByName.get(name);
    if (!imported) {
      pushLineIssue(issues, ISSUE_CODES.missingImport, "error", line, originalLines,
        `Component "${name}" is used but not imported in this file.`);
      continue;
    }
    if (imported.component && imported.component.name !== name) {
      pushLineIssue(issues, ISSUE_CODES.invalidComponentName, "error", imported.line, originalLines,
        `Component name mismatch: expected ${name}, found ${imported.component.name}.`);
    }
  }

  for (const record of importedRecords) {
    if (!used.has(record.name)) {
      pushLineIssue(issues, ISSUE_CODES.unusedImport, "warning", record.line, originalLines,
        `Component "${record.name}" is imported but never used.`);
    }
  }
}

function validateComponentTagStructure(source, workspaceIndex, issues, originalLines) {
  const { scanCurveaSource } = require("../parsing");
  const scan = scanCurveaSource(source);
  const searchable = scan.lines.map((line, index) => scan.contexts[index].kind.startsWith("raw-") ? " ".repeat(line.length) : line).join("\n");
  const builtIns = new Set((workspaceIndex.components || []).filter((component) => component.builtIn).map((component) => component.name));

  for (const match of searchable.matchAll(/<([A-Z][A-Za-z0-9]*)\b([^>]*)>/g)) {
    const full = match[0];
    const name = match[1];
    const offset = match.index || 0;
    const line = searchable.slice(0, offset).split("\n").length - 1;
    const selfClosing = /\/>$/.test(full);

    if (!selfClosing && searchable.indexOf(`</${name}>`, offset + full.length) === -1) {
      pushLineIssue(issues, ISSUE_CODES.invalidBlockStructure, "error", line, originalLines,
        `Unclosed component tag: <${name}>`);
    }

    if (builtIns.has(name)) {
      if (!selfClosing) {
        pushLineIssue(issues, ISSUE_CODES.invalidDirectiveSyntax, "warning", line, originalLines,
          `<${name}> is transformed only in self-closing form: <${name} ... />.`);
      } else if (name === "Icon" && !/\bname\s*=\s*(?:"[^"]+"|'[^']+')/.test(full)) {
        pushLineIssue(issues, ISSUE_CODES.invalidDirectiveSyntax, "error", line, originalLines,
          '<Icon /> requires a quoted "name" prop.');
      }
    }
  }
}

function validateLayout(useDirective, workspaceIndex, issues, originalLines) {
  if (!useDirective || !useDirective.valid) return;
  const layout = findLayoutByTarget(useDirective.target, workspaceIndex);
  if (!layout) {
    pushLineIssue(issues, ISSUE_CODES.unresolvedLayout, "error", useDirective.line, originalLines,
      `Layout not found: ${useDirective.target}`);
    return;
  }
  const expectedName = path.posix.basename(useDirective.target);
  if (layout.name !== expectedName) {
    pushLineIssue(issues, ISSUE_CODES.invalidComponentName, "error", useDirective.line, originalLines,
      `Layout name mismatch: expected ${expectedName}, found ${layout.name}.`);
  }
  const expectedProps = new Set(layout.params || []);
  for (const arg of useDirective.args || []) {
    if (!expectedProps.has(arg.key)) {
      pushLineIssue(issues, ISSUE_CODES.unknownLayoutProp, "error", useDirective.line, originalLines,
        `Unknown layout prop "${arg.key}" for layout "${layout.name}".`);
    }
  }
}

function validateLoads(loads, workspaceIndex, issues, originalLines) {
  for (const load of loads) {
    const dataSource = findDataSource(load.source, workspaceIndex);
    if (!dataSource) {
      pushLineIssue(issues, ISSUE_CODES.unresolvedLoad, "warning", load.line, originalLines,
        load.source.endsWith("/*")
          ? `Load folder not found: ${load.source.slice(0, -2)}`
          : `Loaded dataset not found: ${load.source}`);
    } else if (dataSource.validJson === false) {
      pushLineIssue(issues, ISSUE_CODES.unresolvedLoad, "error", load.line, originalLines,
        `Invalid JSON in ${dataSource.relativePath}: ${dataSource.jsonError}`);
    }
  }
}

function validateRelatedPageData(filePath, workspaceIndex, issues, originalLines) {
  if (!filePath) return;
  const page = (workspaceIndex.pages || []).find((entry) => path.resolve(entry.fullPath) === path.resolve(filePath));
  for (const error of page?.dataErrors || []) {
    pushLineIssue(issues, ISSUE_CODES.unresolvedLoad, "error", 0, originalLines,
      `Invalid JSON in ${error.fullPath}: ${error.message}`);
  }
}

function validatePagination(paginate, loads, workspaceIndex, filePath, issues, originalLines) {
  if (!paginate || !paginate.valid) return;
  if (/\/pages\/.*\/\[[A-Za-z][A-Za-z0-9_-]*\]\.csc$/i.test(normalizePath(filePath))) {
    pushLineIssue(issues, ISSUE_CODES.invalidPagination, "error", paginate.line, originalLines,
      "@paginate is not supported on dynamic page files.");
  }

  const binding = loads.find((load) => (load.alias || path.posix.basename(load.source)) === paginate.source);
  if (!binding) {
    pushLineIssue(issues, ISSUE_CODES.invalidPagination, "error", paginate.line, originalLines,
      `@paginate source "${paginate.source}" was not found in @load aliases.`);
    return;
  }
  const dataSource = findDataSource(binding.source, workspaceIndex);
  if (dataSource && dataSource.valueType !== "array") {
    pushLineIssue(issues, ISSUE_CODES.invalidPagination, "error", paginate.line, originalLines,
      `@paginate source "${paginate.source}" must resolve to an array.`);
  }
}

function validateRoleLocation(declaration, filePath, originalLines, issues) {
  if (!declaration || !filePath) return;
  const normalized = normalizePath(filePath);
  let expected = null;
  if (/\/src\/pages\//i.test(normalized) || /\/pages\//i.test(normalized)) expected = "page";
  else if (/\/src\/layouts\//i.test(normalized) || /\/layouts\//i.test(normalized)) expected = "layout";
  else if (/\/src\/components\//i.test(normalized) || /\/components\//i.test(normalized)) expected = "component";
  else if (/\/Document\.csc$/.test(normalized)) expected = "document";

  if (expected && declaration.role !== expected) {
    pushLineIssue(issues, ISSUE_CODES.roleMismatch, "error", declaration.line, originalLines,
      `This file is in the ${expected} location but declares @${declaration.role}.`);
  }

  if (["layout", "component"].includes(declaration.role) && declaration.name) {
    const expectedName = path.basename(filePath, ".csc");
    if (declaration.name !== expectedName) {
      pushLineIssue(issues, ISSUE_CODES.invalidComponentName, "error", declaration.line, originalLines,
        `${declaration.role === "layout" ? "Layout" : "Component"} name mismatch: expected ${expectedName}, found ${declaration.name}.`);
    }
  }
}

function validateTemplateBody(declaration, lines, consumedLines, originalLines, issues) {
  if (!declaration || !["layout", "component", "document"].includes(declaration.role)) return;
  const hasBody = lines.some((line, index) => index !== declaration.line && !consumedLines.has(index) && line.trim());
  if (!hasBody) {
    pushLineIssue(issues, ISSUE_CODES.missingTemplateBody, "error", declaration.line, originalLines,
      `${capitalize(declaration.role)} "${declaration.name}" must contain a template body.`);
  }
}

function validateDocument(declaration, source, issues, originalLines) {
  if (!declaration || declaration.role !== "document") return;
  for (const element of ["html", "head", "body"]) {
    if (!new RegExp(`<${element}\\b`, "i").test(source)) {
      pushLineIssue(issues, ISSUE_CODES.invalidDocument, "error", declaration.line, originalLines,
        `Document.csc must include an <${element}> element.`);
    }
  }
}

function findRawCodeEnd(lines, start) {
  for (let line = start + 1; line < lines.length; line += 1) {
    if (lines[line].trim() === "@endcode") return line;
  }
  return -1;
}

function findEngineBlockEnd(lines, start) {
  let depth = 1;
  for (let line = start + 1; line < lines.length; line += 1) {
    const trimmed = lines[line].trim();
    if (trimmed === "@data" || trimmed === "@style" || trimmed === "@script" || trimmed.startsWith("@if ") || trimmed.startsWith("@for ")) {
      depth += 1;
    } else if (trimmed === "@end") {
      depth -= 1;
      if (depth === 0) return line;
    }
  }
  return -1;
}

function invalidDeclarationMessage(role, detail) {
  if (detail) return detail;
  if (role === "page") return "Invalid @page declaration. Use @page without props.";
  if (role === "document") return "Invalid @document declaration. Use exactly @document.";
  if (role === "layout") return "Invalid @layout declaration. Use @layout Name or @layout Name(props).";
  return "Invalid @component declaration. Use @component Name(props), including parentheses for zero props.";
}

function markRange(set, start, end) {
  for (let line = start; line <= end; line += 1) set.add(line);
}

function pushLineIssue(issues, code, severity, line, originalLines, message) {
  const text = originalLines[Math.max(0, line)] || "";
  pushIssue(issues, { code, severity, line: Math.max(0, line), start: 0, end: text.length, message });
}

function pushIssue(issues, issue) {
  issues.push(issue);
}

function dedupeIssues(issues) {
  const seen = new Set();
  return issues.filter((entry) => {
    const key = `${entry.code}:${entry.line}:${entry.start}:${entry.end}:${entry.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyWorkspaceIndex() {
  return { components: [], layouts: [], dataSources: [], pages: [], projectFeatures: {} };
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  analyzeCurveaSource,
};
