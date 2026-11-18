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
`item` keeps an activity whole across a page break, and `block-head` stops a
heading being orphaned. `cue` marks the Stikkord; they are plain text with an
icon, not a filled box, so nothing there depends on the browser printing
backgrounds, which it only does if the reader asks for them.
