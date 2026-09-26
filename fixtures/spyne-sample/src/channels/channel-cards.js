import { Channel } from 'spyne';
import { CardsTraits } from '../traits/cards-traits.js';

export class ChannelCards extends Channel {
  constructor(name, props = {}) {
    name = 'CHANNEL_CARDS';
    props.sendCachedPayload = true;
    props.traits = [CardsTraits];
    super(name, props);
  }

  onRegistered() {
    this.getChannel('CHANNEL_ROUTE').subscribe((p) => this.onRoute(p));
    this.cards$Init();
  }

  addRegisteredActions() {
    return ['CHANNEL_CARDS_SORT_EVENT', ['CHANNEL_CARDS_LOAD_EVENT', 'onLoad']];
  }

  onRoute(p) {
    const sorted = this.cards$Sort(p.payload.cards, 'title');
    this.sendChannelPayload('CHANNEL_CARDS_SORT_EVENT', { cards: sorted });
  }

  onViewStreamInfo() {}
}
