/**
 * External dependencies
 */
import path from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * WordPress dependencies
 */
const baseConfig = require( '@wordpress/scripts/config/playwright.config' );

process.env.WP_ARTIFACTS_PATH ??= path.join( process.cwd(), 'artifacts' );
process.env.STORAGE_STATE_PATH ??= path.join(
	process.env.WP_ARTIFACTS_PATH,
	'storage-states/admin.json'
);

const config = defineConfig( {
	...baseConfig,
	globalSetup: require.resolve( './config/global-setup.js' ),
	webServer: {
		...baseConfig.webServer,
		command: 'npm run env:start',
	},
	use: {
		...baseConfig.use,
		video: 'off',
	},
	projects: ( baseConfig.projects || [ { name: 'chromium', use: {} } ] ).map(
		( project ) => ( {
			...project,
			use: {
				...project.use,
				// Match tests/qunit/playwright.config.js so CI can use the system Chrome channel.
				channel: process.env.CI ? 'chrome' : project.use?.channel,
				video: 'off',
			},
		} )
	),
} );

export default config;
