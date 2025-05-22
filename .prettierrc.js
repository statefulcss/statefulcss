module.exports = {
	$schema: 'https://json.schemastore.org/prettierrc',
	plugins: ['./common/autoinstallers/rush-prettier/node_modules/prettier-plugin-packagejson/lib/index.cjs'],
	printWidth: 120,
	tabWidth: 2,
	useTabs: true,
	semi: false,
	singleQuote: true,
	trailingComma: 'all',
	arrowParens: 'always',
	bracketSpacing: true,
}
