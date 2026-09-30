import { useContext } from 'react';
import { Lonely } from './state/ctx';
export function LonelyUser() { return <span>{String(useContext(Lonely))}</span>; }
