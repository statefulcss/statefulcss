import type { Role } from "../model.js";

/** The six roles a custom property's prefix can give it, and the prefix of each. */
export const rolePrefixes = {
	token: "--t-",
	component: "--c-",
	state: "--s-",
	part: "--p-",
	private: "--_",
	query: "--q-",
} as const satisfies Partial<Record<Role, string>>;

const prefixes = Object.entries(rolePrefixes) as [keyof typeof rolePrefixes, string][];

/**
 * A custom property's role, from its name alone: `none` when it has no role prefix. A prefix with no name after it
 * (`--t-`) still has the prefix's role. Whether an unprefixed name is a library variable depends on the component's
 * doc comment, so that's decided where the component is known.
 */
export function roleOf(name: string): Exclude<Role, "library"> {
	return prefixes.find(([, prefix]) => name.startsWith(prefix))?.[0] ?? "none";
}
