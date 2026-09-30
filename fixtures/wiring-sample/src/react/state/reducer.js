import { ADD_ITEM, REMOVE_ITEM, NEVER_DISPATCHED } from './constants';
export default function reducer(state = [], action) {
  switch (action.type) {
    case ADD_ITEM: return [...state, action.payload];
    case REMOVE_ITEM: return state.filter((x) => x !== action.payload);
    case NEVER_DISPATCHED: return state;
    default: return state;
  }
}
