const vscode = require("vscode");

const { CURVEA_SELECTOR } = require("../constants");
const { scanCurveaSource } = require("../parsing");

const TOKEN_TYPES = ["keyword", "class", "parameter", "variable", "property", "operator", "number", "string", "namespace"];
const LEGEND = new vscode.SemanticTokensLegend(TOKEN_TYPES, []);

function registerSemanticTokensProvider(context) {
  const provider = vscode.languages.registerDocumentSemanticTokensProvider(
    CURVEA_SELECTOR,
    {
      provideDocumentSemanticTokens(document) {
        const builder = new vscode.SemanticTokensBuilder(LEGEND);
        const scan = scanCurveaSource(document.getText());
        const occupied = new Map();

        for (let line = 0; line < scan.lines.length; line += 1) {
          const text = scan.lines[line];
          const trimmed = text.trim();
          const contextKind = scan.contexts[line]?.kind || "body";
          if (contextKind.startsWith("raw-")) continue;

          const directiveMatch = text.match(/@(page|layout|component|document|use|import|load|paginate|data|seo|style|script|code|endcode|if|elseif|else|for|end)\b/);
          if (directiveMatch) push(builder, occupied, line, directiveMatch.index, directiveMatch[0].length, "keyword");

          let match = trimmed.match(/^@(layout|component)\s+([A-Z][A-Za-z0-9]*)(?:\(([^)]*)\))?/);
          if (match) {
            pushText(builder, occupied, line, text, match[2], "class");
            for (const prop of (match[3] || "").split(",").map((value) => value.trim()).filter(Boolean)) {
              pushText(builder, occupied, line, text, prop, "parameter");
            }
          }

          match = trimmed.match(/^@use\s+([A-Za-z0-9_/-]+)/);
          if (match) pushText(builder, occupied, line, text, match[1], "class");
          match = trimmed.match(/^@import\s+(\S+)/);
          if (match) pushText(builder, occupied, line, text, match[1], "namespace");
          match = trimmed.match(/^@load\s+(\S+)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?/);
          if (match) {
            pushText(builder, occupied, line, text, match[1], "string");
            if (match[2]) pushText(builder, occupied, line, text, match[2], "variable", text.lastIndexOf(match[2]));
          }
          match = trimmed.match(/^@paginate\s+([A-Za-z_][A-Za-z0-9_]*)\s+(by)\s+(\d+)/);
          if (match) {
            pushText(builder, occupied, line, text, match[1], "variable");
            pushText(builder, occupied, line, text, match[2], "operator");
            pushText(builder, occupied, line, text, match[3], "number", text.lastIndexOf(match[3]));
          }
          match = trimmed.match(/^@for\s+([A-Za-z_][A-Za-z0-9_]*)\s+(in)\s+([A-Za-z0-9_.]+)/);
          if (match) {
            pushText(builder, occupied, line, text, match[1], "variable");
            pushText(builder, occupied, line, text, match[2], "operator");
            pushText(builder, occupied, line, text, match[3], "variable", text.indexOf(match[3], text.indexOf(match[2]) + match[2].length));
          }

          if (!contextKind.startsWith("raw-")) {
            for (const interpolation of text.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g)) {
              const start = (interpolation.index || 0) + interpolation[0].indexOf(interpolation[1]);
              push(builder, occupied, line, start, interpolation[1].length, interpolation[1].includes(".") ? "property" : "variable");
            }
            for (const tag of text.matchAll(/<\/?([A-Z][A-Za-z0-9]*)\b/g)) {
              push(builder, occupied, line, (tag.index || 0) + tag[0].indexOf(tag[1]), tag[1].length, "class");
            }
          }

          if (/^\s*@(if|elseif)\s+/.test(text)) {
            for (const operator of text.matchAll(/==|!=|>=|<=|>|</g)) {
              push(builder, occupied, line, operator.index || 0, operator[0].length, "operator");
            }
          }
        }
        return builder.build();
      },
    },
    LEGEND,
  );
  context.subscriptions.push(provider);
}

function pushText(builder, occupied, line, text, value, type, explicitStart = -1) {
  const start = explicitStart >= 0 ? explicitStart : text.indexOf(value);
  if (start >= 0) push(builder, occupied, line, start, value.length, type);
}

function push(builder, occupied, line, start, length, type) {
  if (start < 0 || length <= 0) return;
  const ranges = occupied.get(line) || [];
  const end = start + length;
  if (ranges.some((range) => start < range.end && end > range.start)) return;
  ranges.push({ start, end });
  occupied.set(line, ranges);
  builder.push(line, start, length, TOKEN_TYPES.indexOf(type), 0);
}

module.exports = {
  registerSemanticTokensProvider,
};
