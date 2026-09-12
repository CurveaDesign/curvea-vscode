# CurveaScript extension roadmap

The current extension covers the CurveaScript features implemented by the audited Curvea Engine release.

Future releases should remain engine-led:

1. Add regression fixtures whenever the engine gains or changes language syntax.
2. Consider deeper HTML language-service embedding if it can preserve CurveaScript ranges without false diagnostics.
3. Add an extension-host integration suite for UI providers and commands.
4. Consider migrating to a language server only when workspace scale or cross-editor reuse justifies it.

No future syntax should be added to the extension before it exists in the engine.
