function buildComponentSnippet(component, options = {}) {
  const leadingAngle = options.includeLeadingAngle === false ? "" : "<";
  const props = (component.props || []).map((prop, index) =>
    prop + "=\"${" + (index + 1) + ":" + prop + "}\"",
  );
  const attributes = props.length ? " " + props.join(" ") : "";
  if (component.acceptsSlot) {
    return leadingAngle + component.name + attributes + ">\n\t$0\n</" + component.name + ">";
  }
  return leadingAngle + component.name + attributes + " />$0";
}

module.exports = {
  buildComponentSnippet,
};
