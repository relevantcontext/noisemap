# Vocabulary — spyne/src

3 names the app declares, 2 from the framework. Roles: SpyneJS — registers (addRegisteredActions), emits (sendChannelPayload), listens (addActionListeners, patterns expanded), binds (props.channels), names (a Channel class), mentions (payload filters, comparisons, constants). React — actions: registers (a reducer case), emits (dispatch); contexts: names (createContext), emits (a Provider), listens (useContext); routes: names (a page or route file), emits (href, push, redirect); handler props: listens (a component declares the prop), emits (a parent passes it).

## Channels

### `CHANNEL_CARDS`

- **names**: `channels/channel-cards.js`

## Actions

### `CHANNEL_CARDS_LOAD_EVENT`

- **registers**: `channels/channel-cards.js`

### `CHANNEL_CARDS_SORT_EVENT`

- **registers**: `channels/channel-cards.js`
- **emits**: `channels/channel-cards.js`

## Framework names in use

### `CHANNEL_ROUTE` *(framework)*

- **binds**: `components/menu-view.js`
- **mentions**: `channels/channel-cards.js`

### `CHANNEL_ROUTE_CHANGE_EVENT` *(framework)*

- **listens**: `components/menu-view.js`

## Findings

- unresolved: `components/menu-view.js` — import './menu.tmpl.html' does not resolve to a file or a package
- unresolved: `channels/channel-cards.js` — ChannelCards names method 'onLoad' that neither it nor a bound trait defines
- unresolved: `components/menu-view.js` — MenuView broadcasts on 'a' but its template has no element matching it (child views may supply one)
- unresolved: `components/menu-view.js` — MenuView broadcasts on '.close' but its template has no element matching it (child views may supply one)
- unresolved: `channels/channel-cards.js` — 'CHANNEL_CARDS_SORT_EVENT' is registered but nothing listens for it or mentions it
- unresolved: `channels/channel-cards.js` — 'CHANNEL_CARDS_LOAD_EVENT' is registered but nothing listens for it or mentions it
