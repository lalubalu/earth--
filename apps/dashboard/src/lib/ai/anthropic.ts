/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-sonnet-5';

export function modelName(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let client: Anthropic | null = null;

/** The key never leaves this module; route handlers only see the client. */
export function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    client = new Anthropic({ apiKey, maxRetries: 1, timeout: 25_000 });
  }
  return client;
}

export function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `Anthropic API ${err.status ?? ''} ${err.name}`.trim();
  if (err instanceof Error) return err.name === 'AbortError' ? 'Anthropic request timed out' : err.message;
  return 'unknown error';
}
