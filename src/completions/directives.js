const vscode = require("vscode");

const { CURVEA_SELECTOR, SEO_KEYS } = require("../constants");
const { analyzeDocumentStructure, getCompletionContextAt, parseUseDirective } = require("../parsing");
const { findLayoutByTarget, scanWorkspace } = require("../workspace");

const FILE_ROLE_DIRECTIVES = [
  { label: "@page", detail: "Declare a page", insertText: "@page\n$0" },
  { label: "@layout", detail: "Declare a layout", insertText: "@layout ${1:Main}(${2:title})\n$0" },
  { label: "@component", detail: "Declare a component", insertText: "@component ${1:Hero}(${2:title})\n$0" },
  { label: "@document", detail: "Declare the document shell", insertText: "@document\n$0" },
];

const TOP_LEVEL_DIRECTIVES = [
  { label: "@use", detail: "Use a page layout", insertText: "@use ${1:Main}(${2:title}=${3:page.title})", roles: ["page"] },
  { label: "@import", detail: "Import a component", insertText: "@import ${1:Component}" },
  { label: "@load", detail: "Load JSON data", insertText: "@load ${1:data/source}${2: as ${3:alias}}" },
  { label: "@paginate", detail: "Paginate a loaded array", insertText: "@paginate ${1:items} by ${2:12}", roles: ["page"] },
  { label: "@data", detail: "Define local data", insertText: "@data\n${1:key} = ${2:value}\n@end" },
  { label: "@seo", detail: "Define page SEO", insertText: "@seo\ntitle = ${1:page.title}\ndescription = ${2:page.description}\n@end", roles: ["page"] },
  { label: "@style", detail: "Add component-scoped output CSS", insertText: "@style\n$0\n@end" },
  { label: "@script", detail: "Add component-scoped output JavaScript", insertText: "@script\n$0\n@end" },
];

const BODY_DIRECTIVES = [
  { label: "@if", detail: "Conditional block", insertText: "@if ${1:page.visible}\n\t$0\n@end" },
  { label: "@elseif", detail: "Conditional branch", insertText: "@elseif ${1:condition}" },
  { label: "@else", detail: "Conditional fallback", insertText: "@else" },
  { label: "@for", detail: "Loop over an array", insertText: "@for ${1:item} in ${2:items}\n\t$0\n@end" },
  { label: "@code", detail: "Render a literal code block", insertText: "@code\n$0\n@endcode" },
  { label: "@code expression", detail: "Render and escape one value", insertText: "@code ${1:example.code}" },
  { label: "@end", detail: "Close @if or @for", insertText: "@end", keyword: true },
  { label: "@endcode", detail: "Close a literal @code block", insertText: "@endcode", keyword: true },
];

function registerDirectiveCompletionProvider(context) {
  const provider = vscode.languages.registerCompletionItemProvider(
    CURVEA_SELECTOR,
    {
      provideCompletionItems(document, position) {
        const source = document.getText();
        const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
        const completionContext = getCompletionContextAt(source, document.offsetAt(position));
        if (completionContext.inRawBlock && !completionContext.inDirectiveLine) return undefined;

        const importMatch = linePrefix.match(/^(\s*@import\s+)([^\s]*)$/);
        if (importMatch) return provideImportTargetCompletions(importMatch[2], position);

        const loadMatch = linePrefix.match(/^(\s*@load\s+)([^\s]*)$/);
        if (loadMatch) return provideLoadTargetCompletions(loadMatch[2], position);

        const useArgsMatch = linePrefix.match(/^\s*@use\s+([A-Za-z0-9_/-]+)\(([^)]*)$/);
        if (useArgsMatch) return provideUseArgumentCompletions(useArgsMatch[1], useArgsMatch[2]);

        const useMatch = linePrefix.match(/^(\s*@use\s+)([A-Za-z0-9_/-]*)$/);
        if (useMatch) return provideUseTargetCompletions(useMatch[2], position);

        if (/^\s*@seo\s*$/.test(findOpenBlockHeader(source, position.line))) {
          const assignmentMatch = linePrefix.match(/^\s*([A-Za-z_.-]*)$/);
          if (assignmentMatch) return provideSeoKeyCompletions(assignmentMatch[1], position);
        }

        const tokenMatch = linePrefix.match(/(?:^|\s)(@?[A-Za-z]*)$/);
        if (!tokenMatch) return undefined;

        const typedToken = tokenMatch[1] || "";
        const range = new vscode.Range(
          position.line,
          position.character - typedToken.length,
          position.line,
          position.character,
        );
        const structure = analyzeDocumentStructure(source);
        const role = structure.declaration?.role || null;
        let directives;

        if (!structure.declaration) {
          directives = FILE_ROLE_DIRECTIVES;
        } else {
          directives = [...TOP_LEVEL_DIRECTIVES, ...BODY_DIRECTIVES]
            .filter((directive) => !directive.roles || directive.roles.includes(role));
        }

        return directives.map((directive) => buildItem(directive, range, typedToken));
      },
    },
    "@",
    " ",
    "/",
    "(",
    ",",
  );
  context.subscriptions.push(provider);
}

function provideImportTargetCompletions(typedValue, position) {
  const workspaceIndex = scanWorkspace();
  const values = new Map();
  for (const component of workspaceIndex.components) {
    if (!component.importPath || component.builtIn) continue;
    values.set(component.importPath, "Component path");
    if (!component.importPath.includes("/")) values.set(component.name, "Component");
    const folder = component.importPath.includes("/") ? component.importPath.slice(0, component.importPath.lastIndexOf("/")) : "";
    if (folder) values.set(`${folder}/*`, "Import every component in this folder");
  }
  return pathItems(values, typedValue, position, vscode.CompletionItemKind.Reference);
}

function provideLoadTargetCompletions(typedValue, position) {
  const workspaceIndex = scanWorkspace();
  const values = new Map();
  for (const source of workspaceIndex.dataSources) {
    values.set(source.source, source.kind === "wildcard" ? "Load folder as a data map" : source.kind === "folder" ? "Load folder as an array" : "Load JSON dataset");
  }
  return pathItems(values, typedValue, position, vscode.CompletionItemKind.File);
}

function provideUseTargetCompletions(typedValue, position) {
  const workspaceIndex = scanWorkspace();
  const values = new Map(workspaceIndex.layouts.map((layout) => [layout.importPath || layout.name, `Layout (${(layout.params || []).join(", ") || "no props"})`]));
  return pathItems(values, typedValue, position, vscode.CompletionItemKind.Class);
}

function provideUseArgumentCompletions(layoutTarget, rawArgs) {
  const workspaceIndex = scanWorkspace();
  const layout = findLayoutByTarget(layoutTarget, workspaceIndex);
  if (!layout) return undefined;
  const used = new Set(Array.from(rawArgs.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*=/g), (match) => match[1]));
  return (layout.params || []).filter((prop) => !used.has(prop)).map((prop) => {
    const item = new vscode.CompletionItem(`${prop}=`, vscode.CompletionItemKind.Property);
    item.detail = `Prop from ${layout.name}`;
    item.insertText = new vscode.SnippetString(`${prop}=$1`);
    return item;
  });
}

function provideSeoKeyCompletions(typedValue, position) {
  const range = buildReplaceRange(position, typedValue);
  return SEO_KEYS.filter((key) => key.startsWith(typedValue)).map((key) => {
    const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
    item.detail = "SEO property";
    item.insertText = new vscode.SnippetString(`${key} = $1`);
    item.range = range;
    return item;
  });
}

function pathItems(values, typedValue, position, kind) {
  const lowered = typedValue.toLowerCase();
  const range = buildReplaceRange(position, typedValue);
  return Array.from(values.entries())
    .filter(([value]) => !typedValue || value.toLowerCase().startsWith(lowered))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, detail]) => {
      const item = new vscode.CompletionItem(value, kind);
      item.detail = detail;
      item.insertText = value;
      item.range = range;
      return item;
    });
}

function buildItem(directive, range, typedToken) {
  const item = new vscode.CompletionItem(
    directive.label,
    directive.keyword ? vscode.CompletionItemKind.Keyword : vscode.CompletionItemKind.Snippet,
  );
  item.detail = directive.detail;
  item.insertText = directive.keyword ? directive.insertText : new vscode.SnippetString(directive.insertText);
  item.range = range;
  item.filterText = typedToken && !typedToken.startsWith("@") ? `${typedToken} ${directive.label}` : directive.label;
  return item;
}

function buildReplaceRange(position, typedValue) {
  return new vscode.Range(position.line, position.character - typedValue.length, position.line, position.character);
}

function findOpenBlockHeader(source, lineNumber) {
  const lines = source.split(/\r?\n/);
  for (let line = lineNumber; line >= 0; line -= 1) {
    const trimmed = lines[line].trim();
    if (["@seo", "@data", "@style", "@script"].includes(trimmed)) return trimmed;
    if (trimmed === "@end") return "";
  }
  return "";
}

module.exports = {
  registerDirectiveCompletionProvider,
};
