const fs = require("fs");
const path = require("path");

const grammarPath = path.join(__dirname, "..", "syntaxes", "curvea.tmLanguage.json");
const grammar = JSON.parse(fs.readFileSync(grammarPath, "utf8"));

const failures = [];

assertTopLevelOrdering(grammar);
assertHtmlFallbackReachable(grammar);
assertComponentTagScopes(grammar);
assertComponentTagPatterns(grammar);

if (failures.length > 0) {
  console.error("Grammar validation failed.\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Validated Curvea component scopes, flow expressions, and lowercase HTML fallback routing.");

function assertTopLevelOrdering(currentGrammar) {
  const includes = currentGrammar.patterns.map((pattern) => pattern.include);
  const componentIndex = includes.indexOf("#componentTags");
  const htmlIndex = includes.indexOf("text.html.basic");

  if (componentIndex === -1) {
    failures.push("Top-level grammar no longer includes #componentTags.");
  }

  if (htmlIndex === -1) {
    failures.push("Top-level grammar no longer includes text.html.basic.");
  }

  if (componentIndex !== -1 && htmlIndex !== -1 && componentIndex > htmlIndex) {
    failures.push("#componentTags must run before text.html.basic so PascalCase tags keep Curvea scopes.");
  }
}

function assertHtmlFallbackReachable(currentGrammar) {
  const htmlIndex = currentGrammar.patterns.findIndex((pattern) => pattern.include === "text.html.basic");
  const samples = [
    '<section class="hero">',
    '<a href="/docs" aria-label="Documentation">',
    "</section>",
  ];

  for (const sample of samples) {
    for (const pattern of currentGrammar.patterns.slice(0, htmlIndex)) {
      if (!pattern.include?.startsWith("#")) continue;
      const repositoryName = pattern.include.slice(1);
      const localPatterns = currentGrammar.repository?.[repositoryName]?.patterns || [];
      for (const localPattern of localPatterns) {
        const source = localPattern.match || localPattern.begin;
        if (source && new RegExp(source).test(sample)) {
          failures.push(`${JSON.stringify(sample)} is captured by #${repositoryName} before text.html.basic.`);
        }
      }
    }
  }

  const flowPatterns = currentGrammar.repository?.flowDirectives?.patterns || [];
  if (flowPatterns.some((pattern) => pattern.match === "==|!=|>=|<=|>|<")) {
    failures.push("Comparison operators must not be matched globally by #flowDirectives.");
  }

  const expressionPatterns = currentGrammar.repository?.flowExpression?.patterns || [];
  if (!expressionPatterns.some((pattern) => pattern.name === "keyword.operator.comparison.curvea")) {
    failures.push("Flow expressions must retain Curvea comparison-operator scopes.");
  }
}

function assertComponentTagScopes(currentGrammar) {
  const patterns = currentGrammar.repository?.componentTags?.patterns || [];
  const closingTag = patterns[0];
  const openingTag = patterns[1];

  if (closingTag?.captures?.["2"]?.name !== "entity.name.tag.component.curvea") {
    failures.push("Closing component tags must scope the tag name as entity.name.tag.component.curvea.");
  }

  if (openingTag?.beginCaptures?.["2"]?.name !== "entity.name.tag.component.curvea") {
    failures.push("Opening component tags must scope the tag name as entity.name.tag.component.curvea.");
  }
}

function assertComponentTagPatterns(currentGrammar) {
  const patterns = currentGrammar.repository?.componentTags?.patterns || [];
  const closingMatch = new RegExp(patterns[0]?.match || "");
  const openingBegin = new RegExp(patterns[1]?.begin || "");
  const openingEnd = new RegExp(patterns[1]?.end || "");

  assertMatch(closingMatch, "</Button>", "Closing component tag regex should match </Button>.");
  assertMatch(openingBegin, "<Button>", "Opening component tag regex should match <Button>.");
  assertMatch(openingBegin, "<Button />", "Opening component tag regex should match <Button />.");
  assertMatch(openingEnd, ">", "Component tag end regex should match >.");
  assertMatch(openingEnd, "/>", "Component tag end regex should match />.");
  assertNoMatch(openingBegin, "<button>", "Opening component tag regex must not match lowercase HTML tags.");
}

function assertMatch(regex, sample, message) {
  if (!regex.test(sample)) {
    failures.push(message);
  }
}

function assertNoMatch(regex, sample, message) {
  if (regex.test(sample)) {
    failures.push(message);
  }
}
