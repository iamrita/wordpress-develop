/**
 * WordPress dependencies
 */
import { test, expect } from '@wordpress/e2e-test-utils-playwright';

const TEST_APPLICATION_NAME = 'Test Application';
const HOSTILE_APPLICATION_NAME =
	'<img src=x onerror="window.__appPassXss=1">Hostile App';

test.describe( 'Manage applications passwords', () => {
	test.use( {
		applicationPasswords: async ( { requestUtils, admin, page }, use ) => {
			await use( new ApplicationPasswords( { requestUtils, admin, page } ) );
		},
	} );

	test.beforeEach( async ( { applicationPasswords } ) => {
		await applicationPasswords.delete();
	} );

	test( 'should correctly create a new application password', async ( {
		page,
		applicationPasswords,
	} ) => {
		await applicationPasswords.create();

		const [ app ] = await applicationPasswords.get();
		expect( app.name ).toBe( TEST_APPLICATION_NAME );

		const successMessage = page.getByRole( 'alert' );

		await expect( successMessage ).toHaveClass( /notice-success/ );
		await expect( successMessage ).toContainText(
			`Your new password for ${ TEST_APPLICATION_NAME } is:`
		);
		await expect( successMessage ).toContainText(
			'Be sure to save this in a safe location. You will not be able to retrieve it.'
		);
		await expect( successMessage ).toBeFocused();
	} );

	test( 'should create an application password when pressing Enter', async ( {
		page,
		applicationPasswords,
	} ) => {
		await applicationPasswords.visit();

		const newPasswordField = page.getByRole( 'textbox', {
			name: 'New Application Password Name',
		} );
		await newPasswordField.fill( 'Enter App' );
		await newPasswordField.press( 'Enter' );

		await expect( page.getByRole( 'alert' ) ).toContainText(
			'Your new password for Enter App is:'
		);
		const apps = await applicationPasswords.get();
		expect( apps ).toHaveLength( 1 );
		expect( apps[ 0 ].name ).toBe( 'Enter App' );
	} );

	test( 'should not create a password when the name is empty', async ( {
		page,
		applicationPasswords,
	} ) => {
		await applicationPasswords.visit();

		const newPasswordField = page.getByRole( 'textbox', {
			name: 'New Application Password Name',
		} );
		await expect( newPasswordField ).toBeVisible();
		await page.getByRole( 'button', { name: 'Add Application Password' } ).click();

		await expect( newPasswordField ).toBeFocused();
		expect( await applicationPasswords.get() ).toEqual( [] );
	} );

	test( 'should ignore a second click while create is in flight', async ( {
		page,
		applicationPasswords,
	} ) => {
		await applicationPasswords.visit();

		let postCount = 0;
		await page.route(
			'**/wp-json/wp/v2/users/**/application-passwords**',
			async ( route ) => {
				if ( route.request().method() === 'POST' ) {
					postCount += 1;
					await new Promise( ( resolve ) => setTimeout( resolve, 400 ) );
				}
				await route.continue();
			}
		);

		const newPasswordField = page.getByRole( 'textbox', {
			name: 'New Application Password Name',
		} );
		await newPasswordField.fill( TEST_APPLICATION_NAME );
		const addButton = page.getByRole( 'button', {
			name: 'Add Application Password',
		} );
		await addButton.click();
		await addButton.click( { force: true } );

		await expect( page.getByRole( 'alert' ) ).toBeVisible();
		expect( postCount ).toBe( 1 );
		expect( await applicationPasswords.get() ).toHaveLength( 1 );
	} );

	test( 'should render a hostile name as text', async ( {
		page,
		applicationPasswords,
	} ) => {
		await applicationPasswords.create( HOSTILE_APPLICATION_NAME );

		const successMessage = page.getByRole( 'alert' );
		// Core sanitizes the stored name; the client must still not execute markup.
		await expect( successMessage ).toContainText( 'Hostile App' );
		await expect( successMessage.locator( 'img' ) ).toHaveCount( 0 );
		expect(
			await page.evaluate( () => window.__appPassXss )
		).toBeUndefined();

		const [ app ] = await applicationPasswords.get();
		expect( app.name.includes( 'Hostile App' ) ).toBe( true );
		expect( app.name.includes( '<img' ) ).toBe( false );
	} );

	test( 'should show a text error when create fails', async ( {
		page,
		applicationPasswords,
	} ) => {
		await applicationPasswords.visit();
		await page.route(
			'**/wp-json/wp/v2/users/**/application-passwords**',
			async ( route ) => {
				if ( route.request().method() === 'POST' ) {
					await route.fulfill( {
						status: 500,
						contentType: 'application/json',
						body: JSON.stringify( {
							code: 'rest_error',
							message: '<em>Could not save application password.</em>',
						} ),
					} );
					return;
				}
				await route.continue();
			}
		);

		const newPasswordField = page.getByRole( 'textbox', {
			name: 'New Application Password Name',
		} );
		await newPasswordField.fill( TEST_APPLICATION_NAME );
		await page.getByRole( 'button', { name: 'Add Application Password' } ).click();

		const errorNotice = page.getByRole( 'alert' );
		await expect( errorNotice ).toHaveClass( /notice-error/ );
		await expect( errorNotice ).toContainText(
			'<em>Could not save application password.</em>'
		);
		await expect( errorNotice.locator( 'em' ) ).toHaveCount( 0 );
		expect( await applicationPasswords.get() ).toEqual( [] );
	} );

	test( 'should correctly revoke a single application password', async ( {
		page,
		applicationPasswords,
	} ) => {
		await applicationPasswords.create();

		const revokeButton = page.getByRole( 'button', {
			name: `Revoke "${ TEST_APPLICATION_NAME }"`,
		} );
		await expect( revokeButton ).toBeVisible();

		page.on( 'dialog', ( dialog ) => dialog.accept() );
		await revokeButton.click();

		await expect( page.getByRole( 'alert' ) ).toContainText(
			'Application password revoked.'
		);

		const response = await applicationPasswords.get();
		expect( response ).toEqual( [] );
	} );

	test( 'should keep the row when revoke is cancelled', async ( {
		page,
		applicationPasswords,
	} ) => {
		await applicationPasswords.create();

		page.on( 'dialog', ( dialog ) => dialog.dismiss() );
		await page
			.getByRole( 'button', { name: `Revoke "${ TEST_APPLICATION_NAME }"` } )
			.click();

		await expect(
			page.getByRole( 'button', { name: `Revoke "${ TEST_APPLICATION_NAME }"` } )
		).toBeVisible();
		expect( await applicationPasswords.get() ).toHaveLength( 1 );
	} );

	test( 'should keep the row when revoke fails', async ( {
		page,
		applicationPasswords,
	} ) => {
		await applicationPasswords.visit();
		await page.route(
			'**/wp-json/wp/v2/users/**/application-passwords**',
			async ( route ) => {
				if ( route.request().method() === 'DELETE' ) {
					await route.fulfill( {
						status: 500,
						contentType: 'application/json',
						body: JSON.stringify( {
							code: 'rest_error',
							message: 'Could not delete application password.',
						} ),
					} );
					return;
				}
				await route.continue();
			}
		);

		const newPasswordField = page.getByRole( 'textbox', {
			name: 'New Application Password Name',
		} );
		await newPasswordField.fill( TEST_APPLICATION_NAME );
		await page.getByRole( 'button', { name: 'Add Application Password' } ).click();
		await expect( page.getByRole( 'alert' ) ).toBeVisible();

		page.on( 'dialog', ( dialog ) => dialog.accept() );
		await page
			.getByRole( 'button', { name: `Revoke "${ TEST_APPLICATION_NAME }"` } )
			.click();

		await expect( page.getByRole( 'alert' ) ).toContainText(
			'Could not delete application password.'
		);
		await expect(
			page.getByRole( 'button', { name: `Revoke "${ TEST_APPLICATION_NAME }"` } )
		).toBeVisible();
		expect( await applicationPasswords.get() ).toHaveLength( 1 );
	} );

	test( 'should correctly revoke all the application passwords', async ( {
		page,
		applicationPasswords,
	} ) => {
		await applicationPasswords.create();

		const revokeAllButton = page.getByRole( 'button', {
			name: 'Revoke all application passwords',
		} );
		await expect( revokeAllButton ).toBeVisible();

		page.on( 'dialog', ( dialog ) => dialog.accept() );
		await revokeAllButton.click();

		await expect( page.getByRole( 'alert' ) ).toContainText(
			'All application passwords revoked.'
		);

		const response = await applicationPasswords.get();
		expect( response ).toEqual( [] );
	} );

	test( 'should keep passwords when revoke-all is cancelled', async ( {
		page,
		applicationPasswords,
	} ) => {
		await applicationPasswords.create();

		page.on( 'dialog', ( dialog ) => dialog.dismiss() );
		await page
			.getByRole( 'button', { name: 'Revoke all application passwords' } )
			.click();

		expect( await applicationPasswords.get() ).toHaveLength( 1 );
	} );

	test( 'should return focus to the name field after dismissing the secret notice', async ( {
		page,
		applicationPasswords,
	} ) => {
		await applicationPasswords.create();

		await page.locator( '.new-application-password-notice .notice-dismiss' ).click();
		await expect(
			page.getByRole( 'textbox', { name: 'New Application Password Name' } )
		).toBeFocused();
		await expect( page.locator( '.new-application-password-notice' ) ).toHaveCount(
			0
		);
	} );
} );

class ApplicationPasswords {
	constructor( { requestUtils, page, admin } ) {
		this.requestUtils = requestUtils;
		this.page = page;
		this.admin = admin;
	}

	async visit() {
		await this.admin.visitAdminPage( '/profile.php' );
	}

	async create( applicationName = TEST_APPLICATION_NAME ) {
		await this.visit();

		const newPasswordField = this.page.getByRole( 'textbox', {
			name: 'New Application Password Name',
		} );
		await expect( newPasswordField ).toBeVisible();
		await newPasswordField.fill( applicationName );

		await this.page
			.getByRole( 'button', { name: 'Add Application Password' } )
			.click();
		await expect( this.page.getByRole( 'alert' ) ).toBeVisible();
	}

	async get() {
		return this.requestUtils.rest( {
			method: 'GET',
			path: '/wp/v2/users/me/application-passwords',
		} );
	}

	async delete() {
		await this.requestUtils.rest( {
			method: 'DELETE',
			path: '/wp/v2/users/me/application-passwords',
		} );
	}
}
