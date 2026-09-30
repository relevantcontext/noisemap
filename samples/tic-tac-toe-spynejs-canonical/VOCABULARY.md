# Vocabulary — tic-tac-toe-spynejs-canonical/src

3 names the app declares, 1 from the framework. Roles: SpyneJS — registers (addRegisteredActions), emits (sendChannelPayload), listens (addActionListeners, patterns expanded), binds (props.channels), names (a Channel class), mentions (payload filters, comparisons, constants). React — actions: registers (a reducer case), emits (dispatch); contexts: names (createContext), emits (a Provider), listens (useContext); routes: names (a page or route file), emits (href, push, redirect); handler props: listens (a component declares the prop), emits (a parent passes it).

## Channels

### `CHANNEL_TIC_TAC_TOE`

- **binds**: `app/components/tic-tac-toe-game.js`, `app/components/tic-tac-toe-move-btn.js`
- **names**: `app/channels/channel-tic-tac-toe.js`

## Actions

### `CHANNEL_TIC_TAC_TOE_MOVE_CHANGE_EVENT`

- **registers**: `app/channels/channel-tic-tac-toe.js`
- **listens**: `app/components/tic-tac-toe-game.js`

### `CHANNEL_TIC_TAC_TOE_SQUARE_CHANGE_EVENT`

- **registers**: `app/channels/channel-tic-tac-toe.js`
- **listens**: `app/components/tic-tac-toe-game.js`, `app/components/tic-tac-toe-move-btn.js`
- **mentions**: `app/traits/game-channel-traits.js`

## Framework names in use

### `CHANNEL_UI` *(framework)*

- **mentions**: `app/channels/channel-tic-tac-toe.js`

## Findings

None.

