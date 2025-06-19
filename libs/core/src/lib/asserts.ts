export function assertWorker(worker: Worker | null): asserts worker is Worker {
  if (!worker) throw Error('The Worker instance is not initialized');
}
