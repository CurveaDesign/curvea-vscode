const fs = require("fs");
const path = require("path");

const { analyzeCurveaSource } = require("../src/diagnostics/analyze");
const { scanWorkspaceRoots } = require("../src/workspace/scan");

const repoRoot = path.resolve(__dirname, "..");
const workspaceIndex = scanWorkspaceRoots([path.join(repoRoot, "fixtures", "workspace")]);

const validDir = path.join(repoRoot, "fixtures", "valid");
const invalidDir = path.join(repoRoot, "fixtures", "invalid");

const failures = [];

for (const fileName of readFixtureFiles(validDir)) {
  const fullPath = path.join(validDir, fileName);
  const issues = analyzeCurveaSource(fs.readFileSync(fullPath, "utf8"), workspaceIndex);
  if (issues.length > 0) {
    failures.push(`${fileName} was expected to be valid but returned issues: ${formatIssues(issues)}`);
  }
}

for (const fileName of readFixtureFiles(invalidDir)) {
  const fullPath = path.join(invalidDir, fileName);
  const issues = analyzeCurveaSource(fs.readFileSync(fullPath, "utf8"), workspaceIndex);
  if (issues.length === 0) {
    failures.push(`${fileName} was expected to be invalid but returned no issues.`);
  }
}

assertTargetedBehavior();

if (failures.length > 0) {
  console.error("Fixture validation failed.\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Validated ${readFixtureFiles(validDir).length} valid fixture(s) and ${readFixtureFiles(invalidDir).length} invalid fixture(s).`);

function readFixtureFiles(directory) {
  return fs.readdirSync(directory).filter((fileName) => fileName.endsWith(".csc")).sort();
}

function formatIssues(issues) {
  return issues.map((issue) => `${issue.code}@${issue.line + 1}`).join(", ");
}

function assertTargetedBehavior() {
  const validCodeFixture = path.join(validDir, "code-block-literal.csc");
  const validIssues = analyzeCurveaSource(fs.readFileSync(validCodeFixture, "utf8"), workspaceIndex);
  assertNoIssueCodes(validIssues, [
    "curvea.misplacedDeclaration",
    "curvea.invalidDirectivePlacement",
    "curvea.unsupportedFileRoleUsage",
    "curvea.unresolvedImport",
    "curvea.missingImport",
    "curvea.unusedImport",
  ], "code-block-literal.csc should treat @code content as raw literal text");

  const bodyCodeFixture = path.join(validDir, "body-code.csc");
  const bodyCodeIssues = analyzeCurveaSource(fs.readFileSync(bodyCodeFixture, "utf8"), workspaceIndex);
  assertNoIssueCodes(bodyCodeIssues, [
    "curvea.invalidDirectivePlacement",
  ], "body-code.csc should allow @code blocks in normal body content without placement warnings");

  const unclosedCodeFixture = path.join(invalidDir, "unclosed-code.csc");
  const unclosedIssues = analyzeCurveaSource(fs.readFileSync(unclosedCodeFixture, "utf8"), workspaceIndex);
  assertHasIssue(
    unclosedIssues,
    (issue) => issue.code === "curvea.invalidBlockStructure" && issue.message.includes("@endcode"),
    "unclosed-code.csc should report an @code block that is missing @endcode",
  );
  assertNoIssueCodes(unclosedIssues, [
    "curvea.misplacedDeclaration",
    "curvea.invalidDirectivePlacement",
    "curvea.unsupportedFileRoleUsage",
    "curvea.unresolvedImport",
    "curvea.missingImport",
    "curvea.unusedImport",
  ], "unclosed-code.csc should not emit false diagnostics from raw @code contents");
}

function assertNoIssueCodes(issues, issueCodes, description) {
  const unexpected = issues.filter((issue) => issueCodes.includes(issue.code));
  if (unexpected.length > 0) {
    failures.push(`${description}: ${formatIssues(unexpected)}`);
  }
}

function assertHasIssue(issues, matcher, description) {
  if (!issues.some((issue) => matcher(issue))) {
    failures.push(`${description}. Returned issues: ${formatIssues(issues)}`);
  }
}
