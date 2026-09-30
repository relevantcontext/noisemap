# Vocabulary — acme-nextjs-frontend/app

19 names the app declares, 0 from the framework. Roles: SpyneJS — registers (addRegisteredActions), emits (sendChannelPayload), listens (addActionListeners, patterns expanded), binds (props.channels), names (a Channel class), mentions (payload filters, comparisons, constants). React — actions: registers (a reducer case), emits (dispatch); contexts: names (createContext), emits (a Provider), listens (useContext); routes: names (a page or route file), emits (href, push, redirect); handler props: listens (a component declares the prop), emits (a parent passes it).

## Actions

### `apply`

- **registers**: `ui/invoices/edits-provider.tsx`
- **emits**: `ui/invoices/edits-provider.tsx`

### `redo`

- **registers**: `ui/invoices/edits-provider.tsx`
- **emits**: `ui/invoices/edits-provider.tsx`

### `reset`

- **registers**: `ui/invoices/edits-provider.tsx`
- **emits**: `ui/invoices/edits-provider.tsx`

### `undo`

- **registers**: `ui/invoices/edits-provider.tsx`
- **emits**: `ui/invoices/edits-provider.tsx`

## Contexts

### `InvoiceEditsContext`

- **emits**: `ui/invoices/edits-provider.tsx`
- **listens**: `ui/invoices/edits-provider.tsx`
- **names**: `ui/invoices/edits-provider.tsx`

### `LiveEventsContext`

- **emits**: `ui/live/live-events-provider.tsx`
- **listens**: `ui/live/live-events-provider.tsx`
- **names**: `ui/live/live-events-provider.tsx`

### `QuickSearchContext`

- **emits**: `ui/quick-search/provider.tsx`
- **listens**: `ui/quick-search/provider.tsx`
- **names**: `ui/quick-search/provider.tsx`

## Routes

### `/`

- **emits**: `ui/dashboard/sidenav.tsx`
- **names**: `page.tsx`

### `/dashboard`

- **names**: `dashboard/(overview)/page.tsx`

### `/dashboard/customers`

- **names**: `dashboard/customers/page.tsx`

### `/dashboard/invoices`

- **emits**: `dashboard/invoices/[id]/edit/not-found.tsx`, `ui/invoices/create-form.tsx`, `ui/invoices/edit-form.tsx`
- **names**: `dashboard/invoices/page.tsx`

### `/dashboard/invoices/*/edit`

- **emits**: `ui/invoices/buttons.tsx`
- **names**: `dashboard/invoices/[id]/edit/page.tsx`

### `/dashboard/invoices/create`

- **emits**: `ui/invoices/buttons.tsx`
- **names**: `dashboard/invoices/create/page.tsx`

### `/login`

- **emits**: `page.tsx`
- **names**: `login/page.tsx`

## Handler props

### `onClick`

- **emits**: `ui/quick-search/overlay.tsx`

### `onClose`

- **emits**: `ui/quick-search/provider.tsx`
- **listens**: `ui/quick-search/overlay.tsx`

### `onHover`

- **emits**: `ui/quick-search/overlay.tsx`
- **listens**: `ui/quick-search/overlay.tsx`

### `onNavigate`

- **emits**: `ui/quick-search/overlay.tsx`
- **listens**: `ui/quick-search/overlay.tsx`

### `onToggled`

- **emits**: `ui/quick-search/overlay.tsx`
- **listens**: `ui/invoices/status-toggle.tsx`, `ui/quick-search/overlay.tsx`

## Findings

- unresolved: `dashboard/customers/page.tsx` — import '@/app/lib/data' does not resolve to a file or a package
- unresolved: `dashboard/invoices/[id]/edit/page.tsx` — import '@/app/lib/data' does not resolve to a file or a package
- unresolved: `dashboard/invoices/create/page.tsx` — import '@/app/lib/data' does not resolve to a file or a package
- unresolved: `dashboard/invoices/page.tsx` — import '@/app/lib/data' does not resolve to a file or a package
- unresolved: `ui/customers/table.tsx` — import '@/app/lib/data' does not resolve to a file or a package
- unresolved: `ui/dashboard/cards.tsx` — import '@/app/lib/data' does not resolve to a file or a package
- unresolved: `ui/dashboard/latest-invoices.tsx` — import '@/app/lib/data' does not resolve to a file or a package
- unresolved: `ui/dashboard/revenue-chart.tsx` — import '@/app/lib/data' does not resolve to a file or a package
- unresolved: `ui/invoices/buttons.tsx` — import '@/app/lib/actions' does not resolve to a file or a package
- unresolved: `ui/invoices/create-form.tsx` — import '@/app/lib/actions' does not resolve to a file or a package
- unresolved: `ui/invoices/edit-form.tsx` — import '@/app/lib/actions' does not resolve to a file or a package
- unresolved: `ui/invoices/edits-provider.tsx` — import '@/app/lib/actions' does not resolve to a file or a package
- unresolved: `ui/invoices/status-toggle.tsx` — import '@/app/lib/actions' does not resolve to a file or a package
- unresolved: `ui/invoices/table.tsx` — import '@/app/lib/data' does not resolve to a file or a package
- unresolved: `ui/login-form.tsx` — import '@/app/lib/actions' does not resolve to a file or a package
