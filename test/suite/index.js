const fs = require("fs");
const path = require("path");

const Mocha = require("mocha");

function findTestFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return findTestFiles(entryPath);
    }

    return entry.isFile() && entry.name.endsWith(".test.js") ? [entryPath] : [];
  });
}

async function run() {
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
  });

  for (const file of findTestFiles(__dirname)) {
    mocha.addFile(file);
  }

  await new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} integration test${failures === 1 ? "" : "s"} failed.`));
          return;
        }

        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { run };
