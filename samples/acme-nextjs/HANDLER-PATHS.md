# Handler paths — acme-nextjs/app

32 handler attachments on DOM elements; 27 resolved, 0 unresolved, 0 ambiguous. A path runs from the DOM attribute through each prop that carried the handler to the function body. Offsets are character positions in the file.

## The five longest resolved paths

- **action=formAction** — resolved, 1 hop
  `ui/invoices/create-form.tsx`:590 → `ui/invoices/create-form.tsx`:501 → `lib/actions.ts`
- **action=formAction** — resolved, 1 hop
  `ui/invoices/edit-form.tsx`:729 → `ui/invoices/edit-form.tsx`:634 → `ui/invoices/edit-form.tsx`:566
- **action=formAction** — resolved, 1 hop
  `ui/login-form.tsx`:676 → `ui/login-form.tsx`:560 → `lib/actions.ts`
- **onMouseEnter=onHover** — resolved, 1 hop
  `ui/quick-search/overlay.tsx`:10981 → `ui/quick-search/overlay.tsx`:8896 → `ui/quick-search/overlay.tsx`:8896
- **onMouseEnter=onHover** — resolved, 1 hop
  `ui/quick-search/overlay.tsx`:12019 → `ui/quick-search/overlay.tsx`:9782 → `ui/quick-search/overlay.tsx`:9782

## Unresolved or ambiguous

- **onClick=undo** — unknown, 1 hop
  `ui/invoices/save-bar.tsx`:1311 → `ui/invoices/save-bar.tsx`:582
- **onClick=redo** — unknown, 1 hop
  `ui/invoices/save-bar.tsx`:1658 → `ui/invoices/save-bar.tsx`:582
- **onClick=saveAll** — unknown, 1 hop
  `ui/invoices/save-bar.tsx`:2095 → `ui/invoices/save-bar.tsx`:582
- **onClick=discardAll** — unknown, 1 hop
  `ui/invoices/save-bar.tsx`:2374 → `ui/invoices/save-bar.tsx`:582
- **onClick=open** — unknown, 1 hop
  `ui/quick-search/trigger.tsx`:456 → `ui/quick-search/trigger.tsx`:377
