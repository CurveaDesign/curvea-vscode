const vscode = require("vscode");

const { CURVEA_SELECTOR } = require("../constants");
const { analyzeDocumentStructure, getDirectiveName, parseImportDirective, parseLoadDirective, parseUseDirective, scanCurveaSource } = require("../parsing");
const { scanWorkspace } = require("../workspace");

function registerSymbolProviders(context) {
  const documentProvider = vscode.languages.registerDocumentSymbolProvider(CURVEA_SELECTOR, {
    provideDocumentSymbols(document) {
      const source = document.getText();
      const structure = analyzeDocumentStructure(source);
      const scan = scanCurveaSource(source);
      const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(source.length));
      const declarationLine = Math.max(0, structure.declarationLine);
      const declarationRange = lineRange(document, declarationLine);
      const rootName = structure.declaration?.name || document.uri.path.split("/").at(-1) || "CurveaScript";
      const root = new vscode.DocumentSymbol(
        rootName,
        structure.declaration?.role || "CurveaScript file",
        roleKind(structure.declaration?.role),
        fullRange,
        declarationRange,
      );

      const blockByStart = new Map(scan.blocks.map((block) => [block.startLine, block]));
      for (let line = 0; line < scan.lines.length; line += 1) {
        const trimmed = scan.lines[line].trim();
        if (scan.contexts[line]?.kind.startsWith("raw-") && !blockByStart.has(line)) continue;
        const directive = getDirectiveName(trimmed);
        if (!directive || ["page", "layout", "component", "document", "end", "endcode", "elseif", "else"].includes(directive)) continue;
        const block = blockByStart.get(line);
        const endLine = block?.endLine >= line ? block.endLine : line;
        const range = new vscode.Range(lineRange(document, line).start, lineRange(document, endLine).end);
        const symbol = directiveSymbol(trimmed, directive, range, lineRange(document, line));
        if (symbol) root.children.push(symbol);
      }
      return [root];
    },
  });

  const workspaceProvider = vscode.languages.registerWorkspaceSymbolProvider({
    provideWorkspaceSymbols(query) {
      const index = scanWorkspace();
      const lowered = String(query || "").toLowerCase();
      const symbols = [];
      for (const component of index.components.filter((entry) => !entry.builtIn)) {
        pushWorkspaceSymbol(symbols, component.name, "component", vscode.SymbolKind.Class, component.fullPath, component.declarationLine, lowered);
      }
      for (const layout of index.layouts) {
        pushWorkspaceSymbol(symbols, layout.name, "layout", vscode.SymbolKind.Interface, layout.fullPath, layout.declarationLine, lowered);
      }
      for (const page of index.pages) {
        pushWorkspaceSymbol(symbols, page.name, "page", vscode.SymbolKind.File, page.fullPath, 0, lowered);
      }
      for (const data of index.dataSources.filter((entry) => entry.kind === "file")) {
        pushWorkspaceSymbol(symbols, data.source, "data", vscode.SymbolKind.Object, data.fullPath, 0, lowered);
      }
      return symbols;
    },
  });

  context.subscriptions.push(documentProvider, workspaceProvider);
}

function directiveSymbol(trimmed, directive, range, selectionRange) {
  if (directive === "import") {
    const parsed = parseImportDirective(trimmed);
    return new vscode.DocumentSymbol(parsed.target || "import", "component import", vscode.SymbolKind.Namespace, range, selectionRange);
  }
  if (directive === "load") {
    const parsed = parseLoadDirective(trimmed);
    return new vscode.DocumentSymbol(parsed.alias || parsed.source || "load", parsed.source || "data load", vscode.SymbolKind.Object, range, selectionRange);
  }
  if (directive === "use") {
    const parsed = parseUseDirective(trimmed);
    return new vscode.DocumentSymbol(parsed.target || "layout", "layout", vscode.SymbolKind.Interface, range, selectionRange);
  }
  const names = {
    paginate: ["pagination", vscode.SymbolKind.Array],
    data: ["data", vscode.SymbolKind.Object],
    seo: ["seo", vscode.SymbolKind.Object],
    style: ["style", vscode.SymbolKind.String],
    script: ["script", vscode.SymbolKind.Function],
    code: ["code", vscode.SymbolKind.String],
    if: [trimmed.replace(/^@if\s+/, "if "), vscode.SymbolKind.Boolean],
    for: [trimmed.replace(/^@for\s+/, "for "), vscode.SymbolKind.Array],
  };
  const entry = names[directive];
  return entry ? new vscode.DocumentSymbol(entry[0], `@${directive}`, entry[1], range, selectionRange) : null;
}

function pushWorkspaceSymbol(output, name, container, kind, fullPath, line, query) {
  if (!fullPath || (query && !name.toLowerCase().includes(query))) return;
  output.push(new vscode.SymbolInformation(
    name,
    kind,
    container,
    new vscode.Location(vscode.Uri.file(fullPath), new vscode.Position(Math.max(0, line || 0), 0)),
  ));
}

function lineRange(document, line) {
  const safe = Math.max(0, Math.min(line, document.lineCount - 1));
  return document.lineAt(safe).range;
}

function roleKind(role) {
  if (role === "component") return vscode.SymbolKind.Class;
  if (role === "layout") return vscode.SymbolKind.Interface;
  if (role === "page" || role === "document") return vscode.SymbolKind.File;
  return vscode.SymbolKind.Namespace;
}

module.exports = {
  registerSymbolProviders,
};
