const vscode = require("vscode");

const { CURVEA_SELECTOR } = require("../constants");
const { findLayoutByTarget, scanWorkspace } = require("../workspace");
const { resolveComponentUsedByDocument } = require("./definitions");

function registerSignatureHelpProvider(context) {
  const provider = vscode.languages.registerSignatureHelpProvider(
    CURVEA_SELECTOR,
    {
      provideSignatureHelp(document, position) {
        const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
        const workspaceIndex = scanWorkspace();

        const useMatch = linePrefix.match(/^\s*@use\s+([A-Za-z0-9_/-]+)\(([^)]*)$/);
        if (useMatch) {
          const layout = findLayoutByTarget(useMatch[1], workspaceIndex);
          if (!layout) return undefined;
          return signatureHelp(
            `@use ${layout.importPath || layout.name}(${(layout.params || []).map((prop) => `${prop}=value`).join(", ")})`,
            "Named layout arguments",
            layout.params || [],
            activeNamedParameter(useMatch[2], layout.params || []),
          );
        }

        const componentMatch = linePrefix.match(/<([A-Z][A-Za-z0-9]*)\s+([^>]*)$/);
        if (componentMatch) {
          const component = resolveComponentUsedByDocument(document.getText(), componentMatch[1], workspaceIndex)
            || workspaceIndex.components.find((entry) => entry.name === componentMatch[1]);
          if (!component) return undefined;
          const props = component.props || [];
          return signatureHelp(
            `<${component.name}${props.map((prop) => ` ${prop}="value"`).join("")} />`,
            component.builtIn ? "Built-in Curvea component" : `Component from ${component.importPath}`,
            props,
            activeComponentParameter(componentMatch[2], props),
          );
        }

        if (/^\s*@for\s+/.test(linePrefix)) {
          return signatureHelp(
            "@for item in collection [limit number] [offset number] [sort field asc|desc]",
            "Iterate an array with optional transforms.",
            ["item", "collection", "limit", "offset", "sort"],
            1,
          );
        }

        return undefined;
      },
    },
    "(",
    ",",
    " ",
    "=",
  );
  context.subscriptions.push(provider);
}

function signatureHelp(label, documentation, parameters, activeParameter) {
  const help = new vscode.SignatureHelp();
  const signature = new vscode.SignatureInformation(label, documentation);
  signature.parameters = parameters.map((parameter) => new vscode.ParameterInformation(parameter));
  help.signatures = [signature];
  help.activeSignature = 0;
  help.activeParameter = Math.max(0, Math.min(activeParameter, Math.max(0, parameters.length - 1)));
  return help;
}

function activeNamedParameter(rawArgs, params) {
  const current = rawArgs.split(",").at(-1) || "";
  const key = current.split("=")[0].trim();
  const index = params.indexOf(key);
  return index === -1 ? Math.min(rawArgs.split(",").length - 1, Math.max(0, params.length - 1)) : index;
}

function activeComponentParameter(rawAttributes, props) {
  const current = rawAttributes.match(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*[^\s>]*)?$/)?.[1];
  const index = current ? props.indexOf(current) : -1;
  return index === -1 ? 0 : index;
}

module.exports = {
  registerSignatureHelpProvider,
};
