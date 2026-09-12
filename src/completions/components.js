const vscode = require("vscode");

const { CURVEA_SELECTOR } = require("../constants");
const { filterComponentsByPrefix } = require("./componentCandidates");
const { buildComponentSnippet } = require("./componentSnippets");
const { getCompletionContextAt, parseImportDirective, stripCommentsPreserveLines } = require("../parsing");
const { resolveImportedComponentNames, scanWorkspace } = require("../workspace");

function registerComponentCompletionProvider(context) {
  const provider = vscode.languages.registerCompletionItemProvider(
    CURVEA_SELECTOR,
    {
      provideCompletionItems(document, position) {
        const source = document.getText();
        const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
        const completionContext = getCompletionContextAt(source, document.offsetAt(position));

        if (completionContext.inCodeBlock || completionContext.inDirectiveLine || completionContext.inInterpolation) {
          return undefined;
        }

        if (/@[A-Za-z]*$/.test(linePrefix)) {
          return undefined;
        }

        const workspaceIndex = scanWorkspace();
        const components = workspaceIndex.components;

        if (!components.length) {
          return undefined;
        }

        const propMatch = linePrefix.match(/<([A-Z][A-Za-z0-9]*)\s+([^>]*)?$/);
        if (propMatch) {
          return providePropCompletions(propMatch, components);
        }

        const tagMatch = linePrefix.match(/(<)?([A-Z][A-Za-z0-9]*)?$/);
        if (!tagMatch) {
          return undefined;
        }

        const hasLeadingAngle = Boolean(tagMatch[1]);
        const typedName = tagMatch[2] || "";
        if (hasLeadingAngle && /<[a-z][A-Za-z0-9]*$/.test(linePrefix)) {
          return undefined;
        }

        if (!hasLeadingAngle && !/\b[A-Z][A-Za-z0-9]*$/.test(linePrefix)) {
          return undefined;
        }

        const replaceRange = new vscode.Range(
          position.line,
          position.character - typedName.length,
          position.line,
          position.character,
        );
        const importedComponentNames = collectImportedComponentNames(source, workspaceIndex);

        return filterComponentsByPrefix(components, typedName).map((component) => {
          const item = new vscode.CompletionItem(component.name, vscode.CompletionItemKind.Class);
          item.detail = component.builtIn
            ? `Built-in Curvea component`
            : `Curvea component (${component.importPath})`;
          const isImported = importedComponentNames.has(component.name) || component.builtIn;
          item.documentation = new vscode.MarkdownString(
            component.builtIn
              ? "Insert the built-in Icon component."
              : `${isImported ? "Imported" : "Available"} from \`${component.importPath}\``,
          );
          item.insertText = new vscode.SnippetString(buildComponentSnippet(component, {
            includeLeadingAngle: !hasLeadingAngle,
          }));
          item.filterText = component.name;
          item.range = replaceRange;
          item.sortText = `${isImported ? "0" : "1"}-${component.name}`;
          const autoImport = vscode.workspace.getConfiguration("curvea", document.uri).get("completions.autoImport", true);
          if (autoImport && !isImported && component.importPath) {
            const importEdit = buildAutoImportEdit(document, component.importPath);
            if (importEdit) item.additionalTextEdits = [importEdit];
          }
          return item;
        });
      },
    },
    "<",
    " ",
  );

  context.subscriptions.push(provider);
}

function buildAutoImportEdit(document, importPath) {
  const lines = document.getText().split(/\r?\n/);
  let insertLine = -1;
  for (let line = 0; line < lines.length; line += 1) {
    if (/^\s*@(page|layout|component|document)\b/.test(lines[line])) insertLine = Math.max(insertLine, line);
    if (/^\s*@import\s+/.test(lines[line])) insertLine = Math.max(insertLine, line);
  }
  if (insertLine < 0) return null;
  return vscode.TextEdit.insert(new vscode.Position(insertLine + 1, 0), `@import ${importPath}\n`);
}

function providePropCompletions(propMatch, components) {
  const component = components.find((entry) => entry.name === propMatch[1]);
  if (!component || !component.props || component.props.length === 0) {
    return undefined;
  }

  const typedProps = propMatch[2] || "";
  const usedProps = new Set(Array.from(typedProps.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*=/g), (match) => match[1]));

  return component.props
    .filter((prop) => !usedProps.has(prop))
    .map((prop) => {
      const item = new vscode.CompletionItem(prop, vscode.CompletionItemKind.Property);
      item.detail = `Prop from ${component.name}`;
      item.insertText = new vscode.SnippetString(`${prop}="$1"`);
      return item;
    });
}

function collectImportedComponentNames(source, workspaceIndex) {
  const importedNames = new Set();
  const sanitizedLines = stripCommentsPreserveLines(source).split(/\r?\n/);

  for (const line of sanitizedLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (!trimmed.startsWith("@import ")) {
      continue;
    }

    const parsedImport = parseImportDirective(trimmed);
    if (!parsedImport.valid) {
      continue;
    }

    for (const componentName of resolveImportedComponentNames(parsedImport.target, workspaceIndex)) {
      importedNames.add(componentName);
    }
  }

  return importedNames;
}

module.exports = {
  registerComponentCompletionProvider,
};
