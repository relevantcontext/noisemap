import { SpyneTrait, ViewStream } from 'spyne';

export class MenuViewTraits extends SpyneTrait {
  constructor(context) {
    super(context, 'menuView$');
  }

  static menuView$SetActiveLink(e) {
    this.appendView(new ViewStream({ tagName: 'em', data: e.payload.path }));
  }

  static menuView$Log(tag) {
    console.log(tag);
  }
}
