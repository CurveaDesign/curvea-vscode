const CURVEA_SELECTOR = [
  { language: "curvea", scheme: "file" },
  { language: "curvea", scheme: "untitled" },
];

const BUILT_IN_COMPONENT_DEFINITIONS = [
  {
    name: "Icon",
    props: ["name", "class"],
    relativePath: "built-in",
    importPath: null,
    fullPath: null,
    builtIn: true,
    feature: "lucide",
    documentation: "Lucide icon. Available only when the project has the lucide dependency.",
  },
];

const FILE_ROLES = new Set(["page", "layout", "component", "document"]);
const TOP_LEVEL_DIRECTIVES = new Set([
  "use",
  "import",
  "load",
  "paginate",
  "data",
  "seo",
  "style",
  "script",
]);
const FLOW_DIRECTIVES = new Set(["if", "elseif", "else", "for", "end"]);
const BLOCK_DIRECTIVES = new Set(["data", "seo", "style", "script", "if", "for"]);
const BRANCH_DIRECTIVES = new Set(["elseif", "else"]);
const RESERVED_GLOBALS = new Set(["CurrentYear"]);

const SEO_KEYS = ["title", "description", "canonical", "image", "robots", "type"];
const PAGINATION_PROPERTIES = [
  "items",
  "currentPage",
  "totalPages",
  "perPage",
  "totalItems",
  "offset",
  "hasNext",
  "hasPrevious",
  "nextUrl",
  "previousUrl",
  "pages",
];

const CURVEA_HTML_ATTRIBUTES = [
  { name: "data-csc-menu", detail: "Declare a menu id" },
  { name: "data-csc-menu-toggle", detail: "Toggle a menu by id" },
  { name: "data-csc-menu-open", detail: "Open a menu by id" },
  { name: "data-csc-menu-close", detail: "Close a menu by id" },
  { name: "data-csc-menu-backdrop", detail: "Close a menu from its backdrop" },
  { name: "data-csc-menu-hidden-class", detail: "Set the menu hidden class" },
  { name: "data-csc-menu-lock-scroll", detail: "Lock body scrolling while a menu is open", boolean: true },
  { name: "data-csc-lightbox", detail: "Enable a lightbox or name its group" },
];

const ISSUE_CODES = {
  invalidDeclaration: "curvea.invalidDeclaration",
  misplacedDeclaration: "curvea.misplacedDeclaration",
  missingDeclaration: "curvea.missingDeclaration",
  roleMismatch: "curvea.roleMismatch",
  invalidBlockStructure: "curvea.invalidBlockStructure",
  invalidDirectiveSyntax: "curvea.invalidDirectiveSyntax",
  invalidDirectiveRole: "curvea.invalidDirectiveRole",
  duplicateDirective: "curvea.duplicateDirective",
  missingTemplateBody: "curvea.missingTemplateBody",
  missingImport: "curvea.missingImport",
  unresolvedImport: "curvea.unresolvedImport",
  duplicateImport: "curvea.duplicateImport",
  unusedImport: "curvea.unusedImport",
  unresolvedLayout: "curvea.unresolvedLayout",
  unknownLayoutProp: "curvea.unknownLayoutProp",
  unresolvedLoad: "curvea.unresolvedLoad",
  invalidDataEntry: "curvea.invalidDataEntry",
  invalidExpression: "curvea.invalidExpression",
  reservedGlobal: "curvea.reservedGlobal",
  invalidComponentName: "curvea.invalidComponentName",
  invalidDocument: "curvea.invalidDocument",
  invalidPagination: "curvea.invalidPagination",
};

module.exports = {
  BLOCK_DIRECTIVES,
  BRANCH_DIRECTIVES,
  BUILT_IN_COMPONENT_DEFINITIONS,
  CURVEA_HTML_ATTRIBUTES,
  CURVEA_SELECTOR,
  FILE_ROLES,
  FLOW_DIRECTIVES,
  ISSUE_CODES,
  PAGINATION_PROPERTIES,
  RESERVED_GLOBALS,
  SEO_KEYS,
  TOP_LEVEL_DIRECTIVES,
};
