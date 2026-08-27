import type { LogRecord } from "../contracts/log.js";

/** Domain boundary for log emission. One sink owns one writer-local destination. */
export interface LogSink {
  /** Serialize `record` as one JSON object line (trailing newline). */
  append(record: LogRecord): Promise<void>;
  /** Flush pending writes and release resources. Idempotent. */
  close(): Promise<void>;
}
