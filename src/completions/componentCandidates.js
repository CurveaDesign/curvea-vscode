function filterComponentsByPrefix(components, typedName) {
  if (!typedName) {
    return components;
  }

  const lowered = typedName.toLowerCase();
  return components.filter((component) =>
    String(component.name).toLowerCase().startsWith(lowered),
  );
}

module.exports = {
  filterComponentsByPrefix,
};
