import { DomElement } from 'spyne';

export class BareItem extends DomElement {
  constructor(props = {}) {
    props.tagName = 'li';
    props.class = 'bare';
    props.template = '<span>{{label}}</span>';
    super(props);
  }
}
