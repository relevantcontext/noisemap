# Vocabulary — todos-react/src

9 names the app declares, 0 from the framework. Roles: SpyneJS — registers (addRegisteredActions), emits (sendChannelPayload), listens (addActionListeners, patterns expanded), binds (props.channels), names (a Channel class), mentions (payload filters, comparisons, constants). React — actions: registers (a reducer case), emits (dispatch); contexts: names (createContext), emits (a Provider), listens (useContext); routes: names (a page or route file), emits (href, push, redirect); handler props: listens (a component declares the prop), emits (a parent passes it).

## Actions

### `ADD_ITEM`

- **registers**: `todo/reducer.js`
- **emits**: `todo/components/header.jsx`

### `REMOVE_ALL_ITEMS`

- **registers**: `todo/reducer.js`

### `REMOVE_COMPLETED_ITEMS`

- **registers**: `todo/reducer.js`
- **emits**: `todo/components/footer.jsx`

### `REMOVE_ITEM`

- **registers**: `todo/reducer.js`
- **emits**: `todo/components/item.jsx`

### `TOGGLE_ALL`

- **registers**: `todo/reducer.js`
- **emits**: `todo/components/main.jsx`

### `TOGGLE_ITEM`

- **registers**: `todo/reducer.js`
- **emits**: `todo/components/item.jsx`

### `UPDATE_ITEM`

- **registers**: `todo/reducer.js`
- **emits**: `todo/components/item.jsx`

## Handler props

### `onBlur`

- **emits**: `todo/components/item.jsx`
- **listens**: `todo/components/input.jsx`

### `onSubmit`

- **emits**: `todo/components/header.jsx`, `todo/components/item.jsx`
- **listens**: `todo/components/input.jsx`

## Findings

- unresolved: `todo/reducer.js` — reducer handles 'REMOVE_ALL_ITEMS' but nothing dispatches it
