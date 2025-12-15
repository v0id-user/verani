import type { NavItem } from "./markdown.js";
import { getNavigation } from "./markdown.js";

/**
 * Get navigation tree (now synchronous since it's bundled)
 */
export function getNavigationSync(): NavItem[] {
	return getNavigation();
}
