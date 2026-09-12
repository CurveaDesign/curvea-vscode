@page
@use Main(title=page.title)

<main><a >Link</a>
@if page.visible
<section><h2>{{ page.title }}</h2><p>Body</p></section>
@end
</main>
