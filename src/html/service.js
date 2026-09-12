const { getLanguageService } = require("vscode-html-languageservice");
const { TextDocument } = require("vscode-languageserver-textdocument");

const { scanCurveaSource } = require("../parsing");

const htmlLanguageService = getLanguageService();

function createVirtualHtmlDocument(source, uri = "untitled:curvea.csc") {
  const value = String(source || "").replace(/\r/g, "");
  const scan = scanCurveaSource(value);
  const lines = value.split("\n");
  const virtualLines = lines.map((line, index) => {
    const context = scan.contexts[index];
    if (context?.kind?.startsWith("raw-") || /^\s*@/.test(line)) {
      return line.replace(/[^\t]/g, " ");
    }
    return maskInterpolations(line);
  });
  return TextDocument.create(String(uri), "html", 1, virtualLines.join("\n"));
}

function maskInterpolations(line) {
  return String(line).replace(/\{\{[\s\S]*?\}\}/g, (value) => "x".repeat(value.length));
}

module.exports = {
  createVirtualHtmlDocument,
  htmlLanguageService,
  maskInterpolations,
};
