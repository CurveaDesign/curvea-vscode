const vscode = require("vscode");

const { CURVEA_SELECTOR } = require("../constants");
const { formatCurveaDocument } = require("../format/format");

function registerFormatter(context) {
  const provider = vscode.languages.registerDocumentFormattingEditProvider(CURVEA_SELECTOR, {
    provideDocumentFormattingEdits(document, options) {
      const formatted = formatCurveaDocument(document.getText(), {
        indentSize: options.tabSize,
        insertSpaces: options.insertSpaces,
      });
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length),
      );

      return [vscode.TextEdit.replace(fullRange, formatted)];
    },
  });

  context.subscriptions.push(provider);
}

module.exports = {
  registerFormatter,
};
