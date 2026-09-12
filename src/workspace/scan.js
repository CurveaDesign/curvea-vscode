const fs = require("fs");
const path = require("path");

const { BUILT_IN_COMPONENT_DEFINITIONS } = require("../constants");
const {
  analyzeDocumentStructure,
  parseDeclaration,
  parseLoadDirective,
} = require("../parsing");

function scanWorkspaceRoots(workspaceRoots) {
  const index = {
    roots: [],
    components: [],
    layouts: [],
    pages: [],
    dataSources: [],
    documents: [],
    siteKeys: new Set(),
    pageKeys: new Set([
      "route", "slug", "id", "params", "title", "description", "excerpt", "image", "cover",
      "content", "collection", "readingTime", "toc", "previous", "previous.title", "previous.route",
      "previous.slug", "next", "next.title", "next.route", "next.slug",
    ]),
    projectFeatures: { hasLucide: false, hasSeo: false, hasSitemap: false },
  };

  for (const workspaceRoot of workspaceRoots || []) {
    const root = path.resolve(workspaceRoot);
    const srcRoot = path.join(root, "src");
    const features = readProjectFeatures(root);
    index.roots.push({ root, srcRoot, features });
    mergeFeatures(index.projectFeatures, features);

    const componentsRoot = fs.existsSync(path.join(srcRoot, "components"))
      ? path.join(srcRoot, "components")
      : path.join(root, "components");
    const layoutsRoot = fs.existsSync(path.join(srcRoot, "layouts"))
      ? path.join(srcRoot, "layouts")
      : path.join(root, "layouts");
    collectRoleFiles(componentsRoot, root, "component", index.components);
    collectRoleFiles(layoutsRoot, root, "layout", index.layouts);
    collectPageFiles(path.join(srcRoot, "pages"), root, index.pages, index.pageKeys);
    collectDataSources(path.join(srcRoot, "data"), root, index.dataSources);
    collectContentKeys(path.join(srcRoot, "content"), index.pageKeys);
    collectDocument(path.join(srcRoot, "Document.csc"), root, index.documents);
    collectSiteKeys(path.join(root, "curvea.config.json"), index.siteKeys);
  }

  if (index.projectFeatures.hasLucide) {
    index.components.push(...BUILT_IN_COMPONENT_DEFINITIONS.map((entry) => ({ ...entry })));
  }

  index.components.sort(sortByImportPath);
  index.layouts.sort(sortByImportPath);
  index.pages.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  index.dataSources.sort((left, right) => left.source.localeCompare(right.source));
  index.siteKeys = Array.from(index.siteKeys).sort();
  index.pageKeys = Array.from(index.pageKeys).sort();
  return index;
}

function collectRoleFiles(directory, workspaceRoot, expectedRole, output) {
  for (const fullPath of getFilesRecursive(directory, ".csc")) {
    const roleInfo = readRoleInfo(fullPath);
    if (!roleInfo || roleInfo.role !== expectedRole || !roleInfo.name) continue;

    const category = expectedRole === "component" ? "components" : "layouts";
    const relativePath = path.relative(workspaceRoot, fullPath).replace(/\\/g, "/");
    const importPath = normalizeImportPath(relativePath, category);
    output.push({
      name: roleInfo.name,
      props: roleInfo.params,
      params: roleInfo.params,
      acceptsSlot: roleInfo.acceptsSlot,
      declarationLine: roleInfo.line,
      relativePath,
      importPath,
      fullPath,
      builtIn: false,
      nameMatchesFile: roleInfo.name === path.basename(fullPath, ".csc"),
      workspaceRoot,
    });
  }
}

function collectPageFiles(directory, workspaceRoot, output, pageKeys) {
  for (const fullPath of getFilesRecursive(directory, ".csc")) {
    const roleInfo = readRoleInfo(fullPath);
    if (!roleInfo || roleInfo.role !== "page") continue;

    const relativePath = path.relative(workspaceRoot, fullPath).replace(/\\/g, "/");
    const dataPaths = getRelatedPageDataFiles(fullPath, workspaceRoot);
    const page = { name: path.basename(fullPath, ".csc"), relativePath, fullPath, dataPaths, workspaceRoot };
    output.push(page);
    const dynamicParam = page.name.match(/^\[([A-Za-z][A-Za-z0-9_-]*)\]$/)?.[1];
    if (dynamicParam) pageKeys.add(`params.${dynamicParam}`);

    page.dataErrors = [];
    for (const jsonPath of dataPaths) {
      const state = readJsonState(jsonPath);
      if (!state.valid) page.dataErrors.push({ fullPath: jsonPath, message: state.error });
      if (state.value && isPlainObject(state.value)) collectObjectPaths(state.value, "", pageKeys, 3);
    }
  }
}

function collectDocument(fullPath, workspaceRoot, output) {
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return;
  const roleInfo = readRoleInfo(fullPath);
  output.push({
    name: "Document",
    role: roleInfo?.role || null,
    fullPath,
    relativePath: path.relative(workspaceRoot, fullPath).replace(/\\/g, "/"),
    workspaceRoot,
  });
}

function collectDataSources(dataRoot, workspaceRoot, output) {
  if (!fs.existsSync(dataRoot)) return;

  const jsonFiles = getFilesRecursive(dataRoot, ".json");
  const folderMap = new Map();
  for (const fullPath of jsonFiles) {
    const relative = path.relative(dataRoot, fullPath).replace(/\\/g, "/");
    const source = relative.replace(/\.json$/, "");
    const state = readJsonState(fullPath);
    const value = state.value;
    const keys = new Set();
    if (value !== null) collectObjectPaths(value, "", keys, 4);

    output.push({
      kind: "file",
      source,
      alias: path.posix.basename(source),
      fullPath,
      relativePath: path.relative(workspaceRoot, fullPath).replace(/\\/g, "/"),
      keys: Array.from(keys).sort(),
      valueType: Array.isArray(value) ? "array" : isPlainObject(value) ? "object" : typeof value,
      validJson: state.valid,
      jsonError: state.error,
      workspaceRoot,
    });

    const folder = path.posix.dirname(source);
    if (folder !== ".") {
      if (!folderMap.has(folder)) folderMap.set(folder, []);
      folderMap.get(folder).push({ source, fullPath, value });
    }
  }

  for (const [folder, entries] of folderMap.entries()) {
    output.push({
      kind: "folder",
      source: folder,
      alias: path.posix.basename(folder),
      fullPath: path.join(dataRoot, folder),
      entries,
      valueType: "array",
      keys: Array.from(new Set(entries.flatMap((entry) => {
        const keys = new Set(["slug"]);
        if (entry.value !== null) collectObjectPaths(entry.value, "", keys, 3);
        return Array.from(keys);
      }))).sort(),
      workspaceRoot,
    });
    output.push({
      kind: "wildcard",
      source: `${folder}/*`,
      alias: null,
      fullPath: path.join(dataRoot, folder),
      entries,
      valueType: "map",
      keys: entries.map((entry) => path.posix.basename(entry.source)).sort(),
      workspaceRoot,
    });
  }
}

function collectContentKeys(contentRoot, output) {
  for (const fullPath of getFilesRecursive(contentRoot, ".md")) {
    try {
      const source = fs.readFileSync(fullPath, "utf8").replace(/\r/g, "");
      if (!source.startsWith("---\n")) continue;
      const end = source.indexOf("\n---\n", 4);
      if (end === -1) continue;
      for (const line of source.slice(4, end).split("\n")) {
        const key = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:/)?.[1];
        if (key) output.add(key);
      }
    } catch {
      // Content diagnostics remain the engine's responsibility until the file is readable again.
    }
  }
}

function readRoleInfo(fullPath) {
  try {
    const source = fs.readFileSync(fullPath, "utf8");
    const structure = analyzeDocumentStructure(source);
    if (!structure.declaration || structure.declaration.kind !== "valid") return null;
    const declaration = parseDeclaration(structure.scan.lines[structure.declarationLine].trim());
    return {
      role: declaration.role,
      name: declaration.name,
      params: declaration.params,
      acceptsSlot: /\{\{\s*slot\s*\}\}/.test(source),
      line: structure.declarationLine,
    };
  } catch {
    return null;
  }
}

function normalizeImportPath(filePath, category) {
  return String(filePath || "")
    .replace(/\\/g, "/")
    .replace(/\.csc$/, "")
    .replace(new RegExp(`^src/${category}/`), "")
    .replace(new RegExp(`^${category}/`), "");
}

function resolveImportedComponents(importTarget, workspaceIndex) {
  if (!workspaceIndex || !importTarget) return [];
  const normalized = normalizeComponentTarget(importTarget);

  if (normalized.endsWith("/*")) {
    const prefix = normalized.slice(0, -2);
    return workspaceIndex.components.filter((component) =>
      !component.builtIn
      && component.importPath
      && path.posix.dirname(component.importPath) === prefix,
    );
  }

  const exact = workspaceIndex.components.filter((component) =>
    !component.builtIn && component.importPath === normalized,
  );
  if (exact.length > 0) return exact;

  return [];
}

function resolveImportedComponentNames(importTarget, workspaceIndex) {
  return resolveImportedComponents(importTarget, workspaceIndex).map((component) => component.name);
}

function findLayoutByTarget(layoutTarget, workspaceIndex) {
  if (!workspaceIndex || !layoutTarget) return null;
  const normalized = String(layoutTarget).replace(/\\/g, "/");
  return workspaceIndex.layouts.find((layout) => layout.importPath === normalized) || null;
}

function findLayoutByName(layoutName, workspaceIndex) {
  return findLayoutByTarget(layoutName, workspaceIndex);
}

function findComponentByName(componentName, workspaceIndex) {
  if (!workspaceIndex) return null;
  return workspaceIndex.components.find((component) => component.name === componentName) || null;
}

function findComponentByImportTarget(importTarget, componentName, workspaceIndex) {
  return resolveImportedComponents(importTarget, workspaceIndex)
    .find((component) => component.name === componentName) || null;
}

function findDataSource(source, workspaceIndex) {
  if (!workspaceIndex || !source) return null;
  const normalized = String(source).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return workspaceIndex.dataSources.find((entry) => entry.source === normalized) || null;
}

function getDocumentLoadBindings(source, workspaceIndex) {
  const bindings = [];
  for (const line of String(source || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!/^@load\s+/.test(trimmed)) continue;
    const parsed = parseLoadDirective(trimmed);
    if (!parsed.valid) continue;
    const dataSource = findDataSource(parsed.source, workspaceIndex);
    if (parsed.source.endsWith("/*") && !parsed.alias && dataSource) {
      for (const key of dataSource.keys || []) bindings.push({ name: key, dataSource, source: parsed.source });
    } else {
      bindings.push({
        name: parsed.alias || path.posix.basename(parsed.source),
        dataSource,
        source: parsed.source,
      });
    }
  }
  return bindings;
}

function readProjectFeatures(root) {
  const packageJson = readJson(path.join(root, "package.json")) || {};
  const dependencies = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
  const flags = packageJson.curvea?.features || {};
  return {
    hasLucide: Boolean(dependencies.lucide),
    hasSeo: Boolean(flags.seo),
    hasSitemap: Boolean(flags.sitemap),
  };
}

function getRelatedPageDataFiles(pagePath, workspaceRoot) {
  const pagesRoot = path.join(workspaceRoot, "src", "pages");
  const relative = path.relative(pagesRoot, pagePath);
  const parsed = path.parse(relative);
  const dataRoot = path.join(workspaceRoot, "src", "data", "pages", parsed.dir);

  if (/^\[[A-Za-z][A-Za-z0-9_-]*\]$/.test(parsed.name)) {
    return getFilesRecursive(dataRoot, ".json", { recursive: false });
  }

  const kebab = parsed.name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[\s_]+/g, "-").toLowerCase();
  const file = path.join(dataRoot, `${kebab}.json`);
  return fs.existsSync(file) ? [file] : [];
}

function collectSiteKeys(configPath, output) {
  const parsed = readJson(configPath);
  if (parsed?.site && isPlainObject(parsed.site)) collectObjectPaths(parsed.site, "", output, 3);
  ["name", "url", "description", "language", "favicon", "image", "basePath", "theme.defaultMode", "theme.storageKey"]
    .forEach((key) => output.add(key));
}

function collectObjectPaths(value, prefix, output, depth) {
  if (depth < 0 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    if (value[0] !== undefined) collectObjectPaths(value[0], prefix, output, depth - 1);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    output.add(next);
    collectObjectPaths(child, next, output, depth - 1);
  }
}

function getFilesRecursive(directory, extension, options = {}) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory() && options.recursive !== false) {
      if (!["node_modules", "dist", ".git", ".curvea"].includes(entry.name)) {
        files.push(...getFilesRecursive(fullPath, extension, options));
      }
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(fullPath);
    }
  }
  return files;
}

function readJson(fullPath) {
  try {
    if (!fs.existsSync(fullPath)) return null;
    const raw = fs.readFileSync(fullPath, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

function readJsonState(fullPath) {
  try {
    if (!fs.existsSync(fullPath)) return { valid: false, value: null, error: "File not found" };
    const raw = fs.readFileSync(fullPath, "utf8").trim();
    return { valid: true, value: raw ? JSON.parse(raw) : {}, error: null };
  } catch (error) {
    return { valid: false, value: null, error: error.message };
  }
}

function mergeFeatures(target, source) {
  for (const key of Object.keys(target)) target[key] = target[key] || Boolean(source[key]);
}

function normalizeComponentTarget(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function sortByImportPath(left, right) {
  return String(left.importPath || left.name).localeCompare(String(right.importPath || right.name));
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  findComponentByImportTarget,
  findComponentByName,
  findDataSource,
  findLayoutByName,
  findLayoutByTarget,
  getDocumentLoadBindings,
  normalizeImportPath,
  readRoleInfo,
  resolveImportedComponentNames,
  resolveImportedComponents,
  scanWorkspaceRoots,
};
