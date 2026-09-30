# Vocabulary — tour-of-heroes-spynejs/src

6 names the app declares, 4 from the framework. Roles: SpyneJS — registers (addRegisteredActions), emits (sendChannelPayload), listens (addActionListeners, patterns expanded), binds (props.channels), names (a Channel class), mentions (payload filters, comparisons, constants). React — actions: registers (a reducer case), emits (dispatch); contexts: names (createContext), emits (a Provider), listens (useContext); routes: names (a page or route file), emits (href, push, redirect); handler props: listens (a component declares the prop), emits (a parent passes it).

## Channels

### `CHANNEL_TOH`

- **binds**: `app/components/page-components/page-dashboard-search-component.js`, `app/components/page-components/page-dashboard-search-item.js`, `app/components/stage-view.js`
- **names**: `app/channels/channel-toh.js`
- **mentions**: `app/components/page-components/page-heroes-item-component.js`, `app/components/stage-messages-component.js`, `app/traits/toh-page-traits.js`

## Actions

### `CHANNEL_TOH_ADD_EVENT`

- **registers**: `app/channels/channel-toh.js`
- **listens**: `app/components/page-components/page-heroes-view.js`, `app/components/stage-messages-component.js`

### `CHANNEL_TOH_DELETE_EVENT`

- **registers**: `app/channels/channel-toh.js`
- **listens**: `app/components/page-components/page-heroes-item-component.js`, `app/components/stage-messages-component.js`

### `CHANNEL_TOH_ROUTE_EVENT`

- **registers**: `app/channels/channel-toh.js`
- **emits**: `app/traits/toh-channel-traits.js`
- **listens**: `app/components/stage-messages-component.js`, `app/components/stage-view.js`
- **mentions**: `app/traits/toh-page-traits.js`

### `CHANNEL_TOH_SEARCH_EVENT`

- **registers**: `app/channels/channel-toh.js`
- **listens**: `app/components/page-components/page-dashboard-search-component.js`, `app/components/page-components/page-dashboard-search-item.js`, `app/components/stage-messages-component.js`

### `CHANNEL_TOH_UPDATE_EVENT`

- **registers**: `app/channels/channel-toh.js`
- **listens**: `app/components/page-components/page-hero-view.js`, `app/components/stage-messages-component.js`

## Framework names in use

### `CHANNEL_ROUTE` *(framework)*

- **mentions**: `app/channels/channel-toh.js`

### `CHANNEL_UI` *(framework)*

- **mentions**: `app/channels/channel-toh.js`, `app/components/page-components/page-hero-view.js`, `app/components/stage-messages-component.js`

### `CHANNEL_UI_CLICK_EVENT` *(framework)*

- **listens**: `app/components/page-components/page-hero-view.js`, `app/components/stage-messages-component.js`

### `CHANNEL_UI_INPUT_EVENT` *(framework)*

- **listens**: `app/components/page-components/page-hero-view.js`

## Findings

None.

