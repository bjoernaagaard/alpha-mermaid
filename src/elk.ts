import type { ELK as ElkInstance, ElkNode } from "elkjs";
import ELK from "elkjs/lib/elk.bundled.js";

interface WorkerReply {
  data: { data?: ElkNode; error?: unknown };
}

interface SyncWorker {
  onmessage: (reply: WorkerReply) => void;
  dispatcher: {
    saveDispatch: (message: {
      data: { id: number; cmd: "layout"; graph: ElkNode };
    }) => void;
  };
}

interface SynchronousElk extends ElkInstance {
  worker: { worker: SyncWorker };
}

let worker: SyncWorker | undefined;

const getWorker = (): SyncWorker => {
  if (worker) {
    return worker;
  }

  const pending: (() => void)[] = [];
  const original = Object.getOwnPropertyDescriptor(globalThis, "setTimeout");
  const schedule = globalThis.setTimeout;

  try {
    // elkjs 0.11.0 queues algorithm registration through FakeWorker timers.
    Object.defineProperty(globalThis, "setTimeout", {
      configurable: true,
      value: (task: () => void, delay?: number) => {
        if (delay === 0) {
          pending.push(task);

          return 0;
        }

        return schedule(task, delay);
      },
      writable: true,
    });
    const elk = new ELK();
    // SAFETY: Pinned elkjs 0.11.0 exposes this private worker path; the adapter contract
    // tests exercise initialization, synchronous replies, failures and reuse.
    const internals = elk as SynchronousElk;

    for (const task of pending) {
      task();
    }

    ({ worker } = internals.worker);

    return worker;
  } finally {
    if (original) {
      Object.defineProperty(globalThis, "setTimeout", original);
    }
  }
};

export const elkLayout = (graph: ElkNode): ElkNode => {
  const activeWorker = getWorker();
  const original = activeWorker.onmessage;
  let result: ElkNode | undefined;
  let failure: unknown;
  Object.assign(activeWorker, {
    onmessage: (reply: WorkerReply) => {
      result = reply.data.data;
      failure = reply.data.error;
    },
  });

  try {
    activeWorker.dispatcher.saveDispatch({
      data: { cmd: "layout", graph, id: 0 },
    });
  } finally {
    Object.assign(activeWorker, { onmessage: original });
  }

  if (failure !== undefined) {
    throw failure;
  }

  if (!result) {
    throw new Error("ELK layout did not return synchronously");
  }

  return result;
};
