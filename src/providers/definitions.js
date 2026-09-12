const path = require("path");
const vscode = require("vscode");

const { CURVEA_SELECTOR } = require("../constants");
const { parseImportDirective, parseLoadDirective, parseUseDirective } = require("../parsing");
const {
  findDataSource,
  findLayoutByTarget,
  resolveImportedComponents,
  scanWorkspace,
} = require("../workspace");

function registerDefinitionProvider(context) {
  const provider = vscode.languages.registerDefinitionProvider(CURVEA_SELECTOR, {
    provideDefinition(document, position) {
      const lineText = document.lineAt(position.line).text;
      const trimmed = lineText.trim();
      const workspaceIndex = scanWorkspace();

      if (/^@use\s+/.test(trimmed)) {
        const use = parseUseDirective(trimmed);
        const layout = use.valid ? findLayoutByTarget(use.target, workspaceIndex) : null;
        return layout ? location(layout.fullPath, layout.declarationLine) : undefined;
      }

      if (/^@import\s+/.test(trimmed)) {
        const imported = parseImportDirective(trimmed);
        const components = imported.valid ? resolveImportedComponents(imported.target, workspaceIndex) : [];
        const locations = components.filter((component) => component.fullPath).map((component) => location(component.fullPath, component.declarationLine));
        return locations.length ? locations : undefined;
      }

      if (/^@load\s+/.test(trimmed)) {
        const load = parseLoadDirective(trimmed);
        const dataSource = load.valid ? findDataSource(load.source, workspaceIndex) : null;
        return dataSource?.fullPath ? location(dataSource.fullPath, 0) : undefined;
      }

      const wordRange = document.getWordRangeAtPosition(position, /\$?[A-Za-z_][A-Za-z0-9_.]*/);
      if (!wordRange) return undefined;
      const symbol = document.getText(wordRange);

      if (/^[A-Z][A-Za-z0-9]*$/.test(symbol)) {
        const component = resolveComponentUsedByDocument(document.getText(), symbol, workspaceIndex);
        return component?.fullPath ? location(component.fullPath, component.declarationLine) : undefined;
      }

      const loadDefinition = resolveLoadedExpression(document.getText(), symbol, workspaceIndex);
      if (loadDefinition?.fullPath) return location(loadDefinition.fullPath, 0);

      if (symbol.startsWith("page.")) {
        const currentPage = workspaceIndex.pages.find((page) => path.resolve(page.fullPath) === path.resolve(document.uri.fsPath));
        if (currentPage?.dataPaths?.length === 1) return location(currentPage.dataPaths[0], 0);
        if (currentPage?.dataPaths?.length > 1) return currentPage.dataPaths.map((filePath) => location(filePath, 0));
      }

      return findLocalDeclaration(document, symbol, position.line);
    },
  });
  context.subscriptions.push(provider);
}

function resolveComponentUsedByDocument(source, componentName, workspaceIndex) {
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!/^@import\s+/.test(trimmed)) continue;
    const imported = parseImportDirective(trimmed);
    if (!imported.valid) continue;
    const component = resolveImportedComponents(imported.target, workspaceIndex)
      .find((entry) => path.posix.basename(entry.importPath || entry.name) === componentName);
    if (component) return component;
  }
  return (workspaceIndex.components || []).find((component) => component.builtIn && component.name === componentName) || null;
}

function resolveLoadedExpression(source, symbol, workspaceIndex) {
  const root = symbol.split(".")[0];
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!/^@load\s+/.test(trimmed)) continue;
    const load = parseLoadDirective(trimmed);
    if (!load.valid) continue;
    const dataSource = findDataSource(load.source, workspaceIndex);
    if (load.source.endsWith("/*") && !load.alias && dataSource?.keys?.includes(root)) return dataSource;
    if ((load.alias || path.posix.basename(load.source)) === root) return dataSource;
  }
  return null;
}

function findLocalDeclaration(document, symbol, beforeLine) {
  const root = symbol.split(".")[0];
  const lines = document.getText().split(/\r?\n/);
  for (let line = Math.min(beforeLine, lines.length - 1); line >= 0; line -= 1) {
    const text = lines[line];
    let match = text.match(/^\s*@(component|layout)\s+[A-Z][A-Za-z0-9]*\(([^)]*)\)/);
    if (match && match[2].split(",").map((value) => value.trim()).includes(root)) {
      return new vscode.Location(document.uri, new vscode.Position(line, text.indexOf(root)));
    }
    match = text.match(/^\s*@for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+/);
    if (match?.[1] === root) return new vscode.Location(document.uri, new vscode.Position(line, text.indexOf(root)));
    match = text.match(/^\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*=/);
    if (match?.[1] === root) return new vscode.Location(document.uri, new vscode.Position(line, text.indexOf(root)));
  }
  return undefined;
}

function location(fullPath, line = 0) {
  return new vscode.Location(vscode.Uri.file(fullPath), new vscode.Position(Math.max(0, line || 0), 0));
}

module.exports = {
  registerDefinitionProvider,
  resolveComponentUsedByDocument,
  resolveLoadedExpression,
};
