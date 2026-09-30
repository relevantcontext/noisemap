import { useContext, useState } from 'react';
import { Ctx } from '@/traits/helper';
import { Button } from './Button';

export function Panel({ onSave, ...rest }: any) {
  const theme = useContext(Ctx);
  const [count, setCount] = useState(0);
  const handlers: Record<string, () => void> = {};
  return (
    <div onClick={() => setCount(count + 1)}>
      <Button label="ok" onPress={onSave} onClose={handlers[theme]} {...rest} />
    </div>
  );
}
