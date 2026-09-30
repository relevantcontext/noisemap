import { ViewStream } from 'spyne';
import MenuTmpl from './menu.tmpl.html';
import { MenuTraits } from 'traits/menu-traits.js';

export class MenuView extends ViewStream {
  constructor(props = {}) {
    props.tagName = 'nav';
    props.class = 'menu-root';
    props.channels = ['CHANNEL_ROUTE', ['CHANNEL_UI', true], 'CHANNEL_SHOP', 'CHANNEL_GHOST'];
    props.traits = [MenuTraits];
    props.template = MenuTmpl;
    super(props);
  }
  addActionListeners() {
    return [
      ['CHANNEL_ROUTE_CHANGE_EVENT', 'menu$OnRoute'],
      ['CHANNEL_SHOP_CART_EVENT', 'menu$OnCart'],
      ['CHANNEL_SHOP_LOST_EVENT', 'menu$Missing'],
      ['CHANNEL_UI_*', 'onUi'],
      ['CHANNEL_SHOP_.*_EVENT', 'disposeViewStream'],
      ['CHANNEL_UI_CLICK_EVENT', computed()],
    ];
  }
  broadcastEvents() {
    return [['a.item', 'click'], ['[data-qs-dismiss]', 'click'], ['.zoom', 'click'], ['nav.menu-root', 'keyup']];
  }
  onUi() {}
  onRendered() {
    this.menu$Init();
    this[this.props.hook]();
  }
}
