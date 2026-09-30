# Vocabulary — todos-spynejs/src

7 names the app declares, 2 from the framework. Roles: SpyneJS — registers (addRegisteredActions), emits (sendChannelPayload), listens (addActionListeners, patterns expanded), binds (props.channels), names (a Channel class), mentions (payload filters, comparisons, constants). React — actions: registers (a reducer case), emits (dispatch); contexts: names (createContext), emits (a Provider), listens (useContext); routes: names (a page or route file), emits (href, push, redirect); handler props: listens (a component declares the prop), emits (a parent passes it).

## Channels

### `CHANNEL_FETCH_TODO_LIST`

- **binds**: `app/components/todo-list-view.js`
- **names**: `index.js`

## Actions

### `CHANNEL_FETCH_TODO`

- **emits**: `app/traits/todo-traits.js`
- **binds**: `app/components/todo-item-view.js`, `app/components/todo-list-view.js`
- **names**: `index.js`

### `CHANNEL_FETCH_TODO_ERROR_EVENT`

- **listens**: `app/components/todo-item-view.js`, `app/components/todo-list-view.js`

### `CHANNEL_FETCH_TODO_LIST_ERROR_EVENT`

- **listens**: `app/components/todo-list-view.js`

### `CHANNEL_FETCH_TODO_LIST_RESPONSE_EVENT`

- **listens**: `app/components/todo-list-view.js`

### `CHANNEL_FETCH_TODO_REQUEST_EVENT`

- **mentions**: `app/traits/todo-traits.js`

### `CHANNEL_FETCH_TODO_RESPONSE_EVENT`

- **listens**: `app/components/todo-item-view.js`, `app/components/todo-list-view.js`

## Framework names in use

### `CHANNEL_UI` *(framework)*

- **binds**: `app/components/todo-item-view.js`, `app/components/todo-list-view.js`

### `CHANNEL_UI_CLICK_EVENT` *(framework)*

- **listens**: `app/components/todo-item-view.js`, `app/components/todo-list-view.js`

## Findings

None.

