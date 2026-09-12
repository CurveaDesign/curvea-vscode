# CurveaScript Language Support

Official VS Code authoring support for CurveaScript (`.csc`) files, developed and maintained by [Curvea Design](https://curveadesign.com).

`.csc` stands for **CurveaScript Code**. CurveaScript is an HTML-first template language powered by Curvea Engine; it is not JSX, Vue, Astro, Blade, or JavaScript.

## Language support

- File roles: `@page`, `@layout`, `@component`, and `@document`
- Page layouts, component imports, JSON loads, pagination, local data, and SEO
- Conditions, loops with transforms, escaped code examples, styles, and scripts
- Path-only `{{ expressions }}` and the runtime `CurrentYear` global
- Workspace-aware components, props, layouts, data paths, page data, content metadata, and built-ins
- Curvea menu and lightbox `data-csc-*` attributes
- Project-dependent `Icon` support when Lucide is installed

## Editor features

- TextMate and semantic highlighting
- Directive, HTML, component, prop, layout, data, SEO, and expression completions
- Automatic component imports
- Hover documentation and signature help
- Go to Definition for layouts, components, loaded data, page data, and local declarations
- Find References and Rename for components, layouts, props, loop variables, and local data
- Document Symbols and Workspace Symbols
- Engine-aligned diagnostics and quick fixes
- Directive folding, bracket pairs, auto-closing, and indentation
- Context-aware comments for HTML, `@data`/`@seo`, CSS, and JavaScript
- Raw-block-safe document formatting
- Workspace validation and related-file navigation commands

## Commands

- `CurveaScript: Validate Workspace`
- `CurveaScript: Open Related Page Data`
- `CurveaScript: Open Document Shell`
- `CurveaScript: Show Project Info`
- `CurveaScript: Toggle Context Comment`

## Settings

- `curvea.diagnostics.enabled`
- `curvea.diagnostics.unusedImports`
- `curvea.completions.autoImport`

## Development

```bash
npm install
npm test
npm run package:check
```

The test suite validates current syntax fixtures, TextMate grammar behavior, parser and diagnostic parity cases, project-dependent built-ins, workspace indexing, formatter safety, and extension-host behavior.

## CurveaScript examples

```csc
@page
@use Main(title=page.title)
@import Hero
@load products/items as products
@paginate products by 12

@if page.featured
  <Hero title="{{ page.title }}" />
@end

@for product in pagination.items sort order asc
  <article>{{ product.title }}</article>
@end
```

```csc
@component CodeExample(source)
<pre><code>
@code source
</code></pre>
```

## Links

- Website: [curveadesign.com](https://curveadesign.com)
- Source: [github.com/CurveaDesign/curvea-vscode](https://github.com/CurveaDesign/curvea-vscode)
- Support: [ceo@curveadesign.com](mailto:ceo@curveadesign.com)

## License

MIT © 2026 Curvea Design
