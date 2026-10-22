// At most three stores in flight; an aborted search never starts queued work.
export async function runStores(stores, worker, signal, concurrency = 3) {
  let next = 0;
  await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, stores.length) }, async () => {
      while (!signal.aborted && next < stores.length) {
        const store = stores[next++];
        await worker(store);
      }
    }),
  );
}
