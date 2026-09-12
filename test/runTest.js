const path = require("path");

const { runTests } = require("@vscode/test-electron");

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, "..");
  const extensionTestsPath = path.resolve(__dirname, "suite", "index");
  const workspacePath = path.resolve(__dirname, "..", "fixtures", "workspace");

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      workspacePath,
      "--disable-extensions",
      "--no-sandbox",
      "--disable-gpu",
      "--ozone-platform=headless",
    ],
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
