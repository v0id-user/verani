import { describe, it, expect, vi } from 'vitest';
import {
	validateData,
	withValidation,
	isValidatedContract,
	getClientValidator,
	getServerValidator,
	getValidationErrorHandler,
	createValidatedHandler,
	createValidatedListener,
} from '../../../src/typed/validation';
import { defineContract, payload } from '../../../src/typed/contract';
import type { Validator, ValidationError } from '../../../src/typed/validation';

// Helper to create a passing validator
function passingValidator<T>(transformedData?: T): Validator<T> {
	return {
		safeParse: (data: unknown) => ({ success: true as const, data: (transformedData ?? data) as T }),
	};
}

// Helper to create a failing validator
function failingValidator<T>(message = 'validation failed'): Validator<T> {
	return {
		safeParse: () => ({
			success: false as const,
			error: { issues: [{ message }] },
		}),
	};
}

const testContract = defineContract({
	serverEvents: {
		'server.msg': payload<{ text: string }>(),
	},
	clientEvents: {
		'client.msg': payload<{ text: string }>(),
	},
});

describe('validateData', () => {
	it('returns validated data on success', () => {
		const validator = passingValidator({ text: 'hello' });
		const result = validateData(validator, { text: 'hello' }, 'test', 'client');
		expect(result).toEqual({ text: 'hello' });
	});

	it('returns undefined on validation failure', () => {
		const validator = failingValidator();
		const result = validateData(validator, { bad: 'data' }, 'test', 'client');
		expect(result).toBeUndefined();
	});

	it('calls custom error handler on failure', () => {
		const validator = failingValidator('bad input');
		const onError = vi.fn();
		validateData(validator, {}, 'myEvent', 'server', onError);
		expect(onError).toHaveBeenCalledWith(
			'myEvent',
			expect.objectContaining({ issues: [{ message: 'bad input' }] }),
			'server',
		);
	});

	it('uses default error handler when no custom handler provided', () => {
		const validator = failingValidator();
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		validateData(validator, {}, 'test', 'client');
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});
});

describe('withValidation', () => {
	it('returns a validated contract with brand', () => {
		const validated = withValidation(testContract, {
			clientEvents: {
				'client.msg': passingValidator(),
			},
		});

		expect(validated._validatedBrand).toBe('ValidatedVeraniContract');
		expect(validated._brand).toBe('VeraniContract');
		expect(validated._baseContract).toBe(testContract);
	});

	it('preserves original contract properties', () => {
		const validated = withValidation(testContract, {});
		expect(validated.serverEvents).toBe(testContract.serverEvents);
		expect(validated.clientEvents).toBe(testContract.clientEvents);
		expect(validated.channels).toEqual(testContract.channels);
	});
});

describe('isValidatedContract', () => {
	it('returns true for validated contracts', () => {
		const validated = withValidation(testContract, {});
		expect(isValidatedContract(validated)).toBe(true);
	});

	it('returns false for plain contracts', () => {
		expect(isValidatedContract(testContract)).toBe(false);
	});
});

describe('getClientValidator', () => {
	it('returns validator for validated contract', () => {
		const validator = passingValidator<{ text: string }>();
		const validated = withValidation(testContract, {
			clientEvents: {
				'client.msg': validator,
			},
		});

		const result = getClientValidator(validated, 'client.msg');
		expect(result).toBe(validator);
	});

	it('returns undefined for plain contract', () => {
		const result = getClientValidator(testContract, 'client.msg');
		expect(result).toBeUndefined();
	});

	it('returns undefined for unvalidated event', () => {
		const validated = withValidation(testContract, {
			clientEvents: {},
		});
		const result = getClientValidator(validated, 'client.msg');
		expect(result).toBeUndefined();
	});
});

describe('getServerValidator', () => {
	it('returns validator for validated contract', () => {
		const validator = passingValidator<{ text: string }>();
		const validated = withValidation(testContract, {
			serverEvents: {
				'server.msg': validator,
			},
		});

		const result = getServerValidator(validated, 'server.msg');
		expect(result).toBe(validator);
	});

	it('returns undefined for plain contract', () => {
		const result = getServerValidator(testContract, 'server.msg');
		expect(result).toBeUndefined();
	});
});

describe('getValidationErrorHandler', () => {
	it('returns custom error handler', () => {
		const handler = vi.fn();
		const validated = withValidation(testContract, {
			onValidationError: handler,
		});
		expect(getValidationErrorHandler(validated)).toBe(handler);
	});

	it('returns undefined for plain contract', () => {
		expect(getValidationErrorHandler(testContract)).toBeUndefined();
	});

	it('returns undefined when no handler configured', () => {
		const validated = withValidation(testContract, {});
		expect(getValidationErrorHandler(validated)).toBeUndefined();
	});
});

describe('createValidatedHandler', () => {
	it('passes validated data to handler', () => {
		const validator = passingValidator({ text: 'clean' });
		const validated = withValidation(testContract, {
			clientEvents: { 'client.msg': validator },
		});

		const handler = vi.fn();
		const wrapped = createValidatedHandler(validated, 'client.msg', handler);
		wrapped({ text: 'raw' });
		expect(handler).toHaveBeenCalledWith({ text: 'clean' });
	});

	it('does not call handler on validation failure', () => {
		const validator = failingValidator();
		const validated = withValidation(testContract, {
			clientEvents: { 'client.msg': validator },
		});

		const handler = vi.fn();
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const wrapped = createValidatedHandler(validated, 'client.msg', handler);
		wrapped({ bad: 'data' });
		expect(handler).not.toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it('returns original handler when no validator exists', () => {
		const handler = vi.fn();
		const wrapped = createValidatedHandler(testContract, 'client.msg', handler);
		expect(wrapped).toBe(handler);
	});
});

describe('createValidatedListener', () => {
	it('passes validated data to callback', () => {
		const validator = passingValidator({ text: 'validated' });
		const validated = withValidation(testContract, {
			serverEvents: { 'server.msg': validator },
		});

		const callback = vi.fn();
		const wrapped = createValidatedListener(validated, 'server.msg', callback);
		wrapped({ text: 'raw' });
		expect(callback).toHaveBeenCalledWith({ text: 'validated' });
	});

	it('does not call callback on validation failure', () => {
		const validator = failingValidator();
		const validated = withValidation(testContract, {
			serverEvents: { 'server.msg': validator },
		});

		const callback = vi.fn();
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const wrapped = createValidatedListener(validated, 'server.msg', callback);
		wrapped({ bad: 'data' });
		expect(callback).not.toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it('returns original callback when no validator exists', () => {
		const callback = vi.fn();
		const wrapped = createValidatedListener(testContract, 'server.msg', callback);
		expect(wrapped).toBe(callback);
	});
});
