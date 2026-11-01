---
paths:
  - "site/app/globals.css"
  - "site/components/session-view*.tsx"
---

# Printing a plan

The `@media print` block at the foot of `globals.css` is how a plan reaches
someone with no account — «Skriv ut» in the session menu is just `window.print()`
on `/sessions/<id>`. It works off `data-print` attributes in `session-view.tsx`
rather than the utility classes, so the two move together: `hide` drops chrome,
`item` keeps an activity whole across a page break, `block-head` stops a heading
being orphaned, and `cue` gives the Stikkord box a border, because browsers only
print backgrounds if the reader asks for them.
