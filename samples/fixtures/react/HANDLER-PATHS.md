# Handler paths — react/src

4 handler attachments on DOM elements; 3 resolved, 1 unresolved, 0 ambiguous. A path runs from the DOM attribute through each prop that carried the handler to the function body. Offsets are character positions in the file.

## The five longest resolved paths

- **onKeyDown=handleKey** — resolved
  `components/Counter.tsx`:674 → `components/Counter.tsx`:513
- **onClick=inline** — resolved
  `components/Counter.tsx`:894 → `components/Counter.tsx`:894
- **onClick=handleReset** — resolved
  `components/Counter.tsx`:964 → `components/Counter.tsx`:436

## Unresolved or ambiguous

- **onClick=this.toggle** — unresolved
  `components/Legacy.jsx`:464
  *onClick on <button>: member 'this.toggle' is not a prop or a local*
