@component Demo()
@data
label = Mixed
@end
@style
  .demo { color: red; }
@end
@script
  const example = "<div>{{ untouched }}</div>";
@end

<section class="demo">
  @code
@if this.must.stay.literal
  <div class="raw">No formatting here</div>
@end
  @endcode
</section>
