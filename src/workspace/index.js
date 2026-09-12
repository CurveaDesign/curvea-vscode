const vscode = require("vscode");

const { scanWorkspaceRoots } = require("./scan");

let cachedIndex = null;
let cachedRootsKey = "";
let cachedAt = 0;

function getWorkspaceRoots() {
  return (vscode.workspace.workspaceFolders || []).map((folder) => folder.uri.fsPath);
}

function scanWorkspace() {
  const roots = getWorkspaceRoots();
  const key = roots.join("\u0000");
  const now = Date.now();
  if (cachedIndex && cachedRootsKey === key && now - cachedAt < 500) return cachedIndex;
  cachedIndex = scanWorkspaceRoots(roots);
  cachedRootsKey = key;
  cachedAt = now;
  return cachedIndex;
}

function invalidateWorkspaceIndex() {
  cachedIndex = null;
  cachedAt = 0;
}

module.exports = {
  getWorkspaceRoots,
  invalidateWorkspaceIndex,
  scanWorkspace,
  ...require("./scan"),
};
