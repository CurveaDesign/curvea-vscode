@page
@use Main(title=page.title)

@if page.visible
  <p>Visible</p>
@else
  <p>Fallback</p>
@elseif page.other
  <p>Wrong order</p>
