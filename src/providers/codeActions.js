const vscode = require("vscode");

const { CURVEA_SELECTOR, ISSUE_CODES } = require("../constants");
const { scanWorkspace } = require("../workspace");

function registerImportQuickFixProvider(context) {
  const provider = vscode.languages.registerCodeActionsProvider(
    CURVEA_SELECTOR,
    {
      provideCodeActions(document, _range, actionContext) {
        const workspaceIndex = scanWorkspace();
        const actions = [];
        for (const diagnostic of actionContext.diagnostics) {
          if (diagnostic.source !== "curvea") continue;
          const code = String(diagnostic.code || "");

          if (code === ISSUE_CODES.missingImport) {
            const name = diagnostic.message.match(/^Component "([A-Z][A-Za-z0-9]*)"/)?.[1];
            const matches = name ? workspaceIndex.components.filter((entry) => !entry.builtIn && entry.name === name) : [];
            const component = matches.length === 1 ? matches[0] : null;
            if (component && !component.builtIn) {
              const insertion = buildImportInsertion(document, component.importPath || component.name);
              if (insertion) actions.push(editAction(`Import ${name}`, document, insertion.range, insertion.text, diagnostic));
            }
          }

          if (code === ISSUE_CODES.unusedImport || code === ISSUE_CODES.reservedGlobal) {
            const line = diagnostic.range.start.line;
            const deleteRange = document.lineAt(line).rangeIncludingLineBreak;
            actions.push(editAction(
              code === ISSUE_CODES.unusedImport ? "Remove unused import" : "Remove reserved global override",
              document,
              deleteRange,
              "",
              diagnostic,
            ));
          }

          if (code === ISSUE_CODES.missingDeclaration) {
            const declaration = inferDeclaration(document.uri.fsPath);
            if (declaration) {
              actions.push(editAction(`Add ${declaration}`, document, new vscode.Range(0, 0, 0, 0), `${declaration}\n`, diagnostic));
            }
          }

          if (code === ISSUE_CODES.invalidDeclaration) {
            const line = diagnostic.range.start.line;
            const text = document.lineAt(line).text;
            const component = text.match(/^(\s*@component\s+[A-Z][A-Za-z0-9]*)\s*$/);
            if (component) {
              actions.push(editAction("Add required component parentheses", document, document.lineAt(line).range, `${component[1]}()`, diagnostic));
            }
          }

          if (code === ISSUE_CODES.invalidBlockStructure && diagnostic.message.startsWith("Unclosed @")) {
            const close = diagnostic.message.includes("@code") ? "@endcode" : "@end";
            const end = document.positionAt(document.getText().length);
            const prefix = document.getText().endsWith("\n") ? "" : "\n";
            actions.push(editAction(`Add ${close}`, document, new vscode.Range(end, end), `${prefix}${close}\n`, diagnostic));
          }
        }
        return actions;
      },
    },
    { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
  );
  context.subscriptions.push(provider);
}

function buildImportInsertion(document, importPath) {
  const lines = document.getText().split(/\r?\n/);
  let insertLine = -1;
  for (let line = 0; line < lines.length; line += 1) {
    if (/^\s*@(page|layout|component|document)\b/.test(lines[line])) insertLine = Math.max(insertLine, line);
    if (/^\s*@import\s+/.test(lines[line])) insertLine = Math.max(insertLine, line);
  }
  if (insertLine < 0) return null;
  const position = new vscode.Position(insertLine + 1, 0);
  return { range: new vscode.Range(position, position), text: `@import ${importPath}\n` };
}

function inferDeclaration(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const name = normalized.split("/").at(-1)?.replace(/\.csc$/, "") || "Name";
  if (/\/pages\//.test(normalized)) return "@page";
  if (/\/layouts\//.test(normalized)) return `@layout ${name}`;
  if (/\/components\//.test(normalized)) return `@component ${name}()`;
  if (/\/Document\.csc$/.test(normalized)) return "@document";
  return null;
}

function editAction(title, document, range, text, diagnostic) {
  const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, range, text);
  action.edit = edit;
  action.diagnostics = [diagnostic];
  action.isPreferred = true;
  return action;
}

module.exports = {
  registerImportQuickFixProvider,
};
