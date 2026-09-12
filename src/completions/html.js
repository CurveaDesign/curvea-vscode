const vscode = require("vscode");

const { CURVEA_HTML_ATTRIBUTES, CURVEA_SELECTOR } = require("../constants");
const { createVirtualHtmlDocument, htmlLanguageService } = require("../html/service");
const { getCompletionContextAt } = require("../parsing");

function registerHtmlCompletionProvider(context) {
  const provider = vscode.languages.registerCompletionItemProvider(
    CURVEA_SELECTOR,
    {
      provideCompletionItems(document, position) {
        const source = document.getText();
        const completionContext = getCompletionContextAt(source, document.offsetAt(position));
        if (completionContext.inRawBlock || completionContext.inInterpolation) return undefined;

        const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
        if (/@[A-Za-z]*$/.test(linePrefix)) return undefined;
        if (/<[A-Z][A-Za-z0-9]*(?:\s[^>]*)?$/.test(linePrefix)) return undefined;

        const virtualDocument = createVirtualHtmlDocument(source, document.uri.toString());
        const htmlDocument = htmlLanguageService.parseHTMLDocument(virtualDocument);
        const completionList = htmlLanguageService.doComplete(
          virtualDocument,
          { line: position.line, character: position.character },
          htmlDocument,
        );

        const items = completionList.items.map(toVsCodeCompletion);
        return mergeCurveaAttributes(items, linePrefix, position);
      },
    },
    "<", " ", "=", "\"", "'", ":", "-",
  );

  context.subscriptions.push(provider);
}

function mergeCurveaAttributes(items, linePrefix, position) {
  const attributeMatch = linePrefix.match(/<[A-Za-z][^>]*\s(data-csc-[A-Za-z-]*)$/);
  if (!attributeMatch) return items;

  const typed = attributeMatch[1] || "";
  const range = new vscode.Range(
    position.line,
    position.character - typed.length,
    position.line,
    position.character,
  );
  const customItems = CURVEA_HTML_ATTRIBUTES
    .filter((attribute) => attribute.name.startsWith(typed))
    .map((attribute) => {
      const item = new vscode.CompletionItem(attribute.name, vscode.CompletionItemKind.Property);
      item.detail = attribute.detail;
      item.insertText = attribute.boolean
        ? attribute.name
        : new vscode.SnippetString(attribute.name + "=\"$1\"");
      item.range = range;
      item.sortText = "0-" + attribute.name;
      return item;
    });

  const customNames = new Set(customItems.map((item) => item.label));
  return [...customItems, ...items.filter((item) => !customNames.has(item.label))];
}

function toVsCodeCompletion(entry) {
  const item = new vscode.CompletionItem(entry.label, mapCompletionKind(entry.kind));
  item.detail = entry.detail;
  item.documentation = toVsCodeDocumentation(entry.documentation);
  item.sortText = entry.sortText;
  item.filterText = entry.filterText;
  item.preselect = entry.preselect;

  if (entry.textEdit && entry.textEdit.range) {
    item.range = toVsCodeRange(entry.textEdit.range);
    item.insertText = entry.insertTextFormat === 2
      ? new vscode.SnippetString(entry.textEdit.newText)
      : entry.textEdit.newText;
  } else if (entry.insertText) {
    item.insertText = entry.insertTextFormat === 2
      ? new vscode.SnippetString(entry.insertText)
      : entry.insertText;
  }

  return item;
}

function toVsCodeRange(range) {
  return new vscode.Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
  );
}

function toVsCodeDocumentation(documentation) {
  if (!documentation || typeof documentation === "string") return documentation;
  if (typeof documentation.value === "string") {
    return new vscode.MarkdownString(documentation.value);
  }
  return undefined;
}

function mapCompletionKind(kind) {
  return Number.isInteger(kind) && kind > 0
    ? kind - 1
    : vscode.CompletionItemKind.Text;
}

module.exports = {
  registerHtmlCompletionProvider,
  mergeCurveaAttributes,
  toVsCodeCompletion,
};
