import {SpyneTrait} from 'spyne';export class PayloadPrefixed extends SpyneTrait{static payload$Read(e){return e.payload.name;}}
