/**
 * Sanitizes a room name or path to a valid PascalCase class name
 * @param name - The name to sanitize (e.g., "chat-example" or "/ws/presence")
 * @returns PascalCase class name (e.g., "ChatExample" or "WsPresence")
 */
export function sanitizeToClassName(name: string): string {
	// Remove leading slashes and split by common separators
	const cleaned = name.replace(/^\/+/, '');
	const parts = cleaned.split(/[-_\/\s]+/);

	// Convert each part to PascalCase
	const pascalCase = parts
		.map(part => part.replace(/[^a-zA-Z0-9]/g, '')) // Remove special chars
		.filter(part => part.length > 0) // Remove empty parts
		.map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join('');

	// Fallback if sanitization results in empty string
	return pascalCase || 'VeraniActor';
}

