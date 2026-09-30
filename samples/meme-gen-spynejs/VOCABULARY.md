# Vocabulary — meme-gen-spynejs/src

4 names the app declares, 0 from the framework. Roles: SpyneJS — registers (addRegisteredActions), emits (sendChannelPayload), listens (addActionListeners, patterns expanded), binds (props.channels), names (a Channel class), mentions (payload filters, comparisons, constants). React — actions: registers (a reducer case), emits (dispatch); contexts: names (createContext), emits (a Provider), listens (useContext); routes: names (a page or route file), emits (href, push, redirect); handler props: listens (a component declares the prop), emits (a parent passes it).

## Channels

### `CHANNEL_MEME_GENERATOR`

- **binds**: `app/app-view.js`
- **names**: `app/channels/channel-meme-generator.js`

## Actions

### `CHANNEL_MEME_GENERATOR_UPDATE_EVENT`

- **registers**: `app/channels/channel-meme-generator.js`
- **emits**: `app/traits/meme-generator-traits.js`
- **listens**: `app/app-view.js`

### `CHANNEL_MEME_IMG`

- **names**: `index.js`
- **mentions**: `app/traits/meme-generator-traits.js`

### `CHANNEL_MEME_TXT`

- **names**: `index.js`
- **mentions**: `app/traits/meme-generator-traits.js`

## Findings

None.

