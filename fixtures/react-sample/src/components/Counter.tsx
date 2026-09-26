import { useCallback, useEffect, useState } from 'react';
import type { FC } from 'react';

interface CounterProps {
  initial: number;
  label: string;
}

/** A counter. */
export const Counter: FC<CounterProps> = ({ initial, label }) => {
  const [count, setCount] = useState(initial);
  const doubled = useMemo(() => count * 2, [count]);

  useEffect(() => {
    document.title = `${label}: ${count}`;
  }, [count, label]);

  const handleReset = useCallback(() => {
    setCount(initial);
  }, [initial]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') setCount(count + 1);
  }

  return (
    <div className="counter" style={{ padding: 8 }} onKeyDown={handleKey}>
      <h2 title="Current count for this widget">{label}</h2>
      <p>You have clicked {count} times, doubled is {doubled}.</p>
      {count > 10 && <em>That is a lot of clicks</em>}
      <button onClick={() => setCount((c) => c + 1)}>Add one</button>
      <button onClick={handleReset}>Reset</button>
    </div>
  );
};
