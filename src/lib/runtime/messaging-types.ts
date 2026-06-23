import type { PageFeatures, Verdict } from '../heuristics/rule-types';

// The content-script <-> service-worker message protocol. One discriminated union
// per direction keeps the boundary type-safe (architecture §3: messaging.ts).

export type ContentToWorker =
  | { type: 'EvaluatePage'; features: PageFeatures }
  | { type: 'CheckDismissed'; host: string }
  | { type: 'RecordDismissal'; host: string };

export type WorkerToContent =
  | { type: 'Verdict'; verdict: Verdict }
  | { type: 'DismissedResult'; host: string; dismissed: boolean }
  | { type: 'Ack' };

/** Maps a request to its expected response, so send/receive stay in lockstep. */
export interface MessageResponse {
  EvaluatePage: Extract<WorkerToContent, { type: 'Verdict' }>;
  CheckDismissed: Extract<WorkerToContent, { type: 'DismissedResult' }>;
  RecordDismissal: Extract<WorkerToContent, { type: 'Ack' }>;
}
