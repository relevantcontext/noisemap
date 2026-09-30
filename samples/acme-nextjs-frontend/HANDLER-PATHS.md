# Handler paths — acme-nextjs-frontend/app

32 handler attachments on DOM elements; 25 resolved, 0 unresolved, 0 ambiguous. A path runs from the DOM attribute through each prop that carried the handler to the function body. Offsets are character positions in the file.

## The five longest resolved paths

- **action=formAction** — resolved, 1 hop
  `ui/invoices/edit-form.tsx`:729 → `ui/invoices/edit-form.tsx`:634 → `ui/invoices/edit-form.tsx`:566
- **onMouseEnter=onHover** — resolved, 1 hop
  `ui/quick-search/overlay.tsx`:10981 → `ui/quick-search/overlay.tsx`:8896 → `ui/quick-search/overlay.tsx`:8896
- **onMouseEnter=onHover** — resolved, 1 hop
  `ui/quick-search/overlay.tsx`:12019 → `ui/quick-search/overlay.tsx`:9782 → `ui/quick-search/overlay.tsx`:9782
- **onClick=inline** — resolved
  `dashboard/invoices/error.tsx`:573 → `dashboard/invoices/error.tsx`:573
- **action=inline** — resolved
  `ui/dashboard/sidenav.tsx`:895 → `ui/dashboard/sidenav.tsx`:895

## Unresolved or ambiguous

- **action=formAction** — unknown, 1 hop
  `ui/invoices/create-form.tsx`:590 → `ui/invoices/create-form.tsx`:501
- **onClick=undo** — unknown, 1 hop
  `ui/invoices/save-bar.tsx`:1311 → `ui/invoices/save-bar.tsx`:582
- **onClick=redo** — unknown, 1 hop
  `ui/invoices/save-bar.tsx`:1658 → `ui/invoices/save-bar.tsx`:582
- **onClick=saveAll** — unknown, 1 hop
  `ui/invoices/save-bar.tsx`:2095 → `ui/invoices/save-bar.tsx`:582
- **onClick=discardAll** — unknown, 1 hop
  `ui/invoices/save-bar.tsx`:2374 → `ui/invoices/save-bar.tsx`:582
