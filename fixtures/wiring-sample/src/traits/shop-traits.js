import { SpyneTrait, ChannelPayloadFilter } from 'spyne';
export class ShopTraits extends SpyneTrait {
  static shop$Init() {}
  static shop$OnRequest() {}
  static shop$Listen() {
    return new ChannelPayloadFilter({ action: 'CHANNEL_SHOP_ORPHAN_EVENT' });
  }
}
