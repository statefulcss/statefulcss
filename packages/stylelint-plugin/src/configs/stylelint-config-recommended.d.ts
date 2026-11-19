// The package ships no types of its own.
declare module "stylelint-config-recommended" {
	import type stylelint from "stylelint";

	const config: stylelint.Config;
	export default config;
}
