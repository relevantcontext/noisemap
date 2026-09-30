import { useState } from 'react';
import { Board } from './Board';
import { Ctx } from './state/ctx';
import { ADD_ITEM, REMOVE_ITEM } from './state/constants';
import reducer from './state/reducer';
import Link from 'next/link';

import { useActionState } from 'react';
import { saveGame } from './state/actions';
function useUndo() { return { undo: () => {} }; }
function kind(x: { kind: string }) { switch (x.kind) { case 'a': return 1; default: return 0; } }
export default function Game() {
  const [, formAction] = useActionState(saveGame, null);
  const { undo } = useUndo();
  kind({ kind: 'a' });
  const [moves, setMoves] = useState<number[]>([]);
  function handlePlay(i: number) { setMoves([...moves, i]); }
  const dispatch = (a: unknown) => reducer(undefined, a);
  dispatch({ type: ADD_ITEM });
  dispatch({ type: 'NOT_HANDLED' });
  return (
    <Ctx.Provider value={{ moves }}>
      <Board onPlay={handlePlay} />
      <form action={formAction}><button onClick={undo}>undo</button></form>
      <Link href="/orders/42">order</Link>
      <Link href="/nowhere">nowhere</Link>
    </Ctx.Provider>
  );
}
