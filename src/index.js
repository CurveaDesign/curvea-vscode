const vscode = require("vscode");

const { registerComponentCompletionProvider } = require("./completions/components");
const { registerDirectiveCompletionProvider } = require("./completions/directives");
const { registerExpressionCompletionProvider } = require("./completions/expressions");
const { registerHtmlCompletionProvider } = require("./completions/html");
const { registerImportQuickFixProvider } = require("./providers/codeActions");
const { registerCommands } = require("./providers/commands");
const { registerDefinitionProvider } = require("./providers/definitions");
const { registerDiagnostics } = require("./providers/diagnostics");
const { registerFoldingProvider } = require("./providers/folding");
const { registerFormatter } = require("./providers/formatter");
const { registerHoverProvider } = require("./providers/hover");
const { registerReferenceAndRenameProviders } = require("./providers/references");
const { registerSemanticTokensProvider } = require("./providers/semanticTokens");
const { registerSignatureHelpProvider } = require("./providers/signatures");
const { registerSymbolProviders } = require("./providers/symbols");

function activate(context) {
  const diagnosticsController = registerDiagnostics(context);
  registerDirectiveCompletionProvider(context);
  registerExpressionCompletionProvider(context);
  registerHtmlCompletionProvider(context);
  registerComponentCompletionProvider(context);
  registerFormatter(context);
  registerImportQuickFixProvider(context);
  registerDefinitionProvider(context);
  registerHoverProvider(context);
  registerSignatureHelpProvider(context);
  registerReferenceAndRenameProviders(context);
  registerSymbolProviders(context);
  registerFoldingProvider(context);
  registerSemanticTokensProvider(context);
  registerCommands(context, diagnosticsController);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
