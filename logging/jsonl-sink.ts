import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { LogRecord } from "../contracts/log.js";
import type { LogSink } from "./sink.js";

export type JsonlSinkOptions =
  | { readonly directory: string; readonly fileName: string }
  | { readonly directory: string; readonly workerId: string };

function resolveFileName(options: JsonlSinkOptions): string {
  if ("fileName" in options) {
    return options.fileName;
  }
  return `worker-${options.workerId}.jsonl`;
}

function writeChunk(stream: WriteStream, chunk: string): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(chunk, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function endStream(stream: WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.once("error", reject);
    stream.end(() => {
      stream.off("error", reject);
      resolve();
    });
  });
}

/**
 * One sink owns exactly one file. Callers must use a distinct `workerId` /
 * `fileName` per concurrent writer (no shared mutable log file).
 */
export async function createJsonlSink(
  options: JsonlSinkOptions,
): Promise<LogSink> {
  await mkdir(options.directory, { recursive: true });

  const filePath = path.join(options.directory, resolveFileName(options));
  const stream = createWriteStream(filePath, { flags: "a", encoding: "utf8" });

  let writeChain: Promise<void> = Promise.resolve();
  let closed = false;

  const append = (record: LogRecord): Promise<void> => {
    if (closed) {
      return Promise.reject(new Error(`JsonlSink is closed: ${filePath}`));
    }

    const line = `${JSON.stringify(record)}\n`;
    const write = writeChain.then(() => writeChunk(stream, line));
    // Keep the chain alive after a failed write so later appends still serialize.
    writeChain = write.then(
      () => undefined,
      () => undefined,
    );
    return write;
  };

  const close = async (): Promise<void> => {
    if (closed) {
      return;
    }
    closed = true;
    await writeChain;
    await endStream(stream);
  };

  return { append, close };
}
