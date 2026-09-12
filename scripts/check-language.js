const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { analyzeCurveaSource } = require("../src/diagnostics/analyze");
const { formatCurveaDocument } = require("../src/format/format");
const { createVirtualHtmlDocument, htmlLanguageService } = require("../src/html/service");
const { filterComponentsByPrefix } = require("../src/completions/componentCandidates");
const { buildComponentSnippet } = require("../src/completions/componentSnippets");
const {
  parseCondition,
  parseDeclaration,
  parseForHeader,
  parseUseDirective,
} = require("../src/parsing");
const { scanWorkspaceRoots } = require("../src/workspace/scan");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "curvea-extension-parity-"));

try {
  write("src/layouts/Main.csc", "@layout Main(title)\n<main>{{ slot }}</main>\n");
  write("src/components/Hero.csc", "@component Hero(title)\n<h1>{{ title }}</h1>\n");
  write("src/components/marketing/Card.csc", "@component Card(title)\n<article>{{ title }}</article>\n");
  write("src/data/products/items.json", JSON.stringify([{ title: "One", order: 1 }, { title: "Two", order: 2 }]));
  write("src/data/pages/home.json", JSON.stringify({ title: "Home", description: "Page" }));
  write("src/pages/Home.csc", "@page\n<p>{{ page.title }}</p>\n");
  write("src/content/blog/post.md", "---\ntitle: Post\ncustomLabel: Featured\n---\nBody\n");
  write("curvea.config.json", JSON.stringify({ site: { name: "Fixture", theme: { defaultMode: "system" } } }));
  write("package.json", JSON.stringify({ name: "fixture", curvea: { features: { seo: true } } }));

  let workspace = scanWorkspaceRoots([tempRoot]);
  assert.equal(workspace.components.some((entry) => entry.name === "Icon"), false, "Icon must not be built in without lucide");
  assert.equal(workspace.components.length, 2);
  assert.equal(workspace.layouts[0].name, "Main");
  assert.equal(workspace.dataSources.find((entry) => entry.source === "products/items").valueType, "array");
  assert(workspace.pageKeys.includes("customLabel"), "Markdown frontmatter keys should be available to page completions");

  const validPage = `@page
@use Main(title="Hello, world")
@import Hero
@import marketing/*
@load products/items as items
@paginate items by 2
@seo
title = page.title
description = page.description
@end
@for item in pagination.items limit 2 offset 0 sort order desc
  <Hero title="{{ item.title }}" />
  <Card title="{{ item.title }}" />
@end`;
  assert.deepEqual(errors(validPage, workspace), [], "current engine syntax should validate without errors");

  write("package.json", JSON.stringify({ name: "fixture", dependencies: { lucide: "^1.0.0" } }));
  workspace = scanWorkspaceRoots([tempRoot]);
  assert.equal(workspace.components.some((entry) => entry.name === "Icon" && entry.builtIn), true, "Icon should follow the lucide feature");
  assert.deepEqual(errors("@page\n<Icon class=\"icon\" />", workspace).map((issue) => issue.code), ["curvea.invalidDirectiveSyntax"]);

  assert.equal(parseDeclaration("@layout Main").kind, "valid");
  assert.equal(parseDeclaration("@component Hero()").kind, "valid");
  assert.equal(parseDeclaration("@component Hero").kind, "invalid");
  assert.equal(parseDeclaration("@layout Main_Name").kind, "invalid");
  assert.equal(parseUseDirective('@use Main(title="Hello, world")').valid, true);
  assert.equal(parseForHeader("@for item in items limit 3 offset 1 sort order desc").valid, true);
  assert.equal(parseForHeader("@for item of items").valid, false);
  assert.equal(parseCondition("page.count >= 2").valid, true);
  assert.equal(parseCondition("page.visible").valid, true);

  assert(hasCode("<p>before</p>\n@page", workspace, "curvea.misplacedDeclaration"), "pages must begin with @page");
  assert(!hasCode("<p>before</p>\n@layout Main", workspace, "curvea.misplacedDeclaration"), "layouts may be declared after earlier content because the engine allows it");
  assert(!hasCode("@page\n@code example.source", workspace, "curvea.invalidBlockStructure"), "single-line @code is not a block");
  assert(!hasCode("@page\n# rendered body text", workspace, "curvea.invalidDirectiveSyntax"), "# is not a global CurveaScript comment");
  assert(hasCode("@page\n@paginate items by 0", workspace, "curvea.invalidPagination"));
  assert(hasCode("@page\n<p>{{ page.title + 1 }}</p>", workspace, "curvea.invalidExpression"));
  assert(hasCode("@page\n@data\nCurrentYear = fake\n@end", workspace, "curvea.reservedGlobal"));
  assert(hasCode("@page\n@import Card", workspace, "curvea.unresolvedImport"), "a nested component must use its path");
  assert(hasCode("@page\n@import Hero\n<Hero>", workspace, "curvea.invalidBlockStructure"));
  assert(hasCode("@document\n<html><head></head></html>", workspace, "curvea.invalidDocument"));

  const literal = `@page
@code
  @if page.visible
    <Hero />
  @end
@endcode
@code example.source`;
  assert.deepEqual(errors(literal, workspace), [], "literal code contents must not be parsed as CurveaScript");

  const rawCssLine = "  .card { color: red; }";
  const formatted = formatCurveaDocument(`@component Card()\n@style\n${rawCssLine}\n@end\n<div>\n<p>Hi</p>\n</div>\n@code example.source\n`);
  assert(formatted.includes(`@style\n${rawCssLine}\n@end`), "formatter must preserve raw CSS bytes");
  assert(formatted.includes("@code example.source"), "formatter must keep expression @code on one line");
  assert(!formatted.includes("@endcode"), "formatter must not invent @endcode for expression @code");

  const mixedSource = [
    "@page",
    "<main><section>",
    "@if page.visible",
    "<article aria-label=\"{{ page.title }}\"><h2>Title</h2><p>Body</p></article>",
    "@end",
    "</section></main>",
    "@script",
    "  const exact = \"<div>{{ raw }}</div>\";",
    "@end",
  ].join("\n");
  const mixedFormatted = formatCurveaDocument(mixedSource, { indentSize: 2 });
  assert(mixedFormatted.includes("<main>\n  <section>"), "formatter should structurally format nested HTML");
  assert(mixedFormatted.includes("    @if page.visible\n      <article"), "formatter should indent HTML inside Curvea flow blocks");
  assert(mixedFormatted.includes("  const exact = \"<div>{{ raw }}</div>\";"), "formatter must preserve raw script content");
  assert.equal(formatCurveaDocument(mixedFormatted, { indentSize: 2 }), mixedFormatted, "formatter should be idempotent");

  const htmlSource = "@page\n<section><a ></a></section>";
  const virtualHtml = createVirtualHtmlDocument(htmlSource);
  const htmlCompletions = htmlLanguageService.doComplete(
    virtualHtml,
    { line: 1, character: 12 },
    htmlLanguageService.parseHTMLDocument(virtualHtml),
  );
  assert(htmlCompletions.items.some((item) => item.label === "href"), "HTML service should provide element attributes");
  assert(htmlCompletions.items.some((item) => item.label === "aria-label"), "HTML service should provide ARIA attributes");

  assert.equal(
    buildComponentSnippet({ name: "Badge", props: ["label"], acceptsSlot: false }),
    '<Badge label="${1:label}" />$0',
    "leaf component snippets should self-close and include props",
  );
  assert.equal(
    buildComponentSnippet({ name: "Panel", props: ["title"], acceptsSlot: true }),
    '<Panel title="${1:title}">\n\t$0\n</Panel>',
    "slot component snippets should insert an opening and closing pair",
  );
  const typedAngleCompletion = buildComponentSnippet(
    { name: "Panel", props: ["title"], acceptsSlot: true },
    { includeLeadingAngle: false },
  );
  assert.equal(
    `<${typedAngleCompletion}`,
    '<Panel title="${1:title}">\n\t$0\n</Panel>',
    "a component completion after a typed angle should produce exactly one leading angle",
  );
  assert.deepEqual(
    filterComponentsByPrefix(
      [{ name: "Hero" }, { name: "Card" }, { name: "Panel" }],
      "Pa",
    ).map((component) => component.name),
    ["Panel"],
    "component metadata should be filtered before it is mapped to VS Code completion items",
  );
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  for (const command of ["curvea.validateWorkspace", "curvea.openRelatedData", "curvea.openDocument", "curvea.showProjectInfo"]) {
    assert(manifest.contributes.commands.some((entry) => entry.command === command), `missing command ${command}`);
  }

  console.log("Validated engine-aligned parsing, diagnostics, workspace indexing, built-ins, and formatting.");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function errors(source, workspace) {
  return analyzeCurveaSource(source, workspace).filter((issue) => issue.severity === "error");
}

function hasCode(source, workspace, code) {
  return analyzeCurveaSource(source, workspace).some((issue) => issue.code === code);
}

function write(relativePath, contents) {
  const fullPath = path.join(tempRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, contents, "utf8");
}
