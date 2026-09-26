import { ViewStream, ChannelPayloadFilter } from 'spyne';
import MenuTmpl from './menu.tmpl.html';
import { MenuViewTraits } from '../traits/menu-view-traits.js';

export class MenuView extends ViewStream {
  constructor(props = {}) {
    props.id = 'menu';
    props.tagName = 'nav';
    props.channels = ['CHANNEL_ROUTE'];
    props.traits = [MenuViewTraits];
    props.template = MenuTmpl;
    props.limit = props.data?.limit ?? 10;
    props.sort = props.data?.sort ?? this.menuView$DefaultSort();
    props.title = props.data?.title ?? this.computeTitle();
    super(props);
  }

  addActionListeners() {
    const filter = new ChannelPayloadFilter('.item', { isOpen: (v) => v === true });
    return [
      ['CHANNEL_ROUTE_CHANGE_EVENT', 'menuView$SetActiveLink', filter],
      ['CHANNEL_UI_*', 'onUiEvent'],
    ];
  }

  broadcastEvents() {
    return [['a', 'click'], ['.close', 'click']];
  }

  onRendered() {
    this.appendView(new ViewStream({ tagName: 'p', data: 'Menu ready to use' }));
    this.menuView$SetActiveLink({ payload: { path: '/' } });
    if (this.props.channels.length > 1) {
      this.menuView$Log('multi');
    }
  }

  onUiEvent(e) {
    const count = e.payload.items.filter((i) => i.active).length;
    this.el.classList.toggle('busy', count > 3);
  }
}
