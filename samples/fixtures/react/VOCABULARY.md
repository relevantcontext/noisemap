# Vocabulary — react/src

0 names the app declares, 0 from the framework. Roles: SpyneJS — registers (addRegisteredActions), emits (sendChannelPayload), listens (addActionListeners, patterns expanded), binds (props.channels), names (a Channel class), mentions (payload filters, comparisons, constants). React — actions: registers (a reducer case), emits (dispatch); contexts: names (createContext), emits (a Provider), listens (useContext); routes: names (a page or route file), emits (href, push, redirect); handler props: listens (a component declares the prop), emits (a parent passes it).

## Findings

- unresolved: `components/Styled.tsx` — import 'styled-components' does not resolve to a file or a package
- unresolved: `components/Legacy.jsx` — onClick on <button>: member 'this.toggle' is not a prop or a local
