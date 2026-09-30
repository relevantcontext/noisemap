import { ViewStream } from 'spyne';
import TileTmpl from './tile.tmpl.html';

export class TileView extends ViewStream {
  constructor(props = {}) {
    props.data = { label: 'Tile' };
    props.data.count = 0;
    props.template = TileTmpl;
    super(props);
  }
}
