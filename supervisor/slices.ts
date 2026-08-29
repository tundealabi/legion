export interface WorkerSlice {
  workerId: string;
  offset: number;
  count: number;
}

export function workerSlices(
  botCount: number,
  groupSize: number,
): WorkerSlice[] {
  const slices: WorkerSlice[] = [];
  let offset = 0;
  let index = 0;
  while (offset < botCount) {
    const count = Math.min(groupSize, botCount - offset);
    slices.push({ workerId: String(index), offset, count });
    offset += count;
    index += 1;
  }
  return slices;
}
