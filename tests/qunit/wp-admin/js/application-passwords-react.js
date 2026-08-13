/* global QUnit, wp */
jQuery( function( $ ) {
	QUnit.module( 'application-passwords (react)', function( hooks ) {
		hooks.beforeEach( function() {
			if ( this.clock && typeof this.clock.restore === 'function' ) {
				this.clock.restore();
			}
			this.originalFetch = wp.apiFetch;
			this.requests = [];
			wp.apiFetch = function( options ) {
				this.requests.push( options );
				return new Promise( function() {} );
			}.bind( this );
		} );

		hooks.afterEach( function() {
			wp.apiFetch = this.originalFetch;
			if ( wp.hooks ) {
				wp.hooks.removeAllFilters( 'wp_application_passwords_new_password_request' );
				wp.hooks.removeAllActions( 'wp_application_passwords_created_password' );
			}
			delete window.wpApplicationPasswordsSettings;
		} );

		QUnit.test( 'package exposes initialize and requires PHP userId', function( assert ) {
			assert.strictEqual( typeof wp.applicationPasswords.initialize, 'function' );
			assert.strictEqual(
				wp.applicationPasswords.initialize( document.createElement( 'div' ), { renderer: 'react' } ),
				null,
				'Missing userId does not mount.'
			);
		} );

		QUnit.test( 'initialize renders the create form from boot config', function( assert ) {
			var rootEl = document.createElement( 'div' );
			$( '#qunit-fixture' ).append( rootEl );

			var root = wp.applicationPasswords.initialize( rootEl, {
				userId: 7,
				renderer: 'react',
				canCreate: true
			} );

			assert.ok( root, 'createRoot handle is returned.' );
			assert.ok( rootEl.querySelector( '#new_application_password_name' ), 'Name field is present.' );
			assert.ok( rootEl.querySelector( '#do_new_application_password' ), 'Create button is present.' );
			assert.ok( rootEl.querySelector( '.create-application-password' ) );
		} );

		QUnit.test( 'canCreate false hides the create form', function( assert ) {
			var rootEl = document.createElement( 'div' );
			$( '#qunit-fixture' ).append( rootEl );

			wp.applicationPasswords.initialize( rootEl, {
				userId: 7,
				renderer: 'react',
				canCreate: false
			} );

			assert.strictEqual( rootEl.querySelector( '.create-application-password' ), null );
		} );
	} );
} );
