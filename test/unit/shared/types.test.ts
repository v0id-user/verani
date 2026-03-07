import { describe, it, expect } from 'vitest';
import { PROTOCOL_VERSION } from '../../../src/shared/types';

describe('PROTOCOL_VERSION', () => {
	it('is a valid semver string', () => {
		expect(PROTOCOL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it('is version 1.0.0', () => {
		expect(PROTOCOL_VERSION).toBe('1.0.0');
	});
});
