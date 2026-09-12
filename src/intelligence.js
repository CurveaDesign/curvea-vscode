const { PAGINATION_PROPERTIES } = require("./constants");
const {
  analyzeDocumentStructure,
  parseAssignmentLine,
  parseForHeader,
  scanCurveaSource,
} = require("./parsing");
const { getDocumentLoadBindings } = require("./workspace/scan");

function buildScopeSymbols(source, workspaceIndex, lineLimit = Number.POSITIVE_INFINITY) {
  const structure = analyzeDocumentStructure(source);
  const role = structure.declaration?.role || null;
  const symbols = new Map();

  add(symbols, "CurrentYear", "Reserved runtime year", "constant");
  for (const key of workspaceIndex.siteKeys || []) add(symbols, `site.${key}`, "Site configuration", "property");
  for (const key of workspaceIndex.pageKeys || []) add(symbols, `page.${key}`, "Page data", "property");

  add(symbols, "page.route", "Generated page route", "property");
  add(symbols, "page.slug", "Generated page slug", "property");
  add(symbols, "page.id", "Generated page id", "property");
  add(symbols, "collection.name", "Content collection name", "property");
  add(symbols, "collection.items", "Content collection items", "array");

  if (role === "layout") {
    add(symbols, "slot", "Rendered page content", "variable");
    add(symbols, "content", "Alias of layout slot", "variable");
  }
  if (role === "component") add(symbols, "slot", "Rendered child content", "variable");
  if (role === "document") {
    add(symbols, "head", "Generated document head", "variable");
    add(symbols, "app", "Rendered application HTML", "variable");
  }

  for (const prop of structure.declaration?.params || []) add(symbols, prop, `${role} prop`, "parameter");

  const loadBindings = getDocumentLoadBindings(source, workspaceIndex);
  for (const binding of loadBindings) {
    add(symbols, binding.name, `Loaded data from ${binding.source}`, binding.dataSource?.valueType || "variable", binding.dataSource?.fullPath);
    for (const key of binding.dataSource?.keys || []) {
      add(symbols, `${binding.name}.${key}`, `Loaded data from ${binding.source}`, "property", binding.dataSource?.fullPath);
    }
  }

  const lines = String(source || "").split(/\r?\n/);
  let dataDepth = 0;
  for (let line = 0; line < lines.length && line <= lineLimit; line += 1) {
    const trimmed = lines[line].trim();
    if (trimmed === "@data") {
      dataDepth += 1;
      continue;
    }
    if (dataDepth && trimmed === "@end") {
      dataDepth -= 1;
      continue;
    }
    if (dataDepth) {
      const assignment = parseAssignmentLine(trimmed);
      if (assignment.key) add(symbols, assignment.key, "Local @data value", "variable");
    }

    if (/^@paginate\b/.test(trimmed)) {
      add(symbols, "pagination", "Pagination state", "variable");
      for (const property of PAGINATION_PROPERTIES) add(symbols, `pagination.${property}`, "Pagination state", property === "items" || property === "pages" ? "array" : "property");
    }

    if (/^@for\b/.test(trimmed)) {
      const loop = parseForHeader(trimmed);
      if (loop.valid) {
        add(symbols, loop.itemName, `Loop item from ${loop.collectionPath}`, "variable");
        add(symbols, "$index", "Zero-based loop index (conditions only)", "number");
        for (const key of inferLoopItemKeys(loop.collectionPath, lines, loadBindings)) {
          add(symbols, `${loop.itemName}.${key}`, `Item from ${loop.collectionPath}`, "property");
        }
      }
    }
  }

  return Array.from(symbols.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function inferLoopItemKeys(collectionPath, lines, loadBindings) {
  if (collectionPath === "collection.items") {
    return ["title", "description", "excerpt", "image", "cover", "route", "slug", "id", "readingTime", "collection"];
  }
  if (collectionPath === "pagination.pages") return ["number", "url", "current"];

  let bindingName = collectionPath.split(".")[0];
  if (collectionPath === "pagination.items") {
    const paginate = lines.map((line) => line.trim()).find((line) => /^@paginate\s+/.test(line));
    bindingName = paginate?.match(/^@paginate\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1] || "";
  }
  const binding = loadBindings.find((entry) => entry.name === bindingName);
  return binding?.dataSource?.keys || [];
}

function getRawBlockAtLine(source, lineNumber) {
  const scan = scanCurveaSource(source);
  return scan.contexts[lineNumber]?.kind || "body";
}

function add(map, name, detail, type, fullPath = null) {
  if (!name || map.has(name)) return;
  map.set(name, { name, detail, type, fullPath });
}

module.exports = {
  buildScopeSymbols,
  getRawBlockAtLine,
};
