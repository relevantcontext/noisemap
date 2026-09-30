import { Channel } from 'spyne';
import { ShopTraits } from 'traits/shop-traits.js';

const DONE = 'CHANNEL_SHOP_DONE_EVENT';

export class ChannelShop extends Channel {
  constructor(name, props = {}) {
    name = 'CHANNEL_SHOP';
    props.traits = [ShopTraits];
    super(name, props);
  }
  onRegistered() {
    this.shop$Init();
  }
  addRegisteredActions() {
    return ['CHANNEL_SHOP_CART_EVENT', 'CHANNEL_SHOP_ORPHAN_EVENT', ['CHANNEL_SHOP_REQUEST', 'shop$OnRequest']];
  }
  onRequest(action) {
    this.sendChannelPayload(DONE, {});
    this.sendChannelPayload(action, {});
    this.sendChannelPayload('CHANNEL_SHOP_CART_EVENT', {});
  }
}
