const vscode = require("vscode");

const { analyzeCurveaSource } = require("../diagnostics/analyze");
const { scanCurveaSource } = require("../parsing");
const { scanWorkspace } = require("../workspace");

function registerCommands(context, diagnosticsController) {
  const output = vscode.window.createOutputChannel("CurveaScript");

  const showProjectInfo = vscode.commands.registerCommand("curvea.showProjectInfo", () => {
    const index = scanWorkspace();
    vscode.window.showInformationMessage(
      `CurveaScript: ${index.pages.length} page(s), ${index.layouts.length} layout(s), ${index.components.filter((entry) => !entry.builtIn).length} component(s), ${index.dataSources.filter((entry) => entry.kind === "file").length} dataset(s).`,
    );
  });

  const debugPing = vscode.commands.registerCommand("curvea.debugPing", () => {
    return vscode.commands.executeCommand("curvea.showProjectInfo");
  });

  const validateWorkspace = vscode.commands.registerCommand("curvea.validateWorkspace", async () => {
    const index = scanWorkspace();
    const uris = await vscode.workspace.findFiles("**/*.csc", "**/{node_modules,dist,.git,.curvea}/**");
    let issueCount = 0;
    let errorCount = 0;
    output.clear();
    output.appendLine(`CurveaScript workspace validation (${uris.length} file(s))`);
    output.appendLine("");

    for (const uri of uris) {
      const document = await vscode.workspace.openTextDocument(uri);
      const issues = analyzeCurveaSource(document.getText(), index, uri.fsPath);
      issueCount += issues.length;
      errorCount += issues.filter((issue) => issue.severity === "error").length;
      for (const issue of issues) {
        output.appendLine(`${uri.fsPath}:${issue.line + 1} [${issue.severity}] ${issue.message}`);
      }
    }

    diagnosticsController?.refreshAll?.();
    if (issueCount) output.show(true);
    vscode.window.showInformationMessage(
      issueCount
        ? `CurveaScript validation found ${errorCount} error(s) and ${issueCount - errorCount} warning(s).`
        : "CurveaScript validation completed with no issues.",
    );
  });

  const openRelatedData = vscode.commands.registerCommand("curvea.openRelatedData", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "curvea") return;
    const index = scanWorkspace();
    const page = index.pages.find((entry) => entry.fullPath === editor.document.uri.fsPath);
    if (!page?.dataPaths?.length) {
      vscode.window.showInformationMessage("No related page JSON data was found.");
      return;
    }
    let target = page.dataPaths[0];
    if (page.dataPaths.length > 1) {
      const selected = await vscode.window.showQuickPick(
        page.dataPaths.map((fullPath) => ({ label: fullPath.split(/[\\/]/).at(-1), description: fullPath, fullPath })),
        { placeHolder: "Choose related Curvea page data" },
      );
      if (!selected) return;
      target = selected.fullPath;
    }
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(target)));
  });

  const openDocument = vscode.commands.registerCommand("curvea.openDocument", async () => {
    const documentFile = scanWorkspace().documents[0];
    if (!documentFile) {
      vscode.window.showInformationMessage("This workspace does not contain src/Document.csc; the engine default is active.");
      return;
    }
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(documentFile.fullPath)));
  });

  const toggleComment = vscode.commands.registerCommand("curvea.toggleComment", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "curvea") return;
    const scan = scanCurveaSource(editor.document.getText());
    await editor.edit((builder) => {
      for (const selection of editor.selections) {
        const lastLine = selection.end.character === 0 && selection.end.line > selection.start.line
          ? selection.end.line - 1
          : selection.end.line;
        for (let line = selection.start.line; line <= lastLine; line += 1) {
          const lineInfo = editor.document.lineAt(line);
          const next = toggleLineComment(lineInfo.text, scan.contexts[line]?.kind || "body");
          builder.replace(lineInfo.range, next);
        }
      }
    });
  });

  context.subscriptions.push(output, showProjectInfo, debugPing, validateWorkspace, openRelatedData, openDocument, toggleComment);
}

function toggleLineComment(line, contextKind) {
  const indent = line.match(/^\s*/)?.[0] || "";
  const content = line.slice(indent.length);
  if (!content) return line;

  if (contextKind === "raw-data" || contextKind === "raw-seo") {
    return content.startsWith("# ") ? `${indent}${content.slice(2)}` : content === "#" ? indent : `${indent}# ${content}`;
  }
  if (contextKind === "raw-script") {
    return content.startsWith("// ") ? `${indent}${content.slice(3)}` : `${indent}// ${content}`;
  }
  if (contextKind === "raw-style") {
    return content.startsWith("/* ") && content.endsWith(" */")
      ? `${indent}${content.slice(3, -3)}`
      : `${indent}/* ${content} */`;
  }
  return content.startsWith("<!-- ") && content.endsWith(" -->")
    ? `${indent}${content.slice(5, -4)}`
    : `${indent}<!-- ${content} -->`;
}

module.exports = {
  registerCommands,
};
