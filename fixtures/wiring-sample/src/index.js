import { SpyneApp } from 'spyne';
import { MenuView } from 'components/menu-view.js';
import { helper } from '@/traits/helper';
import missing from './nowhere';
import 'styles/main.scss';

new SpyneApp({ channels: [] });
new MenuView();
helper();
