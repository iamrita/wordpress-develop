/* global QUnit, wp, sinon */
jQuery( function( $ ) {
	var USER_ID = 7;
	var MOCK_UUID = '11111111-1111-4111-8111-111111111111';
	var MOCK_PASSWORD_PLACEHOLDER = 'xxxx xxxx xxxx xxxx xxxx xxxx';
	var HOSTILE_NAME = '<img src=x onerror="window.__appPassXss=1">Hostile';

	function createdItem( name ) {
		return {
			uuid: MOCK_UUID,
			name: name,
			password: MOCK_PASSWORD_PLACEHOLDER,
			created: 1700000000,
			last_used: null,
			last_ip: null
		};
	}

	function boot( assert, callback ) {
		var done = assert.async();
		var rootEl = document.createElement( 'div' );
		var pending = [];
		var originalFetch = wp.apiFetch;
		var settings = { userId: USER_ID, renderer: 'react', canCreate: true };

		rootEl.id = 'application-passwords-root';
		$( '#qunit-fixture' ).append( rootEl );

		wp.apiFetch = function( options ) {
			return new Promise( function( resolve, reject ) {
				pending.push( { options: options, resolve: resolve, reject: reject } );
			} );
		};

		wp.applicationPasswords.initialize( rootEl, settings );

		setTimeout( function() {
			try {
				callback( rootEl, pending );
			} finally {
				wp.apiFetch = originalFetch;
				done();
			}
		}, 20 );
	}

	QUnit.module( 'application-passwords (react)', function( hooks ) {
		hooks.beforeEach( function() {
			this.confirmStub = sinon.stub( window, 'confirm' ).returns( true );
		} );

		hooks.afterEach( function() {
			if ( this.confirmStub ) {
				this.confirmStub.restore();
			}
			if ( wp.hooks ) {
				wp.hooks.removeAllFilters( 'wp_application_passwords_new_password_request' );
				wp.hooks.removeAllActions( 'wp_application_passwords_created_password' );
			}
			delete window.__appPassXss;
			delete window.wpApplicationPasswordsSettings;
		} );

		QUnit.test( 'loads the collection once and keeps path/method outside hook control', function( assert ) {
			boot( assert, function( rootEl, pending ) {
				assert.strictEqual( pending.length, 1, 'Exactly one initial GET.' );
				assert.strictEqual( pending[0].options.method || 'GET', 'GET' );
				assert.strictEqual(
					pending[0].options.path,
					'/wp/v2/users/' + USER_ID + '/application-passwords?_locale=user'
				);
				pending[0].resolve( [] );
			} );
		} );

		QUnit.test( 'create uses a fixed POST target and fires hooks in order', function( assert ) {
			var done = assert.async();
			boot( assert, function( rootEl, pending ) {
				pending[0].resolve( [] );

				setTimeout( function() {
					var filterCalls = [];
					var actionCalls = [];

					wp.hooks.addFilter( 'wp_application_passwords_new_password_request', 'qunit', function( request, userId ) {
						filterCalls.push( { request: request, userId: userId } );
						request.app_id = 'hook-added-app-id';
						return request;
					} );
					wp.hooks.addAction( 'wp_application_passwords_created_password', 'qunit', function( response, request ) {
						actionCalls.push( { response: response, request: request } );
					} );

					rootEl.querySelector( '#new_application_password_name' ).value = 'CLI';
					rootEl.querySelector( '#new_application_password_name' ).dispatchEvent( new Event( 'input', { bubbles: true } ) );
					rootEl.querySelector( '#do_new_application_password' ).click();

					setTimeout( function() {
						var create = pending[1];
						assert.strictEqual( filterCalls.length, 1 );
						assert.strictEqual( filterCalls[0].userId, USER_ID );
						assert.strictEqual( create.options.method, 'POST' );
						assert.strictEqual(
							create.options.path,
							'/wp/v2/users/' + USER_ID + '/application-passwords?_locale=user'
						);
						assert.strictEqual( create.options.data.name, 'CLI' );
						assert.strictEqual( create.options.data.app_id, 'hook-added-app-id' );
						assert.strictEqual( actionCalls.length, 0, 'Created action waits for success.' );

						create.resolve( createdItem( 'CLI' ) );

						setTimeout( function() {
							assert.strictEqual( actionCalls.length, 1 );
							assert.strictEqual( rootEl.querySelector( '#new-application-password-value' ).value, MOCK_PASSWORD_PLACEHOLDER );
							assert.strictEqual( document.activeElement, rootEl.querySelector( '[role="alert"]' ) );
							done();
						}, 20 );
					}, 20 );
				}, 20 );
			} );
		} );

		QUnit.test( 'in-flight create ignores a second click', function( assert ) {
			boot( assert, function( rootEl, pending ) {
				pending[0].resolve( [] );

				setTimeout( function() {
					rootEl.querySelector( '#new_application_password_name' ).value = 'Race';
					rootEl.querySelector( '#new_application_password_name' ).dispatchEvent( new Event( 'input', { bubbles: true } ) );
					rootEl.querySelector( '#do_new_application_password' ).click();
					rootEl.querySelector( '#do_new_application_password' ).click();

					var posts = pending.filter( function( item ) {
						return 'POST' === item.options.method;
					} );
					assert.strictEqual( posts.length, 1 );
				}, 20 );
			} );
		} );

		QUnit.test( 'hostile names and errors render as text', function( assert ) {
			var done = assert.async();
			boot( assert, function( rootEl, pending ) {
				pending[0].resolve( [] );

				setTimeout( function() {
					rootEl.querySelector( '#new_application_password_name' ).value = HOSTILE_NAME;
					rootEl.querySelector( '#new_application_password_name' ).dispatchEvent( new Event( 'input', { bubbles: true } ) );
					rootEl.querySelector( '#do_new_application_password' ).click();

					setTimeout( function() {
						pending[1].resolve( createdItem( HOSTILE_NAME ) );
						setTimeout( function() {
							assert.true( rootEl.textContent.indexOf( HOSTILE_NAME ) !== -1 );
							assert.strictEqual( rootEl.querySelectorAll( 'img' ).length, 0 );
							assert.strictEqual( window.__appPassXss, undefined );
							done();
						}, 20 );
					}, 20 );
				}, 20 );
			} );
		} );

		QUnit.test( 'pagehide clears the one-time secret', function( assert ) {
			var done = assert.async();
			boot( assert, function( rootEl, pending ) {
				pending[0].resolve( [] );

				setTimeout( function() {
					rootEl.querySelector( '#new_application_password_name' ).value = 'Stay';
					rootEl.querySelector( '#new_application_password_name' ).dispatchEvent( new Event( 'input', { bubbles: true } ) );
					rootEl.querySelector( '#do_new_application_password' ).click();

					setTimeout( function() {
						pending[1].resolve( createdItem( 'Stay' ) );
						setTimeout( function() {
							assert.strictEqual( rootEl.querySelector( '#new-application-password-value' ).value, MOCK_PASSWORD_PLACEHOLDER );
							window.dispatchEvent( new Event( 'pagehide' ) );
							setTimeout( function() {
								assert.strictEqual( rootEl.querySelector( '#new-application-password-value' ), null );
								done();
							}, 20 );
						}, 20 );
					}, 20 );
				}, 20 );
			} );
		} );

		QUnit.test( 'failed revoke keeps the row', function( assert ) {
			var done = assert.async();
			boot( assert, function( rootEl, pending ) {
				pending[0].resolve( [ createdItem( 'Keep' ) ] );

				setTimeout( function() {
					rootEl.querySelector( '.delete' ).click();
					setTimeout( function() {
						var del = pending[1];
						assert.strictEqual( del.options.method, 'DELETE' );
						assert.true( del.options.path.indexOf( encodeURIComponent( MOCK_UUID ) ) !== -1 );
						del.reject( { message: HOSTILE_NAME, data: { status: 500 } } );
						setTimeout( function() {
							assert.strictEqual( rootEl.querySelectorAll( 'tr[data-uuid="' + MOCK_UUID + '"]' ).length, 1 );
							assert.true( rootEl.querySelector( '.notice-error' ).textContent.indexOf( HOSTILE_NAME ) !== -1 );
							assert.strictEqual( rootEl.querySelectorAll( '.notice-error img' ).length, 0 );
							done();
						}, 20 );
					}, 20 );
				}, 20 );
			} );
		} );
	} );
} );
