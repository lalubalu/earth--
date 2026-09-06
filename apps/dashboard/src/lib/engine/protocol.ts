/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import type { EngineConfigInput, EngineInput, EngineResult } from '@lalubalu/signal-engine';

export interface RunRequest {
  type: 'run';
  id: number;
  input: EngineInput;
  config?: EngineConfigInput;
}

export interface RunResponse {
  type: 'result';
  id: number;
  ok: boolean;
  result?: EngineResult;
  error?: string;
  tookMs: number;
}
