@page
@use Main(title=page.title)
@import Hero

<section>
  <h2>Usage</h2>

  @code
  @import MissingThing
  <MissingThing />
  @if page.preview
    <Hero title="Preview" />
  @end
  @endcode

  <Hero title="Live" subtitle="Actual usage" />
</section>
