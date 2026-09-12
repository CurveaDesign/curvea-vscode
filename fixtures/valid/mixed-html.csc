@page
@use Main(title=page.title)
@import Hero

<main class="page">
  @if page.featured
    <Hero title="{{ page.title }}">
      <p>{{ page.description }}</p>
    </Hero>
  @else
    <section aria-labelledby="fallback-title">
      <h2 id="fallback-title">Fallback</h2>
      @for item in page.items limit 3
        <article data-id="{{ item.id }}">
          <h3>{{ item.title }}</h3>
        </article>
      @end
    </section>
  @end
</main>
