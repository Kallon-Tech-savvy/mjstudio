import { useCallback, useEffect, useRef } from "react";

/** Retry explicitly and ignore responses from superseded requests or routes. */
export function useRetryableLoad(
  load: (isCurrent: () => boolean) => Promise<void>,
) {
  const generation = useRef(0);
  const retry = useCallback(() => {
    const request = ++generation.current;
    void load(() => generation.current === request);
  }, [load]);

  useEffect(() => {
    retry();
    return () => {
      generation.current += 1;
    };
  }, [retry]);

  return retry;
}
