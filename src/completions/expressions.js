const vscode = require("vscode");

const { CURVEA_SELECTOR } = require("../constants");
const { buildScopeSymbols } = require("../intelligence");
const { getCompletionContextAt } = require("../parsing");
const { scanWorkspace } = require("../workspace");

function registerExpressionCompletionProvider(context) {
  const provider = vscode.languages.registerCompletionItemProvider(
    CURVEA_SELECTOR,
    {
      provideCompletionItems(document, position) {
        const source = document.getText();
        const offset = document.offsetAt(position);
        const completionContext = getCompletionContextAt(source, offset);
        const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
        const isExpressionDirective = /^\s*@(if|elseif|code)\s+[^\n]*$/.test(linePrefix)
          || /^\s*@for\s+[A-Za-z_][A-Za-z0-9_]*\s+in\s+[^\n]*$/.test(linePrefix);

        if (!completionContext.inInterpolation && !isExpressionDirective) return undefined;
        if (completionContext.inRawBlock) return undefined;

        const wordMatch = linePrefix.match(/([A-Za-z_$][A-Za-z0-9_$.]*)$/);
        const typed = wordMatch ? wordMatch[1] : "";
        const range = new vscode.Range(
          position.line,
          position.character - typed.length,
          position.line,
          position.character,
        );
        const workspaceIndex = scanWorkspace();
        const symbols = buildScopeSymbols(source, workspaceIndex, position.line);
        const inInterpolation = completionContext.inInterpolation;

        return symbols
          .filter((symbol) => !(inInterpolation && symbol.name === "$index"))
          .filter((symbol) => !typed || symbol.name.toLowerCase().startsWith(typed.toLowerCase()))
          .map((symbol) => {
            const item = new vscode.CompletionItem(symbol.name, completionKind(symbol.type));
            item.detail = symbol.detail;
            item.insertText = symbol.name;
            item.range = range;
            return item;
          });
      },
    },
    "{",
    ".",
    " ",
  );
  context.subscriptions.push(provider);
}

function completionKind(type) {
  if (type === "parameter") return vscode.CompletionItemKind.TypeParameter;
  if (type === "constant" || type === "number") return vscode.CompletionItemKind.Constant;
  if (type === "array") return vscode.CompletionItemKind.Value;
  if (type === "property") return vscode.CompletionItemKind.Property;
  return vscode.CompletionItemKind.Variable;
}

module.exports = {
  registerExpressionCompletionProvider,
};
