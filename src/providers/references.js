const path = require("path");
const vscode = require("vscode");

const { CURVEA_SELECTOR } = require("../constants");
const { parseImportDirective, parseUseDirective, scanCurveaSource } = require("../parsing");
const { resolveImportedComponents, scanWorkspace } = require("../workspace");

function registerReferenceAndRenameProviders(context) {
  const references = vscode.languages.registerReferenceProvider(CURVEA_SELECTOR, {
    async provideReferences(document, position, options) {
      const symbol = identifySymbol(document, position, scanWorkspace());
      if (!symbol) return undefined;
      if (symbol.kind === "local") return findLocalReferences(document, symbol.name, options.includeDeclaration);
      return findWorkspaceReferences(symbol, options.includeDeclaration);
    },
  });

  const rename = vscode.languages.registerRenameProvider(CURVEA_SELECTOR, {
    prepareRename(document, position) {
      const symbol = identifySymbol(document, position, scanWorkspace());
      if (!symbol) throw new Error("This symbol cannot be renamed by CurveaScript.");
      return { range: symbol.range, placeholder: symbol.name };
    },

    async provideRenameEdits(document, position, newName) {
      const symbol = identifySymbol(document, position, scanWorkspace());
      if (!symbol) return undefined;
      validateRename(symbol, newName);

      const edit = new vscode.WorkspaceEdit();
      if (symbol.kind === "local") {
        for (const reference of findLocalReferences(document, symbol.name, true)) {
          edit.replace(reference.uri, reference.range, newName);
        }
        return edit;
      }

      const documents = await readWorkspaceDocuments();
      for (const entry of documents) {
        for (const reference of findNamedReferencesInText(entry.text, entry.uri, symbol, true)) {
          edit.replace(reference.uri, reference.range, newName);
        }
      }

      if (symbol.definitionPath && path.basename(symbol.definitionPath, ".csc") === symbol.name) {
        const target = path.join(path.dirname(symbol.definitionPath), `${newName}.csc`);
        edit.renameFile(vscode.Uri.file(symbol.definitionPath), vscode.Uri.file(target), { overwrite: false, ignoreIfExists: false });
      }
      return edit;
    },
  });

  context.subscriptions.push(references, rename);
}

function identifySymbol(document, position, workspaceIndex) {
  const range = document.getWordRangeAtPosition(position, /\$?[A-Za-z_][A-Za-z0-9_]*/);
  if (!range) return null;
  const name = document.getText(range);
  const line = document.lineAt(position.line).text;

  if (/^[A-Z][A-Za-z0-9]*$/.test(name)) {
    const isLayout = /^\s*@(?:layout|use)\b/.test(line)
      || workspaceIndex.layouts.some((layout) => layout.name === name && !workspaceIndex.components.some((component) => component.name === name));
    const candidates = isLayout
      ? workspaceIndex.layouts.filter((layout) => layout.name === name || path.posix.basename(layout.importPath || "") === name)
      : workspaceIndex.components.filter((component) => !component.builtIn && (component.name === name || path.posix.basename(component.importPath || "") === name));
    const definition = resolveDefinitionCandidate(document, line, isLayout, name, candidates, workspaceIndex);
    if (candidates.length > 1 && !definition) return null;
    if (definition || /^\s*@(layout|component)\b/.test(line) || /<\/?[A-Z]/.test(line)) {
      return { kind: isLayout ? "layout" : "component", name, range, definitionPath: definition?.fullPath || null, importPath: definition?.importPath || name };
    }
  }

  if (isLocallyDeclared(document.getText(), name)) {
    return { kind: "local", name, range, definitionPath: document.uri.fsPath };
  }
  return null;
}

async function findWorkspaceReferences(symbol, includeDeclaration) {
  const documents = await readWorkspaceDocuments();
  return documents.flatMap((entry) => findNamedReferencesInText(entry.text, entry.uri, symbol, includeDeclaration));
}

function findNamedReferencesInText(text, uri, symbol, includeDeclaration) {
  const lines = text.split(/\r?\n/);
  const scan = scanCurveaSource(text);
  const locations = [];
  const escaped = escapeRegExp(symbol.name);

  for (let line = 0; line < lines.length; line += 1) {
    if (scan.contexts[line]?.kind === "raw-code") continue;
    const value = lines[line];
    const declarationPattern = symbol.kind === "component"
      ? new RegExp(`^\\s*@component\\s+(${escaped})\\b`)
      : new RegExp(`^\\s*@layout\\s+(${escaped})\\b`);
    const declaration = value.match(declarationPattern);
    const isDefinitionFile = !symbol.definitionPath || path.resolve(uri.fsPath) === path.resolve(symbol.definitionPath);
    if (declaration && includeDeclaration && isDefinitionFile) {
      addLocation(locations, uri, line, value.indexOf(symbol.name), symbol.name.length);
    }

    if (symbol.kind === "component") {
      if (documentImportsSymbol(text, symbol)) {
        for (const match of value.matchAll(new RegExp(`<\\/?(${escaped})\\b`, "g"))) {
          addLocation(locations, uri, line, (match.index || 0) + match[0].indexOf(symbol.name), symbol.name.length);
        }
      }
      const imported = value.match(/^\s*@import\s+(\S+)/);
      if (imported && importTargetMatches(imported[1], symbol)) {
        addLocation(locations, uri, line, value.lastIndexOf(symbol.name), symbol.name.length);
      }
    } else {
      const used = value.match(/^\s*@use\s+([A-Za-z0-9_/-]+)/);
      if (used && used[1] === symbol.importPath) {
        addLocation(locations, uri, line, value.indexOf(symbol.name, value.indexOf("@use")), symbol.name.length);
      }
    }
  }
  return dedupeLocations(locations);
}

function resolveDefinitionCandidate(document, line, isLayout, name, candidates, workspaceIndex) {
  const current = candidates.find((candidate) => candidate.fullPath && path.resolve(candidate.fullPath) === path.resolve(document.uri.fsPath));
  if (current) return current;
  if (isLayout) {
    const use = parseUseDirective(line.trim());
    if (use.valid) return candidates.find((candidate) => candidate.importPath === use.target) || null;
  } else {
    for (const sourceLine of document.getText().split(/\r?\n/)) {
      if (!/^\s*@import\s+/.test(sourceLine)) continue;
      const imported = parseImportDirective(sourceLine.trim());
      if (!imported.valid) continue;
      const match = resolveImportedComponents(imported.target, workspaceIndex)
        .find((candidate) => path.posix.basename(candidate.importPath || "") === name);
      if (match) return match;
    }
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function documentImportsSymbol(text, symbol) {
  if (!symbol.definitionPath) return true;
  if (text.includes(`@component ${symbol.name}(`)) return true;
  return text.split(/\r?\n/).some((line) => {
    const match = line.trim().match(/^@import\s+(\S+)/);
    return match && importTargetMatches(match[1], symbol);
  });
}

function importTargetMatches(target, symbol) {
  if (target === symbol.importPath) return true;
  if (target.endsWith("/*")) return path.posix.dirname(symbol.importPath || "") === target.slice(0, -2);
  return false;
}

function findLocalReferences(document, name, includeDeclaration) {
  const lines = document.getText().split(/\r?\n/);
  const scan = scanCurveaSource(document.getText());
  const locations = [];
  const pattern = new RegExp(`(?<![A-Za-z0-9_$])${escapeRegExp(name)}(?![A-Za-z0-9_])`, "g");

  for (let line = 0; line < lines.length; line += 1) {
    if (scan.contexts[line]?.kind === "raw-code") continue;
    for (const match of lines[line].matchAll(pattern)) {
      const isDeclaration = isLocalDeclarationOccurrence(lines[line], name, match.index || 0);
      if (!includeDeclaration && isDeclaration) continue;
      addLocation(locations, document.uri, line, match.index || 0, name.length);
    }
  }
  return dedupeLocations(locations);
}

async function readWorkspaceDocuments() {
  const uris = await vscode.workspace.findFiles("**/*.csc", "**/{node_modules,dist,.git,.curvea}/**");
  const open = new Map(vscode.workspace.textDocuments.filter((document) => document.languageId === "curvea").map((document) => [document.uri.toString(), document]));
  return Promise.all(uris.map(async (uri) => {
    const document = open.get(uri.toString());
    if (document) return { uri, text: document.getText() };
    const bytes = await vscode.workspace.fs.readFile(uri);
    return { uri, text: Buffer.from(bytes).toString("utf8") };
  }));
}

function isLocallyDeclared(source, name) {
  const escaped = escapeRegExp(name);
  return new RegExp(`^\\s*@(component|layout)\\s+[A-Z][A-Za-z0-9]*\\([^)]*\\b${escaped}\\b`, "m").test(source)
    || new RegExp(`^\\s*@for\\s+${escaped}\\s+in\\s+`, "m").test(source)
    || new RegExp(`^\\s*${escaped}\\s*=`, "m").test(source);
}

function isLocalDeclarationOccurrence(line, name, index) {
  const before = line.slice(0, index);
  return /^\s*@(component|layout)\s+/.test(line) && before.includes("(")
    || new RegExp(`^\\s*@for\\s+${escapeRegExp(name)}\\b`).test(line)
    || new RegExp(`^\\s*${escapeRegExp(name)}\\s*=`).test(line);
}

function validateRename(symbol, newName) {
  if (["component", "layout"].includes(symbol.kind) && !/^[A-Z][A-Za-z0-9]*$/.test(newName)) {
    throw new Error("Curvea component and layout names must use PascalCase letters and numbers.");
  }
  if (symbol.kind === "local" && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(newName)) {
    throw new Error("Curvea variable names must be valid identifiers.");
  }
}

function addLocation(output, uri, line, start, length) {
  if (start < 0) return;
  output.push(new vscode.Location(uri, new vscode.Range(line, start, line, start + length)));
}

function dedupeLocations(locations) {
  const seen = new Set();
  return locations.filter((location) => {
    const key = `${location.uri}:${location.range.start.line}:${location.range.start.character}:${location.range.end.character}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  registerReferenceAndRenameProviders,
};
