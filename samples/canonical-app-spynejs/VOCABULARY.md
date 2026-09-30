# Vocabulary — canonical-app-spynejs/src

13 names the app declares, 6 from the framework. Roles: SpyneJS — registers (addRegisteredActions), emits (sendChannelPayload), listens (addActionListeners, patterns expanded), binds (props.channels), names (a Channel class), mentions (payload filters, comparisons, constants). React — actions: registers (a reducer case), emits (dispatch); contexts: names (createContext), emits (a Provider), listens (useContext); routes: names (a page or route file), emits (href, push, redirect); handler props: listens (a component declares the prop), emits (a parent passes it).

## Channels

### `CHANNEL_APP`

- **binds**: `app/app-container.js`, `app/components/nav/nav-breadcrumb-container.js`, `app/components/nav/nav-primary-view.js`, `app/components/stage-container.js`, `app/components/ui-elements/ui-footer-view.js`, `app/components/ui-elements/ui-header-view.js`
- **names**: `app/channels/channel-app.js`
- **mentions**: `app/traits/app/app-local-storage-traits.js`, `app/traits/channel/channel-menu-drawer-traits.js`

### `CHANNEL_LOCAL_STORAGE`

- **emits**: `app/traits/app/app-local-storage-traits.js`
- **binds**: `app/app-container.js`, `app/components/nav/nav-primary-view.js`, `app/components/ui-elements/null-views/local-storage-null-view.js`
- **names**: `app/channels/channel-local-storage.js`

### `CHANNEL_MENU_DRAWER`

- **binds**: `app/components/nav/nav-header-hamburger-item.js`, `app/components/ui-elements/ui-menu-drawer-view.js`
- **names**: `app/channels/channel-menu-drawer.js`

## Actions

### `CHANNEL_APP_INIT_EVENT`

- **registers**: `app/channels/channel-app.js`
- **listens**: `app/components/nav/nav-breadcrumb-container.js`, `app/components/nav/nav-primary-view.js`, `app/components/stage-container.js`, `app/components/ui-elements/ui-footer-view.js`, `app/components/ui-elements/ui-header-view.js`
- **mentions**: `app/traits/app/app-status-traits.js`, `app/traits/channel/channel-menu-drawer-traits.js`

### `CHANNEL_APP_PAGE_DATA_EVENT`

- **registers**: `app/channels/channel-app.js`
- **listens**: `app/components/nav/nav-primary-view.js`, `app/components/stage-container.js`
- **mentions**: `app/traits/app/app-status-traits.js`

### `CHANNEL_APP_SETTING_EVENT`

- **registers**: `app/channels/channel-app.js`
- **emits**: `app/traits/app/app-settings-traits.js`
- **listens**: `app/app-container.js`, `app/components/nav/nav-primary-view.js`
- **mentions**: `app/traits/app/app-local-storage-traits.js`, `app/traits/app/app-settings-traits.js`

### `CHANNEL_FETCH_MODEL`

- **names**: `index.js`
- **mentions**: `app/traits/app/app-status-traits.js`

### `CHANNEL_LOCAL_STORAGE_APP_SETTINGS_INITIALIZED_EVENT`

- **registers**: `app/channels/channel-local-storage.js`
- **listens**: `app/app-container.js`, `app/components/nav/nav-primary-view.js`
- **mentions**: `app/traits/app/app-local-storage-traits.js`

### `CHANNEL_LOCAL_STORAGE_EMPTY_EVENT`

- **mentions**: `app/traits/app/app-local-storage-traits.js`

### `CHANNEL_LOCAL_STORAGE_UPDATE_KEY_REQUEST`

- **registers**: `app/channels/channel-local-storage.js`

### `CHANNEL_MENU_DRAWER__HIDE_EVENT`

- **registers**: `app/channels/channel-menu-drawer.js`
- **listens**: `app/components/nav/nav-header-hamburger-item.js`, `app/components/ui-elements/ui-menu-drawer-view.js`
- **mentions**: `app/traits/channel/channel-menu-drawer-traits.js`

### `CHANNEL_MENU_DRAWER__SHOW_EVENT`

- **registers**: `app/channels/channel-menu-drawer.js`
- **listens**: `app/components/nav/nav-header-hamburger-item.js`, `app/components/ui-elements/ui-menu-drawer-view.js`
- **mentions**: `app/traits/channel/channel-menu-drawer-traits.js`, `app/traits/nav/nav-header-hamburger-item-traits.js`, `app/traits/ui/ui-menu-drawer-view-traits.js`

### `CHANNEL_MENU_DRAWER_INIT_EVENT`

- **registers**: `app/channels/channel-menu-drawer.js`
- **emits**: `app/traits/channel/channel-menu-drawer-traits.js`
- **listens**: `app/components/nav/nav-header-hamburger-item.js`, `app/components/ui-elements/ui-menu-drawer-view.js`
- **mentions**: `app/traits/channel/channel-menu-drawer-traits.js`

## Framework names in use

### `CHANNEL_ROUTE` *(framework)*

- **binds**: `app/components/nav/nav-breadcrumb-container.js`, `app/components/nav/nav-breadcrumb-view.js`, `app/components/nav/nav-menu-drawer-view.js`, `app/components/nav/nav-primary-view.js`, `app/components/pages/page-404-view.js`, `app/components/pages/page-view.js`, `app/components/stage-container.js`
- **mentions**: `app/traits/app/app-status-traits.js`

### `CHANNEL_ROUTE_CHANGE_EVENT` *(framework)*

- **listens**: `app/components/nav/nav-menu-drawer-view.js`, `app/components/pages/page-404-view.js`, `app/components/pages/page-view.js`
- **mentions**: `app/traits/app/app-status-traits.js`

### `CHANNEL_UI` *(framework)*

- **binds**: `app/components/page-items/form-contact-us-view.js`
- **mentions**: `app/traits/app/app-settings-traits.js`, `app/traits/channel/channel-menu-drawer-traits.js`

### `CHANNEL_UI_CLICK_EVENT` *(framework)*

- **mentions**: `app/traits/app/app-settings-traits.js`

### `CHANNEL_UI_SUBMIT_EVENT` *(framework)*

- **listens**: `app/components/page-items/form-contact-us-view.js`

### `CHANNEL_WINDOW` *(framework)*

- **mentions**: `app/traits/channel/channel-menu-drawer-traits.js`

## Findings

- unresolved: `app/components/pages/page-view.js` — PageView broadcasts on 'a' but its template has no element matching it (child views may supply one)
- unresolved: `app/channels/channel-local-storage.js` — 'CHANNEL_LOCAL_STORAGE_UPDATE_KEY_REQUEST' is registered but nothing listens for it or mentions it
