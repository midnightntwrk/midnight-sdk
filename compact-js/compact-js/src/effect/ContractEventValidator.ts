import { type LogEvent } from '@midnight-ntwrk/compact-runtime';

import { MAX_EVENT_SIZE } from './ContractEventContstants';

export class ContractEventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractEventValidationError';
  }
}

/**
 * Validates that events comply with system constraints.
 * @param events Events to validate
 * @throws ContractEventValidationError if validation fails
 */
export const validateEvents = (events: LogEvent[]): void => {
  if (!Array.isArray(events)) {
    throw new ContractEventValidationError('Events must be an array');
  }

  events.forEach((event, index) => {
    if (!event || typeof event !== 'object') {
      throw new ContractEventValidationError(`Event at index ${index} is not a valid object`);
    }

    // Check that event has required fields from GatherResult
    if (!('tag' in event) || event.tag !== 'log') {
      throw new ContractEventValidationError(`Event at index ${index} must have tag: 'log'`);
    }

    // Validate content size
    if ('content' in event && event.content instanceof Uint8Array) {
      if (event.content.byteLength > MAX_EVENT_SIZE) {
        throw new ContractEventValidationError(
          `Event at index ${index} exceeds max size: ${event.content.byteLength} > ${MAX_EVENT_SIZE}`
        );
      }
    }
  });
};
