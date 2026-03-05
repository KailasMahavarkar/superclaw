import { describe, expect, it } from 'vitest';

import { _isRetryableAgentError, _matchesGroupTrigger } from './index.js';
import { RegisteredGroup } from './types.js';

function makeGroup(trigger: string): RegisteredGroup {
  return {
    name: 'Test Group',
    folder: 'test-group',
    trigger,
    added_at: new Date().toISOString(),
    requiresTrigger: true,
  };
}

describe('_matchesGroupTrigger', () => {
  it('matches configured group regex trigger', () => {
    const group = makeGroup('^@nano\\b');
    expect(_matchesGroupTrigger('@nano run diagnostics', group)).toBe(true);
  });

  it('does not match assistant-name fallback when regex does not match', () => {
    const group = makeGroup('^@something-else\\b');
    expect(_matchesGroupTrigger('@nano hello', group)).toBe(false);
  });

  it('does not match when configured trigger regex is invalid', () => {
    const group = makeGroup('([invalid-regex');
    expect(_matchesGroupTrigger('@nano ping', group)).toBe(false);
  });

  it('does not match unrelated text', () => {
    const group = makeGroup('^@nano\\b');
    expect(_matchesGroupTrigger('hello team', group)).toBe(false);
  });
});

describe('_isRetryableAgentError', () => {
  it('marks missing image errors as non-retryable', () => {
    expect(
      _isRetryableAgentError(
        "Unable to find image 'nanoclaw-agent:latest' locally",
      ),
    ).toBe(false);
    expect(
      _isRetryableAgentError(
        'docker: Error response from daemon: pull access denied',
      ),
    ).toBe(false);
  });

  it('keeps unknown failures retryable', () => {
    expect(_isRetryableAgentError('Container exited with code 137')).toBe(true);
    expect(_isRetryableAgentError(undefined)).toBe(true);
  });
});
