const { TextDocument } = require("vscode-languageserver-textdocument");

const { htmlLanguageService } = require("../html/service");
const { scanCurveaSource } = require("../parsing");

function formatCurveaDocument(source, options = {}) {
  const indentSize = clampIndentSize(options.indentSize);
  const insertSpaces = options.insertSpaces !== false;
  const value = String(source || "").replace(/\r/g, "");
  const protectedDocument = protectCurveaSyntax(value);
  const document = TextDocument.create("untitled:curvea-format.csc", "html", 1, protectedDocument.text);
  const edits = htmlLanguageService.format(document, undefined, {
    tabSize: indentSize,
    insertSpaces,
    wrapLineLength: Number.isInteger(options.wrapLineLength) ? options.wrapLineLength : 120,
    preserveNewLines: true,
    maxPreserveNewLines: 2,
    indentInnerHtml: true,
    endWithNewline: true,
  });

  let formatted = applyTextEdits(document, edits);
  formatted = indentFlowContent(formatted, protectedDocument.directives, indentSize, insertSpaces);
  formatted = restoreDirectives(formatted, protectedDocument.directives);
  formatted = restoreRawBlocks(formatted, protectedDocument.rawBlocks);
  return ensureSingleFinalNewline(formatted);
}

function protectCurveaSyntax(source) {
  const scan = scanCurveaSource(source);
  const lines = source.split("\n");
  const rawBlocks = [];
  const directives = [];
  const output = [];

  for (let line = 0; line < lines.length; line += 1) {
    const raw = scan.blocks.find((block) =>
      ["code", "data", "seo", "style", "script"].includes(block.directive)
      && block.startLine === line
      && block.endLine >= line,
    );
    if (raw) {
      const id = rawBlocks.length;
      rawBlocks.push(lines.slice(raw.startLine, raw.endLine + 1).join("\n"));
      output.push("<!--__CURVEA_RAW_" + id + "__-->");
      line = raw.endLine;
      continue;
    }

    if (/^\s*@/.test(lines[line])) {
      const id = directives.length;
      directives.push(lines[line].trim());
      output.push("<!--__CURVEA_DIRECTIVE_" + id + "__-->");
      continue;
    }

    output.push(maskInterpolationsForFormatting(lines[line]));
  }

  return { text: output.join("\n"), directives, rawBlocks };
}

function maskInterpolationsForFormatting(line) {
  return String(line).replace(/\{\{[\s\S]*?\}\}/g, (value) => {
    return "__CURVEA_EXPR_" + Buffer.from(value, "utf8").toString("base64url") + "__";
  });
}

function applyTextEdits(document, edits) {
  let value = document.getText();
  const normalized = [...(edits || [])].map((edit) => ({
    start: document.offsetAt(edit.range.start),
    end: document.offsetAt(edit.range.end),
    newText: edit.newText,
  })).sort((left, right) => right.start - left.start);
  for (const edit of normalized) {
    value = value.slice(0, edit.start) + edit.newText + value.slice(edit.end);
  }
  return value.replace(/__CURVEA_EXPR_([A-Za-z0-9_-]+)__/g, (_match, encoded) =>
    Buffer.from(encoded, "base64url").toString("utf8"));
}

function indentFlowContent(source, directives, indentSize, insertSpaces) {
  const unit = insertSpaces ? " ".repeat(indentSize) : "\t";
  const lines = source.split("\n");
  let depth = 0;

  return lines.map((line) => {
    const match = line.match(/^(\s*)<!--__CURVEA_DIRECTIVE_(\d+)__-->$/);
    const rawMatch = line.match(/^(\s*)<!--__CURVEA_RAW_(\d+)__-->$/);
    if (rawMatch) return rawMatch[1] + unit.repeat(depth) + rawMatch[0].trim();
    if (match) {
      const directive = directives[Number(match[2])] || "";
      if (directive === "@end" || directive === "@endcode") depth = Math.max(0, depth - 1);
      const branch = /^@(elseif|else)\b/.test(directive);
      const lineDepth = branch ? Math.max(0, depth - 1) : depth;
      const result = match[1] + unit.repeat(lineDepth) + match[0].trim();
      if (/^@(if|for)\b/.test(directive)) depth += 1;
      return result;
    }
    if (!line.trim()) return line;
    return unit.repeat(depth) + line;
  }).join("\n");
}

function restoreDirectives(source, directives) {
  return source.replace(/<!--__CURVEA_DIRECTIVE_(\d+)__-->/g, (_match, id) =>
    directives[Number(id)] || "");
}

function restoreRawBlocks(source, rawBlocks) {
  return source.replace(/^\s*<!--__CURVEA_RAW_(\d+)__-->\s*$/gm, (_match, id) =>
    rawBlocks[Number(id)] || "");
}

function clampIndentSize(value) {
  return Number.isInteger(value) && value > 0 && value <= 8 ? value : 2;
}

function ensureSingleFinalNewline(value) {
  return String(value || "").replace(/\s+$/, "") + "\n";
}

module.exports = {
  applyTextEdits,
  formatCurveaDocument,
  protectCurveaSyntax,
};
