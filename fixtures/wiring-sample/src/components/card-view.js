import { ViewStream } from 'spyne';
import CardTmpl from './card.tmpl.html';

export class CardView extends ViewStream {
  constructor(props = {}) {
    props.tagName = 'section';
    props.data = { title: 'Card', items: [] };
    props.template = CardTmpl;
    super(props);
  }
  broadcastEvents() {
    return [['.card .title', 'click'], ['.card .sibling', 'click'], ['.card > .sibling', 'click'], ['.title + .sibling', 'click']];
  }
}
