let _enabled = false;

export function enableDebug(enabled: boolean) {
	_enabled = enabled;
}

export function debug(tag: string, ...args: unknown[]) {
	if (_enabled) console.debug(`[Verani:${tag}]`, ...args);
}
