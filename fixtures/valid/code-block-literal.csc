@page
@use Main(title=page.title)
@import Hero

@code
@page
@use Main(title=page.title)
@import MissingThing
<MissingThing />
@if page.fake
  <Hero title="Example" />
@end
@endcode

<section>
  <Hero title="Live" subtitle="Actual usage" />
</section>
