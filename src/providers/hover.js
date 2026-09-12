const vscode = require("vscode");

const { CURVEA_HTML_ATTRIBUTES, CURVEA_SELECTOR } = require("../constants");
const { buildScopeSymbols, getRawBlockAtLine } = require("../intelligence");
const { getDirectiveName, parseLoadDirective, parseUseDirective } = require("../parsing");
const { findDataSource, findLayoutByTarget, scanWorkspace } = require("../workspace");
const { resolveComponentUsedByDocument } = require("./definitions");

const DIRECTIVE_HELP = {
  page: ["Page declaration", "@page", "Declares a route template. It takes no props."],
  layout: ["Layout declaration", "@layout Main(title)", "Declares a layout. Parentheses are optional when there are no props."],
  component: ["Component declaration", "@component Hero(title)", "Declares a reusable component. Parentheses are required, including for zero props."],
  document: ["Document declaration", "@document", "Declares the optional global HTML document shell."],
  use: ["Layout usage", "@use Main(title=page.title)", "Applies one layout to a page with named arguments."],
  import: ["Component import", "@import marketing/Hero", "Makes a component available in this file. Folder wildcards use folder/*."],
  load: ["Data load", "@load products/items as products", "Loads JSON data, a folder collection, or a folder/* map."],
  paginate: ["Pagination", "@paginate products by 12", "Paginates an array exposed by an @load alias. Page files only."],
  data: ["Local data block", "@data\ntitle = Welcome\n@end", "Accepts one JSON object or key/value assignments."],
  seo: ["SEO block", "@seo\ntitle = page.title\n@end", "Defines title, description, canonical, image, robots, and type. Page files only."],
  style: ["Style block", "@style\n/* CSS */\n@end", "Adds raw CSS to the generated page."],
  script: ["Script block", "@script\n// JavaScript\n@end", "Adds raw JavaScript to the generated page."],
  if: ["Conditional", "@if page.visible", "Checks a path or one comparison using ==, !=, >, <, >=, or <=."],
  elseif: ["Conditional branch", "@elseif page.kind == \"news\"", "Adds another condition to the current @if block."],
  else: ["Fallback branch", "@else", "Renders when earlier branches are false."],
  for: ["Loop", "@for item in products limit 6 sort order asc", "Iterates an array. Options: limit, offset, and sort field asc|desc."],
  code: ["Escaped code", "@code example.source", "Escapes one value, or opens a literal block when used alone and closed by @endcode."],
  end: ["Block terminator", "@end", "Closes @if, @for, @data, @seo, @style, or @script."],
  endcode: ["Code terminator", "@endcode", "Closes a literal @code block."],
};

function registerHoverProvider(context) {
  const provider = vscode.languages.registerHoverProvider(CURVEA_SELECTOR, {
    provideHover(document, position) {
      const lineText = document.lineAt(position.line).text;
      const trimmed = lineText.trim();
      if (getRawBlockAtLine(document.getText(), position.line) === "raw-code") return undefined;
      const workspaceIndex = scanWorkspace();
      const directive = getDirectiveName(trimmed);

      if (directive && DIRECTIVE_HELP[directive]) {
        const specific = buildDirectiveHover(trimmed, directive, workspaceIndex);
        return new vscode.Hover(specific || markdownHelp(DIRECTIVE_HELP[directive]));
      }

      const wordRange = document.getWordRangeAtPosition(position, /(?:data-csc-[A-Za-z-]+)|(?:\$?[A-Za-z_][A-Za-z0-9_.]*)/);
      if (!wordRange) return undefined;
      const word = document.getText(wordRange);

      const attribute = CURVEA_HTML_ATTRIBUTES.find((entry) => entry.name === word);
      if (attribute) return new vscode.Hover(new vscode.MarkdownString(`**${attribute.name}**\n\n${attribute.detail}.`), wordRange);

      if (/^[A-Z][A-Za-z0-9]*$/.test(word)) {
        const component = resolveComponentUsedByDocument(document.getText(), word, workspaceIndex);
        if (component) {
          const signature = `<${component.name}${(component.props || []).map((prop) => ` ${prop}="…"`).join("")} />`;
          const text = new vscode.MarkdownString();
          text.appendMarkdown(`**${component.builtIn ? "Built-in" : "Component"} ${component.name}**\n\n`);
          text.appendCodeblock(signature, "csc");
          if (component.importPath) text.appendMarkdown(`\nImport: \`${component.importPath}\``);
          if (component.documentation) text.appendMarkdown(`\n\n${component.documentation}`);
          return new vscode.Hover(text, wordRange);
        }
      }

      const symbol = buildScopeSymbols(document.getText(), workspaceIndex, position.line)
        .find((entry) => entry.name === word);
      if (symbol) {
        const text = new vscode.MarkdownString(`**${symbol.name}**  \n${symbol.detail}`);
        if (symbol.type) text.appendMarkdown(`  \nType: \`${symbol.type}\``);
        return new vscode.Hover(text, wordRange);
      }
      return undefined;
    },
  });
  context.subscriptions.push(provider);
}

function buildDirectiveHover(trimmed, directive, workspaceIndex) {
  if (directive === "use") {
    const use = parseUseDirective(trimmed);
    const layout = use.valid ? findLayoutByTarget(use.target, workspaceIndex) : null;
    if (layout) return markdownHelp([`Layout ${layout.name}`, `@use ${layout.importPath || layout.name}(${(layout.params || []).map((prop) => `${prop}=…`).join(", ")})`, `Layout props: ${(layout.params || []).join(", ") || "none"}.`]);
  }
  if (directive === "load") {
    const load = parseLoadDirective(trimmed);
    const source = load.valid ? findDataSource(load.source, workspaceIndex) : null;
    if (source) return markdownHelp([`Data ${load.alias || source.alias || source.source}`, trimmed, `${source.valueType} from ${source.source}. Known paths: ${(source.keys || []).slice(0, 12).join(", ") || "none"}.`]);
  }
  return null;
}

function markdownHelp([title, syntax, description]) {
  const text = new vscode.MarkdownString(`**${title}**\n\n`);
  text.appendCodeblock(syntax, "csc");
  text.appendMarkdown(`\n${description}`);
  return text;
}

module.exports = {
  registerHoverProvider,
};
