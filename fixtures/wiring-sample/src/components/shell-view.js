import { ViewStream } from 'spyne';

export class ShellView extends ViewStream {
  constructor(props = {}) {
    props.tagName = 'main';
    super(props);
  }
  broadcastEvents() {
    return [['.child-supplied', 'click']];
  }
}
