@page
@use Main(title=page.title)
@import Hero
@import marketing/*
@load site/home as home

@seo
title = page.title
description = page.description
@end

@data
headline = page.title
@end

@code
@import MissingThing
@use Main(title=page.title)
<MissingThing />
@if page.example
  <Hero title="Example" />
@end
@endcode

@if page.showHero
  <Hero title="Welcome" subtitle="Phase 1" />
@elseif page.showCard
  <Card title="Fallback" />
@else
  <p>{{ page.message }}</p>
@end
