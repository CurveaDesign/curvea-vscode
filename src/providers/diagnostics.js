const vscode = require("vscode");

const { analyzeCurveaSource } = require("../diagnostics/analyze");
const { invalidateWorkspaceIndex, scanWorkspace } = require("../workspace");

const ISSUE_SEVERITY = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
};

function registerDiagnostics(context) {
  const collection = vscode.languages.createDiagnosticCollection("curvea");
  let refreshTimer = null;

  const refresh = (document) => {
    if (!document || document.languageId !== "curvea") {
      return;
    }

    const configuration = vscode.workspace.getConfiguration("curvea", document.uri);
    if (!configuration.get("diagnostics.enabled", true)) {
      collection.delete(document.uri);
      return;
    }

    const workspaceIndex = scanWorkspace();
    let issues = analyzeCurveaSource(document.getText(), workspaceIndex, document.uri.fsPath);
    if (!configuration.get("diagnostics.unusedImports", true)) {
      issues = issues.filter((issue) => issue.code !== "curvea.unusedImport");
    }
    const diagnostics = issues.map((entry) => {
      const safeLine = Math.min(entry.line, Math.max(0, document.lineCount - 1));
      const lineText = document.lineAt(safeLine).text;
      const start = Math.min(entry.start, lineText.length);
      const end = Math.max(start, Math.min(entry.end, lineText.length));
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(safeLine, start, safeLine, end),
        entry.message,
        ISSUE_SEVERITY[entry.severity],
      );

      diagnostic.code = entry.code;
      diagnostic.source = "curvea";
      return diagnostic;
    });

    collection.set(document.uri, diagnostics);
  };

  const refreshAll = () => {
    for (const document of vscode.workspace.textDocuments) refresh(document);
  };

  const scheduleRefreshAll = () => {
    invalidateWorkspaceIndex();
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshAll, 120);
  };

  if (vscode.window.activeTextEditor) {
    refresh(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((event) => refresh(event.document)),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.languageId === "curvea") {
        invalidateWorkspaceIndex();
        refresh(document);
      }
      else if (/\.(json|md)$/.test(document.uri.fsPath)) scheduleRefreshAll();
    }),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("curvea")) scheduleRefreshAll();
    }),
    vscode.workspace.onDidCreateFiles(scheduleRefreshAll),
    vscode.workspace.onDidDeleteFiles(scheduleRefreshAll),
    vscode.workspace.onDidRenameFiles(scheduleRefreshAll),
    { dispose: () => refreshTimer && clearTimeout(refreshTimer) },
  );

  return { collection, refresh, refreshAll };
}

module.exports = {
  registerDiagnostics,
};
