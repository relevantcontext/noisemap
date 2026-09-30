import { memo } from 'react';
import { Square } from './Square';
import { Orphan } from './Orphan';

export const Board = memo(function Board({ onPlay }: { onPlay: (i: number) => void }) {
  return (
    <div>
      <Square onSquareClick={() => onPlay(1)} />
      <Square onSquareClick={onPlay} />
      <Orphan />
    </div>
  );
});
