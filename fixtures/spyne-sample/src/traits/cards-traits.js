import { SpyneTrait } from 'spyne';

export class CardsTraits extends SpyneTrait {
  constructor(context) {
    super(context, 'cards$');
  }

  static cards$Init() {
    return { cards: [] };
  }

  static cards$Sort(cards, key) {
    return [...cards].sort((a, b) => (a[key] < b[key] ? -1 : 1));
  }
}
