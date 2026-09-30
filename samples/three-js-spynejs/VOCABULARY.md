# Vocabulary — three-js-spynejs/src

4 names the app declares, 8 from the framework. Roles: SpyneJS — registers (addRegisteredActions), emits (sendChannelPayload), listens (addActionListeners, patterns expanded), binds (props.channels), names (a Channel class), mentions (payload filters, comparisons, constants). React — actions: registers (a reducer case), emits (dispatch); contexts: names (createContext), emits (a Provider), listens (useContext); routes: names (a page or route file), emits (href, push, redirect); handler props: listens (a component declares the prop), emits (a parent passes it).

## Channels

### `CHANNEL_THREEJS`

- **emits**: `app/traits/threejs-traits.js`
- **binds**: `app/components/callout-view-item.js`, `app/components/callout-view.js`, `app/components/threejs-view.js`
- **names**: `app/channels/channel-threejs.js`

## Actions

### `CHANNEL_THREEJS_ANGLE_CHANGE_EVENT`

- **registers**: `app/channels/channel-threejs.js`
- **listens**: `app/components/callout-view-item.js`, `app/components/callout-view.js`
- **mentions**: `app/traits/threejs-traits.js`

### `CHANNEL_THREEJS_END_ANIMATION_EVENT`

- **registers**: `app/channels/channel-threejs.js`
- **listens**: `app/components/threejs-view.js`
- **mentions**: `app/traits/threejs-channel-traits.js`

### `CHANNEL_THREEJS_START_ANIMATION_EVENT`

- **registers**: `app/channels/channel-threejs.js`
- **listens**: `app/components/threejs-view.js`
- **mentions**: `app/traits/threejs-channel-traits.js`

## Framework names in use

### `CHANNEL_UI` *(framework)*

- **mentions**: `app/traits/threejs-channel-traits.js`

### `CHANNEL_UI_MOUSEDOWN_EVENT` *(framework)*

- **mentions**: `app/traits/threejs-channel-traits.js`

### `CHANNEL_UI_MOUSEUP_EVENT` *(framework)*

- **mentions**: `app/traits/threejs-channel-traits.js`

### `CHANNEL_UI_TOUCHEND_EVENT` *(framework)*

- **mentions**: `app/traits/threejs-channel-traits.js`

### `CHANNEL_UI_TOUCHSTART_EVENT` *(framework)*

- **mentions**: `app/traits/threejs-channel-traits.js`

### `CHANNEL_WINDOW` *(framework)*

- **binds**: `app/components/threejs-view.js`
- **mentions**: `app/traits/threejs-channel-traits.js`

### `CHANNEL_WINDOW_RESIZE_EVENT` *(framework)*

- **listens**: `app/components/threejs-view.js`

### `CHANNEL_WINDOW_WHEEL_EVENT` *(framework)*

- **mentions**: `app/traits/threejs-channel-traits.js`

## Findings

- unresolved: `app/traits/threejs-channel-traits.js` — import 'rxjs' does not resolve to a file or a package
- unresolved: `app/traits/utils/angle-utils.js` — import 'ramda' does not resolve to a file or a package
- ambiguous: `app/components/threejs-view.js` — ThreejsView names method 'threejs$OnStartAnimation' defined in a trait it does not bind
- ambiguous: `app/components/threejs-view.js` — ThreejsView names method 'threejs$OnEndAnimation' defined in a trait it does not bind
- ambiguous: `app/components/threejs-view.js` — ThreejsView names method 'threejs$onWindowResize' defined in a trait it does not bind
