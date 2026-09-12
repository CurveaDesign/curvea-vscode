const vscode = require("vscode");

const { CURVEA_SELECTOR } = require("../constants");
const { scanCurveaSource } = require("../parsing");

function registerFoldingProvider(context) {
  const provider = vscode.languages.registerFoldingRangeProvider(CURVEA_SELECTOR, {
    provideFoldingRanges(document) {
      const scan = scanCurveaSource(document.getText());
      return scan.blocks
        .filter((block) => block.endLine > block.startLine)
        .map((block) => new vscode.FoldingRange(
          block.startLine,
          Math.max(block.startLine, block.endLine - 1),
          block.directive === "code" ? vscode.FoldingRangeKind.Region : undefined,
        ));
    },
  });
  context.subscriptions.push(provider);
}

module.exports = {
  registerFoldingProvider,
};
