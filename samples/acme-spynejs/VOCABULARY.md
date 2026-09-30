# Vocabulary — acme-spynejs/src

57 names the app declares, 12 from the framework. Roles: SpyneJS — registers (addRegisteredActions), emits (sendChannelPayload), listens (addActionListeners, patterns expanded), binds (props.channels), names (a Channel class), mentions (payload filters, comparisons, constants). React — actions: registers (a reducer case), emits (dispatch); contexts: names (createContext), emits (a Provider), listens (useContext); routes: names (a page or route file), emits (href, push, redirect); handler props: listens (a component declares the prop), emits (a parent passes it).

## Channels

### `CHANNEL_ACME_AUTH`

- **binds**: `app/components/shell/app-container.js`, `app/components/shell/app-loading-view.js`, `app/components/shell/null-views/acme-requester-null-view.js`
- **names**: `app/channels/channel-acme-auth.js`
- **mentions**: `app/traits/db/db-data-channel-traits.js`, `app/traits/shell/app-redirect-traits.js`, `app/traits/shell/app-status-traits.js`

### `CHANNEL_ACME_CUSTOMERS`

- **emits**: `app/traits/customers/customers-pagination-view-traits.js`
- **binds**: `app/components/elements/customers-pagination-items-view.js`, `app/components/page-items/customers-pagination-container.js`, `app/components/page-items/customers-table-view.js`, `app/components/shell/null-views/acme-query-params-null-view.js`
- **names**: `app/channels/channel-acme-customers.js`
- **mentions**: `app/components/page-items/ui-search-view.js`

### `CHANNEL_ACME_DATA`

- **emits**: `app/traits/invoices/invoices-cell-editor-traits.js`, `app/traits/invoices/invoices-form-traits.js`, `app/traits/invoices/invoices-table-edit-traits.js`
- **binds**: `app/components/page-items/dashboard-activity-feed-view.js`, `app/components/page-items/dashboard-invoices-latest-view.js`, `app/components/page-items/dashboard-stats-container.js`, `app/components/page-items/invoices-create-form-view.js`, `app/components/page-items/invoices-edit-form-view.js`, `app/components/page-items/invoices-save-bar-view.js`, `app/components/page-items/invoices-table-view.js`, `app/components/pages/page-acme-view.js`, `app/components/shell/app-loading-view.js`, `app/components/shell/null-views/acme-requester-null-view.js`
- **names**: `app/channels/channel-acme-data.js`
- **mentions**: `app/traits/db/db-customers-channel-traits.js`, `app/traits/db/db-invoices-channel-traits.js`, `app/traits/db/db-search-channel-traits.js`

### `CHANNEL_ACME_EDIT_SESSION`

- **emits**: `app/traits/invoices/invoices-cell-editor-traits.js`, `app/traits/invoices/invoices-table-edit-traits.js`
- **binds**: `app/components/elements/invoices-cell-editor-view.js`, `app/components/elements/invoices-item-view.js`, `app/components/page-items/invoices-save-bar-view.js`, `app/components/page-items/invoices-table-view.js`
- **names**: `app/channels/channel-acme-edit-session.js`

### `CHANNEL_ACME_INVOICES`

- **emits**: `app/traits/invoices/invoices-pagination-view-traits.js`, `app/traits/search/quick-search-overlay-traits.js`
- **binds**: `app/components/elements/invoices-cell-editor-view.js`, `app/components/elements/invoices-item-view.js`, `app/components/elements/invoices-pagination-items-view.js`, `app/components/page-items/invoices-create-form-view.js`, `app/components/page-items/invoices-edit-form-view.js`, `app/components/page-items/invoices-pagination-container.js`, `app/components/page-items/invoices-table-view.js`, `app/components/search/quick-search-invoice-item-view.js`, `app/components/shell/null-views/acme-query-params-null-view.js`
- **names**: `app/channels/channel-acme-invoices.js`
- **mentions**: `app/components/page-items/ui-search-view.js`

### `CHANNEL_ACME_SEARCH`

- **emits**: `app/traits/search/quick-search-overlay-traits.js`
- **binds**: `app/components/search/quick-search-customer-item-view.js`, `app/components/search/quick-search-host-view.js`, `app/components/search/quick-search-invoice-item-view.js`, `app/components/search/quick-search-overlay-view.js`, `app/components/shell/null-views/acme-query-params-null-view.js`
- **names**: `app/channels/channel-acme-search.js`

### `CHANNEL_APP`

- **binds**: `app/components/nav/nav-breadcrumb-view.js`, `app/components/shell/app-container.js`, `app/components/shell/stage-container.js`, `app/components/shell/ui-container.js`
- **names**: `app/channels/channel-app.js`
- **mentions**: `app/traits/shell/app-local-storage-traits.js`

### `CHANNEL_LOCAL_STORAGE`

- **emits**: `app/traits/shell/app-local-storage-traits.js`
- **binds**: `app/components/shell/app-container.js`, `app/components/shell/null-views/local-storage-null-view.js`
- **names**: `app/channels/channel-local-storage.js`

## Actions

### `CHANNEL_ACME_AUTH_CHANGED_EVENT`

- **registers**: `app/channels/channel-acme-auth.js`
- **mentions**: `app/traits/db/db-auth-channel-traits.js`, `app/traits/db/db-data-channel-traits.js`, `app/traits/shell/app-redirect-traits.js`

### `CHANNEL_ACME_AUTH_ERROR_EVENT`

- **registers**: `app/channels/channel-acme-auth.js`
- **mentions**: `app/traits/db/db-auth-channel-traits.js`

### `CHANNEL_ACME_AUTH_INIT_EVENT`

- **registers**: `app/channels/channel-acme-auth.js`
- **listens**: `app/components/shell/app-loading-view.js`
- **mentions**: `app/traits/db/db-auth-channel-traits.js`, `app/traits/db/db-data-channel-traits.js`

### `CHANNEL_ACME_AUTH_LOGIN_FAILED_EVENT`

- **registers**: `app/channels/channel-acme-auth.js`
- **mentions**: `app/traits/db/db-auth-channel-traits.js`

### `CHANNEL_ACME_AUTH_LOGIN_SUCCESS_EVENT`

- **registers**: `app/channels/channel-acme-auth.js`
- **mentions**: `app/traits/db/db-auth-channel-traits.js`

### `CHANNEL_ACME_AUTH_REQUEST_EVENT`

- **registers**: `app/channels/channel-acme-auth.js`
- **emits**: `app/traits/db/db-auth-channel-traits.js`
- **listens**: `app/components/shell/null-views/acme-requester-null-view.js`

### `CHANNEL_ACME_AUTH_SESSION_EVENT`

- **registers**: `app/channels/channel-acme-auth.js`
- **mentions**: `app/traits/db/db-auth-channel-traits.js`

### `CHANNEL_ACME_AUTH_SIGNOUT_COMPLETED_EVENT`

- **registers**: `app/channels/channel-acme-auth.js`
- **listens**: `app/components/shell/app-container.js`
- **mentions**: `app/traits/db/db-auth-channel-traits.js`

### `CHANNEL_ACME_CUSTOMERS_LIST_EVENT`

- **registers**: `app/channels/channel-acme-customers.js`
- **emits**: `app/traits/db/db-customers-channel-traits.js`
- **listens**: `app/components/elements/customers-pagination-items-view.js`, `app/components/page-items/customers-pagination-container.js`
- **mentions**: `app/components/page-items/ui-search-view.js`

### `CHANNEL_ACME_CUSTOMERS_UPDATE_PARAMS_EVENT`

- **registers**: `app/channels/channel-acme-customers.js`
- **emits**: `app/traits/db/db-customers-channel-traits.js`
- **listens**: `app/components/shell/null-views/acme-query-params-null-view.js`

### `CHANNEL_ACME_CUSTOMERS_VISIBLE_IDS_EVENT`

- **registers**: `app/channels/channel-acme-customers.js`
- **emits**: `app/traits/db/db-customers-channel-traits.js`
- **listens**: `app/components/page-items/customers-table-view.js`
- **mentions**: `app/traits/customers/customers-pagination-view-traits.js`

### `CHANNEL_ACME_DATA_EDIT_COMMIT_EVENT`

- **registers**: `app/channels/channel-acme-data.js`
- **listens**: `app/components/page-items/invoices-save-bar-view.js`, `app/components/page-items/invoices-table-view.js`, `app/components/pages/page-acme-view.js`
- **mentions**: `app/traits/db/db-data-channel-traits.js`, `app/traits/invoices/invoices-cell-editor-traits.js`, `app/traits/invoices/invoices-table-edit-traits.js`

### `CHANNEL_ACME_DATA_EDITS_EVENT`

- **registers**: `app/channels/channel-acme-data.js`
- **listens**: `app/components/page-items/invoices-save-bar-view.js`, `app/components/page-items/invoices-table-view.js`, `app/components/pages/page-acme-view.js`
- **mentions**: `app/traits/db/db-edits-channel-traits.js`

### `CHANNEL_ACME_DATA_ERROR_EVENT`

- **registers**: `app/channels/channel-acme-data.js`
- **listens**: `app/components/page-items/dashboard-invoices-latest-view.js`, `app/components/page-items/dashboard-stats-container.js`, `app/components/page-items/invoices-save-bar-view.js`, `app/components/page-items/invoices-table-view.js`, `app/components/pages/page-acme-view.js`, `app/components/shell/app-loading-view.js`
- **mentions**: `app/traits/db/db-data-channel-traits.js`

### `CHANNEL_ACME_DATA_INVOICE_SUBMIT_EVENT`

- **registers**: `app/channels/channel-acme-data.js`
- **listens**: `app/components/page-items/invoices-save-bar-view.js`, `app/components/page-items/invoices-table-view.js`, `app/components/pages/page-acme-view.js`
- **mentions**: `app/traits/db/db-data-channel-traits.js`, `app/traits/invoices/invoices-form-traits.js`

### `CHANNEL_ACME_DATA_LOADED_EVENT`

- **registers**: `app/channels/channel-acme-data.js`
- **listens**: `app/components/page-items/invoices-save-bar-view.js`, `app/components/page-items/invoices-table-view.js`, `app/components/pages/page-acme-view.js`, `app/components/shell/app-loading-view.js`
- **mentions**: `app/traits/db/db-data-channel-traits.js`

### `CHANNEL_ACME_DATA_MUTATION_EVENT`

- **registers**: `app/channels/channel-acme-data.js`
- **listens**: `app/components/page-items/invoices-save-bar-view.js`, `app/components/page-items/invoices-table-view.js`, `app/components/pages/page-acme-view.js`
- **mentions**: `app/traits/db/db-data-channel-traits.js`

### `CHANNEL_ACME_DATA_REQUEST_EVENT`

- **registers**: `app/channels/channel-acme-data.js`
- **emits**: `app/traits/db/db-data-channel-traits.js`
- **listens**: `app/components/page-items/invoices-save-bar-view.js`, `app/components/page-items/invoices-table-view.js`, `app/components/pages/page-acme-view.js`, `app/components/shell/null-views/acme-requester-null-view.js`

### `CHANNEL_ACME_DATA_UPDATED_EVENT`

- **registers**: `app/channels/channel-acme-data.js`
- **listens**: `app/components/page-items/dashboard-activity-feed-view.js`, `app/components/page-items/dashboard-invoices-latest-view.js`, `app/components/page-items/dashboard-stats-container.js`, `app/components/page-items/invoices-create-form-view.js`, `app/components/page-items/invoices-edit-form-view.js`, `app/components/page-items/invoices-save-bar-view.js`, `app/components/page-items/invoices-table-view.js`, `app/components/pages/page-acme-view.js`
- **mentions**: `app/traits/db/db-data-channel-traits.js`

### `CHANNEL_ACME_EDIT_SESSION_CURSOR_EVENT`

- **registers**: `app/channels/channel-acme-edit-session.js`
- **listens**: `app/components/elements/invoices-item-view.js`
- **mentions**: `app/traits/invoices/invoices-table-edit-traits.js`

### `CHANNEL_ACME_EDIT_SESSION_EDIT_END_EVENT`

- **registers**: `app/channels/channel-acme-edit-session.js`
- **listens**: `app/components/elements/invoices-item-view.js`, `app/components/page-items/invoices-table-view.js`
- **mentions**: `app/traits/invoices/invoices-cell-editor-traits.js`

### `CHANNEL_ACME_EDIT_SESSION_EDIT_START_EVENT`

- **registers**: `app/channels/channel-acme-edit-session.js`
- **listens**: `app/components/elements/invoices-cell-editor-view.js`, `app/components/elements/invoices-item-view.js`
- **mentions**: `app/traits/invoices/invoices-table-edit-traits.js`

### `CHANNEL_ACME_EDIT_SESSION_SELECTION_EVENT`

- **registers**: `app/channels/channel-acme-edit-session.js`
- **listens**: `app/components/elements/invoices-item-view.js`, `app/components/page-items/invoices-save-bar-view.js`
- **mentions**: `app/traits/invoices/invoices-table-edit-traits.js`

### `CHANNEL_ACME_INVOICES_CELLS_EVENT`

- **registers**: `app/channels/channel-acme-invoices.js`
- **emits**: `app/traits/db/db-invoices-channel-traits.js`
- **listens**: `app/components/elements/invoices-item-view.js`

### `CHANNEL_ACME_INVOICES_CREATE_EVENT`

- **registers**: `app/channels/channel-acme-invoices.js`
- **emits**: `app/traits/db/db-invoices-channel-traits.js`
- **listens**: `app/components/page-items/invoices-create-form-view.js`

### `CHANNEL_ACME_INVOICES_DISPLAY_EVENT`

- **registers**: `app/channels/channel-acme-invoices.js`
- **emits**: `app/traits/db/db-invoices-channel-traits.js`
- **listens**: `app/components/page-items/invoices-table-view.js`

### `CHANNEL_ACME_INVOICES_EDIT_EVENT`

- **registers**: `app/channels/channel-acme-invoices.js`
- **emits**: `app/traits/db/db-invoices-channel-traits.js`
- **listens**: `app/components/page-items/invoices-edit-form-view.js`

### `CHANNEL_ACME_INVOICES_LIST_EVENT`

- **registers**: `app/channels/channel-acme-invoices.js`
- **emits**: `app/traits/db/db-invoices-channel-traits.js`
- **listens**: `app/components/elements/invoices-pagination-items-view.js`, `app/components/page-items/invoices-pagination-container.js`
- **mentions**: `app/components/page-items/ui-search-view.js`

### `CHANNEL_ACME_INVOICES_NAVIGATE_EVENT`

- **registers**: `app/channels/channel-acme-invoices.js`
- **mentions**: `app/traits/db/db-invoices-channel-traits.js`, `app/traits/search/quick-search-overlay-traits.js`

### `CHANNEL_ACME_INVOICES_PAGINATION_EVENT`

- **registers**: `app/channels/channel-acme-invoices.js`
- **emits**: `app/traits/db/db-invoices-channel-traits.js`
- **listens**: `app/components/elements/invoices-pagination-items-view.js`, `app/components/page-items/invoices-pagination-container.js`

### `CHANNEL_ACME_INVOICES_STATUS_EVENT`

- **registers**: `app/channels/channel-acme-invoices.js`
- **emits**: `app/traits/db/db-invoices-channel-traits.js`
- **listens**: `app/components/elements/invoices-item-view.js`, `app/components/search/quick-search-invoice-item-view.js`

### `CHANNEL_ACME_INVOICES_UPDATE_PARAMS_EVENT`

- **registers**: `app/channels/channel-acme-invoices.js`
- **emits**: `app/traits/db/db-invoices-channel-traits.js`
- **listens**: `app/components/shell/null-views/acme-query-params-null-view.js`

### `CHANNEL_ACME_INVOICES_VISIBLE_IDS_EVENT`

- **registers**: `app/channels/channel-acme-invoices.js`
- **listens**: `app/components/elements/invoices-cell-editor-view.js`, `app/components/elements/invoices-item-view.js`, `app/components/page-items/invoices-table-view.js`
- **mentions**: `app/traits/db/db-invoices-channel-traits.js`, `app/traits/invoices/invoices-pagination-view-traits.js`

### `CHANNEL_ACME_SEARCH_CLOSE_EVENT`

- **registers**: `app/channels/channel-acme-search.js`
- **emits**: `app/traits/db/db-search-channel-traits.js`
- **listens**: `app/components/search/quick-search-overlay-view.js`

### `CHANNEL_ACME_SEARCH_OPEN_EVENT`

- **registers**: `app/channels/channel-acme-search.js`
- **emits**: `app/traits/db/db-search-channel-traits.js`
- **listens**: `app/components/search/quick-search-host-view.js`

### `CHANNEL_ACME_SEARCH_RESULTS_EVENT`

- **registers**: `app/channels/channel-acme-search.js`
- **emits**: `app/traits/db/db-search-channel-traits.js`
- **listens**: `app/components/search/quick-search-customer-item-view.js`, `app/components/search/quick-search-invoice-item-view.js`, `app/components/search/quick-search-overlay-view.js`

### `CHANNEL_ACME_SEARCH_SELECT_EVENT`

- **registers**: `app/channels/channel-acme-search.js`
- **mentions**: `app/traits/db/db-search-channel-traits.js`, `app/traits/search/quick-search-overlay-traits.js`

### `CHANNEL_ACME_SEARCH_UPDATE_INVOICE_PARAMS_EVENT`

- **registers**: `app/channels/channel-acme-search.js`
- **emits**: `app/traits/db/db-search-channel-traits.js`
- **listens**: `app/components/shell/null-views/acme-query-params-null-view.js`

### `CHANNEL_APP_INIT_EVENT`

- **registers**: `app/channels/channel-app.js`
- **listens**: `app/components/shell/stage-container.js`, `app/components/shell/ui-container.js`
- **mentions**: `app/traits/shell/app-status-traits.js`

### `CHANNEL_APP_PAGE_DATA_EVENT`

- **registers**: `app/channels/channel-app.js`
- **listens**: `app/components/shell/stage-container.js`, `app/components/shell/ui-container.js`
- **mentions**: `app/traits/shell/app-status-traits.js`

### `CHANNEL_APP_SETTING_EVENT`

- **registers**: `app/channels/channel-app.js`
- **emits**: `app/traits/shell/app-settings-traits.js`
- **listens**: `app/components/shell/app-container.js`
- **mentions**: `app/traits/shell/app-local-storage-traits.js`, `app/traits/shell/app-settings-traits.js`

### `CHANNEL_FETCH_ACME_API`

- **names**: `app/traits/db/db-connections-traits.js`
- **mentions**: `app/traits/db/db-auth-channel-traits.js`, `app/traits/db/db-data-channel-traits.js`

### `CHANNEL_FETCH_ACME_AUTH`

- **emits**: `app/traits/ui/form-login-traits.js`
- **names**: `app/traits/db/db-connections-traits.js`
- **mentions**: `app/traits/db/db-auth-channel-traits.js`

### `CHANNEL_FETCH_ACME_AUTH_REQUEST_EVENT`

- **mentions**: `app/traits/ui/form-login-traits.js`

### `CHANNEL_FETCH_ACME_SESSION`

- **names**: `app/traits/db/db-connections-traits.js`
- **mentions**: `app/traits/db/db-auth-channel-traits.js`

### `CHANNEL_FETCH_MODEL`

- **names**: `index.js`
- **mentions**: `app/traits/shell/app-status-traits.js`

### `CHANNEL_LOCAL_STORAGE_APP_SETTINGS_INITIALIZED_EVENT`

- **registers**: `app/channels/channel-local-storage.js`
- **listens**: `app/components/shell/app-container.js`
- **mentions**: `app/traits/shell/app-local-storage-traits.js`

### `CHANNEL_LOCAL_STORAGE_EMPTY_EVENT`

- **mentions**: `app/traits/shell/app-local-storage-traits.js`

### `CHANNEL_LOCAL_STORAGE_UPDATE_KEY_REQUEST`

- **registers**: `app/channels/channel-local-storage.js`

## Framework names in use

### `CHANNEL_ROUTE` *(framework)*

- **emits**: `app/traits/invoices/invoices-form-traits.js`
- **binds**: `app/components/elements/ui-nav-link-view.js`, `app/components/nav/nav-breadcrumb-item.js`, `app/components/nav/nav-breadcrumb-view.js`, `app/components/pages/page-404-view.js`, `app/components/pages/page-acme-view.js`, `app/components/pages/page-guest-view.js`, `app/components/shell/stage-container.js`, `app/components/shell/ui-sidenav-view.js`
- **mentions**: `app/traits/db/db-customers-channel-traits.js`, `app/traits/db/db-invoices-channel-traits.js`, `app/traits/db/db-search-channel-traits.js`, `app/traits/shell/app-status-traits.js`

### `CHANNEL_ROUTE_CHANGE_EVENT` *(framework)*

- **listens**: `app/components/elements/ui-nav-link-view.js`, `app/components/pages/page-404-view.js`, `app/components/pages/page-acme-view.js`, `app/components/pages/page-guest-view.js`
- **mentions**: `app/traits/db/db-customers-channel-traits.js`, `app/traits/db/db-invoices-channel-traits.js`, `app/traits/db/db-search-channel-traits.js`, `app/traits/shell/app-status-traits.js`

### `CHANNEL_ROUTE_DEEPLINK_EVENT` *(framework)*

- **listens**: `app/components/elements/ui-nav-link-view.js`, `app/components/nav/nav-breadcrumb-view.js`, `app/components/shell/ui-sidenav-view.js`

### `CHANNEL_UI` *(framework)*

- **binds**: `app/components/elements/invoices-cell-editor-view.js`, `app/components/page-items/invoices-create-form-view.js`, `app/components/page-items/invoices-edit-form-view.js`, `app/components/page-items/invoices-table-view.js`, `app/components/page-items/login-form-view.js`
- **mentions**: `app/traits/db/db-auth-channel-traits.js`, `app/traits/db/db-customers-channel-traits.js`, `app/traits/db/db-data-channel-traits.js`, `app/traits/db/db-invoices-channel-traits.js`, `app/traits/db/db-search-channel-traits.js`, `app/traits/shell/app-settings-traits.js`

### `CHANNEL_UI_BLUR_EVENT` *(framework)*

- **listens**: `app/components/elements/invoices-cell-editor-view.js`

### `CHANNEL_UI_CHANGE_EVENT` *(framework)*

- **listens**: `app/components/elements/invoices-cell-editor-view.js`

### `CHANNEL_UI_CLICK_EVENT` *(framework)*

- **listens**: `app/components/page-items/invoices-table-view.js`
- **mentions**: `app/traits/shell/app-settings-traits.js`

### `CHANNEL_UI_KEYDOWN_EVENT` *(framework)*

- **listens**: `app/components/elements/invoices-cell-editor-view.js`

### `CHANNEL_UI_SUBMIT_EVENT` *(framework)*

- **listens**: `app/components/page-items/invoices-create-form-view.js`, `app/components/page-items/invoices-edit-form-view.js`, `app/components/page-items/login-form-view.js`

### `CHANNEL_WINDOW` *(framework)*

- **binds**: `app/components/page-items/invoices-table-view.js`, `app/components/search/quick-search-overlay-view.js`
- **mentions**: `app/traits/db/db-customers-channel-traits.js`, `app/traits/db/db-edits-channel-traits.js`, `app/traits/db/db-invoices-channel-traits.js`, `app/traits/db/db-search-channel-traits.js`

### `CHANNEL_WINDOW_KEYDOWN_EVENT` *(framework)*

- **listens**: `app/components/page-items/invoices-table-view.js`, `app/components/search/quick-search-overlay-view.js`
- **mentions**: `app/traits/db/db-edits-channel-traits.js`, `app/traits/db/db-search-channel-traits.js`

### `CHANNEL_WINDOW_POPSTATE_EVENT` *(framework)*

- **mentions**: `app/traits/db/db-customers-channel-traits.js`, `app/traits/db/db-invoices-channel-traits.js`

## Findings

- unresolved: `app/channels/channel-local-storage.js` — 'CHANNEL_LOCAL_STORAGE_UPDATE_KEY_REQUEST' is registered but nothing listens for it or mentions it
