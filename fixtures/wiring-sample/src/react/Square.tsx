import { useContext } from 'react';
import { Ctx } from './state/ctx';
export function Square({ onSquareClick }: { onSquareClick: () => void }) {
  const ctx = useContext(Ctx);
  return <button onClick={onSquareClick}>{String(ctx)}</button>;
}
