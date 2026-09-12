const assert = require("assert");
const path = require("path");

const vscode = require("vscode");

suite("CurveaScript extension", () => {
  let document;
  let workspaceFolder;

  suiteSetup(async () => {
    const file = vscode.Uri.file(path.resolve(
      __dirname,
      "..",
      "..",
      "fixtures",
      "workspace",
      "src",
      "pages",
      "Integration.csc",
    ));
    document = await vscode.workspace.openTextDocument(file);
    workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    assert(workspaceFolder, "integration fixture should be opened as a workspace folder");
    await vscode.window.showTextDocument(document);
    const extension = vscode.extensions.getExtension("curvea.curvea-language");
    assert(extension, "CurveaScript extension should be discoverable");
    await extension.activate();
  });

  test("registers HTML tag and attribute completions", async () => {
    const tagDocument = await vscode.workspace.openTextDocument({
      language: "curvea",
      content: "@page\n<",
    });
    const tags = await vscode.commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      tagDocument.uri,
      new vscode.Position(1, 1),
      "<",
    );
    assert(tags.items.some((item) => item.label === "section"), "missing native HTML tag completion");

    const attributes = await vscode.commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      document.uri,
      new vscode.Position(3, 9),
      " ",
    );
    assert(attributes.items.some((item) => item.label === "href"), "missing href completion");
    assert(attributes.items.some((item) => item.label === "aria-label"), "missing ARIA completion");
  });

  test("registers Curvea directives and context-aware components", async () => {
    const directiveDocument = await vscode.workspace.openTextDocument({
      language: "curvea",
      content: "@page\n@",
    });
    const directives = await vscode.commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      directiveDocument.uri,
      new vscode.Position(1, 1),
      "@",
    );
    assert(directives.items.some((item) => item.label === "@if"), "missing Curvea directive completion");

    const componentUri = vscode.Uri.joinPath(workspaceFolder.uri, ".curvea-integration-completion.csc");
    await vscode.workspace.fs.writeFile(componentUri, Buffer.from("@page\n\n<Pa", "utf8"));
    try {
      const componentDocument = await vscode.workspace.openTextDocument(componentUri);
      const components = await vscode.commands.executeCommand(
        "vscode.executeCompletionItemProvider",
        componentDocument.uri,
        new vscode.Position(2, 3),
      );
      const panel = components.items.find((item) => item.label === "Panel");
      assert(panel, "missing workspace component completion");
      assert(String(panel.insertText.value || panel.insertText).includes("</Panel>"), "slot component should use paired tags");
      assert(panel.additionalTextEdits?.some((edit) => edit.newText.includes("@import Panel")), "component completion should auto-import");
    } finally {
      await vscode.workspace.fs.delete(componentUri);
    }
  });

  test("formats mixed CurveaScript and HTML through the registered provider", async () => {
    const edits = await vscode.commands.executeCommand(
      "vscode.executeFormatDocumentProvider",
      document.uri,
      { tabSize: 2, insertSpaces: true },
    );
    assert(edits.length > 0, "formatter provider returned no edit");
    const formatted = applyTextEdits(document, edits);
    assert(formatted.length > 0, "formatter produced an empty document");
    assert(formatted.includes("<main><a>Link</a>\n  @if page.visible"), "inline HTML and Curvea flow boundary was not formatted");
    assert(formatted.includes("  @if page.visible\n    <section>"), "Curvea flow indentation was not preserved");
    assert(formatted.includes("      <h2>{{ page.title }}</h2>\n      <p>Body</p>"), "nested HTML structure or expressions were not preserved");
  });

  test("publishes Curvea diagnostics", async () => {
    const invalid = await vscode.workspace.openTextDocument({
      language: "curvea",
      content: "@page\n@paginate items by 0",
    });
    await vscode.window.showTextDocument(invalid);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const diagnostics = vscode.languages.getDiagnostics(invalid.uri);
    assert(diagnostics.some((entry) => entry.code === "curvea.invalidPagination"), "expected pagination diagnostic");
  });
});

function applyTextEdits(document, edits) {
  let source = document.getText();
  const replacements = edits.map((edit) => ({
    start: document.offsetAt(edit.range.start),
    end: document.offsetAt(edit.range.end),
    newText: edit.newText,
  })).sort((left, right) => right.start - left.start);

  for (const replacement of replacements) {
    source = source.slice(0, replacement.start) + replacement.newText + source.slice(replacement.end);
  }

  return source;
}
