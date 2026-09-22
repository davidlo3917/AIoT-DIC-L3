/** Share in-flight work, but retain only successful data so missing/failed data can recover. */
export function successfulCache<T>(load: () => Promise<T | null>) {
  let pending: Promise<T | null> | undefined
  return () => {
    if (!pending) {
      const next = Promise.resolve().then(load)
      pending = next
      next.then((value) => { if (value === null && pending === next) pending = undefined }, () => { if (pending === next) pending = undefined })
    }
    return pending
  }
}
