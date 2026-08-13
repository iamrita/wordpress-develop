/* global QUnit, wp, sinon */
jQuery( function( $ ) {
	var USER_ID = '7';
	var MOCK_UUID = '11111111-1111-4111-8111-111111111111';
	// Placeholder only — never a real one-time credential.
	var MOCK_PASSWORD_PLACEHOLDER = 'xxxx xxxx xxxx xxxx xxxx xxxx';
	var HOSTILE_NAME = '<img src=x onerror="window.__appPassXss=1"><script>window.__appPassXss=1</script>';
	var SCRIPT_SRC = '../../src/js/_enqueues/admin/application-passwords.js';

	function fixtureHtml( options ) {
		var existingRow = '';
		var noItems = '<tr class="no-items"><td class="colspanchange" colspan="5">No items found.</td></tr>';

		options = options || {};

		if ( options.existing ) {
			existingRow =
				'<tr data-uuid="' + MOCK_UUID + '">' +
					'<td class="name column-name has-row-actions column-primary">' +
						( options.existingName || 'Existing App' ) +
					'</td>' +
					'<td class="revoke column-revoke">' +
						'<button type="button" class="button delete" aria-label="Revoke &quot;Existing App&quot;">Revoke</button>' +
					'</td>' +
				'</tr>';
			noItems = '';
		}

		return (
			'<input type="hidden" name="user_id" id="user_id" value="' + USER_ID + '" />' +
			'<div class="application-passwords hide-if-no-js" id="application-passwords-section">' +
				'<h2>Application Passwords</h2>' +
				'<div class="create-application-password form-wrap">' +
					'<div class="form-field">' +
						'<label for="new_application_password_name">New Application Password Name</label>' +
						'<input type="text" id="new_application_password_name" name="new_application_password_name" class="input ltr" />' +
					'</div>' +
					'<button type="button" name="do_new_application_password" id="do_new_application_password" class="button button-secondary">Add Application Password</button>' +
				'</div>' +
				'<div class="application-passwords-list-table-wrapper">' +
					'<table class="wp-list-table widefat fixed striped">' +
						'<tbody>' + existingRow + noItems + '</tbody>' +
					'</table>' +
					'<button type="button" name="revoke-all-application-passwords" id="revoke-all-application-passwords" class="button delete">Revoke all application passwords</button>' +
				'</div>' +
			'</div>' +
			'<script type="text/html" id="tmpl-new-application-password">' +
				'<div class="notice notice-success is-dismissible new-application-password-notice" role="alert">' +
					'<p class="application-password-display">' +
						'<label for="new-application-password-value">Your new password for <strong>{{ data.name }}</strong> is:</label>' +
						'<input id="new-application-password-value" type="text" class="code" readonly="readonly" value="{{ data.password }}" />' +
					'</p>' +
					'<button type="button" class="notice-dismiss"><span class="screen-reader-text">Dismiss this notice.</span></button>' +
				'</div>' +
			'</script>' +
			'<script type="text/html" id="tmpl-application-password-row">' +
				'<tr data-uuid="{{ data.uuid }}">' +
					'<td class="name column-name">{{ data.name }}</td>' +
					'<td class="revoke column-revoke">' +
						'<button type="button" class="button delete" aria-label="Revoke &quot;{{ data.name }}&quot;">Revoke</button>' +
					'</td>' +
				'</tr>' +
			'</script>'
		);
	}

	function boot( options ) {
		$( '#qunit-fixture' ).html( fixtureHtml( options ) );
		return new Promise( function( resolve, reject ) {
			var script = document.createElement( 'script' );
			script.src = SCRIPT_SRC + '?reload=' + Date.now();
			script.onload = resolve;
			script.onerror = function() {
				reject( new Error( 'Failed to load application-passwords.js via script src.' ) );
			};
			document.body.appendChild( script );
		} );
	}

	function run( assert, options, callback ) {
		var done = assert.async();
		boot( options ).then( function() {
			callback();
			done();
		} ).catch( function( error ) {
			assert.ok( false, error.message );
			done();
		} );
	}

	function $section() {
		return $( '#qunit-fixture #application-passwords-section' );
	}

	function stubApiRequest( handler ) {
		return sinon.stub( wp, 'apiRequest' ).callsFake( function( options ) {
			var deferred = $.Deferred();
			handler( options, deferred );
			return deferred;
		} );
	}

	function createdResponse( name ) {
		return {
			uuid: MOCK_UUID,
			name: name,
			password: MOCK_PASSWORD_PLACEHOLDER,
			created: 1700000000,
			last_used: null,
			last_ip: null
		};
	}

	QUnit.module( 'application-passwords (legacy)', function( hooks ) {
		hooks.beforeEach( function() {
			$.fx.off = true;
			this.confirmStub = sinon.stub( window, 'confirm' ).returns( true );
		} );

		hooks.afterEach( function() {
			if ( wp.apiRequest && wp.apiRequest.restore ) {
				wp.apiRequest.restore();
			}
			if ( this.confirmStub ) {
				this.confirmStub.restore();
			}
			if ( wp.hooks ) {
				wp.hooks.removeAllFilters( 'wp_application_passwords_new_password_request' );
				wp.hooks.removeAllActions( 'wp_application_passwords_created_password' );
			}
			delete window.__appPassXss;
			$.fx.off = false;
		} );

		QUnit.test( 'hides the list table when the tbody has only the empty-state row', function( assert ) {
			run( assert, {}, function() {
				assert.strictEqual(
					$section().find( '.application-passwords-list-table-wrapper' ).css( 'display' ),
					'none',
					'Empty legacy list is hidden on boot.'
				);
			} );
		} );

		QUnit.test( 'keeps the list table visible when a password row already exists', function( assert ) {
			run( assert, { existing: true }, function() {
				assert.notStrictEqual(
					$section().find( '.application-passwords-list-table-wrapper' ).css( 'display' ),
					'none',
					'Populated legacy list stays visible on boot.'
				);
			} );
		} );

		QUnit.test( 'empty name focuses the input and does not submit', function( assert ) {
			run( assert, {}, function() {
				var stub = stubApiRequest( function() {
					assert.ok( false, 'No request should be sent for an empty name.' );
				} );

				$section().find( '#do_new_application_password' ).trigger( 'click' );

				assert.strictEqual( stub.callCount, 0, 'Create is not sent.' );
				assert.strictEqual(
					document.activeElement,
					$section().find( '#new_application_password_name' )[0],
					'Name field receives focus.'
				);
			} );
		} );

		QUnit.test( 'create uses a fixed POST target and fires hooks in order', function( assert ) {
			run( assert, {}, function() {
				var filterCalls = [];
				var actionCalls = [];
				var requestBody;

				wp.hooks.addFilter(
					'wp_application_passwords_new_password_request',
					'qunit',
					function( request, userId ) {
						filterCalls.push( { request: $.extend( {}, request ), userId: userId } );
						request.app_id = 'hook-added-app-id';
						return request;
					}
				);
				wp.hooks.addAction(
					'wp_application_passwords_created_password',
					'qunit',
					function( response, request ) {
						actionCalls.push( { response: response, request: request } );
					}
				);

				stubApiRequest( function( options, deferred ) {
					requestBody = options;
					assert.strictEqual( actionCalls.length, 0, 'Created action waits for a successful response.' );
					deferred.resolve( createdResponse( 'CLI' ) );
				} );

				$section().find( '#new_application_password_name' ).val( 'CLI' );
				$section().find( '#do_new_application_password' ).trigger( 'click' );

				assert.strictEqual( filterCalls.length, 1, 'Request filter runs once before the network call.' );
				assert.strictEqual( filterCalls[0].userId, USER_ID, 'Filter receives the PHP-provided user id.' );
				assert.strictEqual( filterCalls[0].request.name, 'CLI', 'Filter receives the typed name.' );
				assert.strictEqual( requestBody.method, 'POST', 'Create method is fixed to POST.' );
				assert.strictEqual(
					requestBody.path,
					'/wp/v2/users/' + USER_ID + '/application-passwords?_locale=user',
					'Create path is fixed to the profile user and is not hook-controlled.'
				);
				assert.strictEqual( requestBody.data.name, 'CLI', 'Request body includes the name.' );
				assert.strictEqual( requestBody.data.app_id, 'hook-added-app-id', 'Hooks may only add body fields.' );
				assert.strictEqual( actionCalls.length, 1, 'Created action fires after success.' );
				assert.strictEqual( actionCalls[0].response.name, 'CLI' );
				assert.strictEqual( actionCalls[0].request.app_id, 'hook-added-app-id' );
				assert.strictEqual(
					$section().find( '#new-application-password-value' ).val(),
					MOCK_PASSWORD_PLACEHOLDER,
					'Success notice shows the one-time placeholder from the response.'
				);
				assert.strictEqual(
					document.activeElement,
					$section().find( '.new-application-password-notice' )[0],
					'Success notice is focused.'
				);
				assert.strictEqual(
					$section().find( '.new-application-password-notice' ).attr( 'tabindex' ),
					'-1'
				);
				assert.notStrictEqual(
					$section().find( '.application-passwords-list-table-wrapper' ).css( 'display' ),
					'none',
					'List becomes visible after create.'
				);
				assert.strictEqual( $section().find( '.no-items' ).length, 0, 'Empty-state row is removed.' );
				assert.strictEqual( $section().find( '#new_application_password_name' ).val(), '', 'Name field is cleared.' );
			} );
		} );

		QUnit.test( 'create failure renders the REST message as text and does not fire the created action', function( assert ) {
			run( assert, {}, function() {
				var actionFired = false;

				wp.hooks.addAction( 'wp_application_passwords_created_password', 'qunit', function() {
					actionFired = true;
				} );

				stubApiRequest( function( options, deferred ) {
					deferred.reject(
						{ responseJSON: { message: HOSTILE_NAME } },
						'error',
						'Internal Server Error'
					);
				} );

				$section().find( '#new_application_password_name' ).val( 'Broken' );
				$section().find( '#do_new_application_password' ).trigger( 'click' );

				assert.false( actionFired, 'Created action does not fire on failure.' );
				assert.strictEqual( $section().find( '.notice-error' ).length, 1, 'Error notice is shown.' );
				assert.strictEqual(
					$section().find( '.notice-error p' ).text(),
					HOSTILE_NAME,
					'Error message is rendered as text.'
				);
				assert.strictEqual( $section().find( '.notice-error img, .notice-error script, .notice-error em' ).length, 0 );
				assert.strictEqual( window.__appPassXss, undefined, 'Hostile markup is not executed.' );
				assert.strictEqual( $section().find( '.notice-error' ).attr( 'role' ), 'alert' );
			} );
		} );

		QUnit.test( 'hostile application names are rendered as text in the notice and row', function( assert ) {
			run( assert, {}, function() {
				stubApiRequest( function( options, deferred ) {
					deferred.resolve( createdResponse( HOSTILE_NAME ) );
				} );

				$section().find( '#new_application_password_name' ).val( HOSTILE_NAME );
				$section().find( '#do_new_application_password' ).trigger( 'click' );

				assert.true(
					$section().find( '.new-application-password-notice' ).text().indexOf( HOSTILE_NAME ) !== -1,
					'Notice includes the literal name.'
				);
				assert.strictEqual(
					$section().find( '.application-passwords-list-table-wrapper .name' ).text(),
					HOSTILE_NAME,
					'Row name is text content.'
				);
				assert.strictEqual( $section().find( '.new-application-password-notice img, .application-passwords-list-table-wrapper img' ).length, 0 );
				assert.strictEqual( window.__appPassXss, undefined );
			} );
		} );

		QUnit.test( 'aria-disabled blocks double-click and Enter/click races', function( assert ) {
			run( assert, {}, function() {
				var deferred;
				var stub = stubApiRequest( function( options, pending ) {
					deferred = pending;
				} );

				$section().find( '#new_application_password_name' ).val( 'Race' );
				$section().find( '#do_new_application_password' ).trigger( 'click' );
				$section().find( '#do_new_application_password' ).trigger( 'click' );
				$section().find( '#new_application_password_name' ).trigger( $.Event( 'keypress', { which: 13 } ) );

				assert.strictEqual( stub.callCount, 1, 'Only the first create request is sent.' );
				assert.true( $section().find( '#do_new_application_password' ).prop( 'aria-disabled' ), 'Button is aria-disabled while in flight.' );
				assert.true( $section().find( '#do_new_application_password' ).hasClass( 'disabled' ) );

				deferred.resolve( createdResponse( 'Race' ) );
				assert.strictEqual( $section().find( '#do_new_application_password' ).prop( 'aria-disabled' ), undefined, 'aria-disabled is cleared after the request settles.' );
			} );
		} );

		QUnit.test( 'Enter in the name field submits the create form', function( assert ) {
			run( assert, {}, function() {
				var stub = stubApiRequest( function( options, deferred ) {
					deferred.resolve( createdResponse( 'From Enter' ) );
				} );

				$section().find( '#new_application_password_name' ).val( 'From Enter' );
				$section().find( '#new_application_password_name' ).trigger( $.Event( 'keypress', { which: 13 } ) );

				assert.strictEqual( stub.callCount, 1 );
				assert.strictEqual( stub.firstCall.args[0].method, 'POST' );
			} );
		} );

		QUnit.test( 'revoke confirm cancel does not mutate', function( assert ) {
			var confirmStub = this.confirmStub;
			run( assert, { existing: true }, function() {
				confirmStub.returns( false );
				var stub = stubApiRequest( function() {
					assert.ok( false, 'Revoke must not run when confirm is cancelled.' );
				} );

				$section().find( '.application-passwords-list-table-wrapper .delete' ).first().trigger( 'click' );

				assert.strictEqual( stub.callCount, 0 );
				assert.strictEqual( $section().find( 'tr[data-uuid="' + MOCK_UUID + '"]' ).length, 1 );
			} );
		} );

		QUnit.test( 'successful revoke uses DELETE on the row UUID and focuses the notice', function( assert ) {
			run( assert, { existing: true }, function() {
				var request;
				stubApiRequest( function( options, deferred ) {
					request = options;
					deferred.resolve( { deleted: true, previous: {} } );
				} );

				$section().find( 'tr[data-uuid="' + MOCK_UUID + '"] .delete' ).trigger( 'click' );

				assert.strictEqual( request.method, 'DELETE' );
				assert.strictEqual(
					request.path,
					'/wp/v2/users/' + USER_ID + '/application-passwords/' + MOCK_UUID + '?_locale=user',
					'Revoke path is fixed to the profile user and row UUID.'
				);
				assert.strictEqual( $section().find( 'tr[data-uuid="' + MOCK_UUID + '"]' ).length, 0 );
				assert.strictEqual( $section().find( '.notice-success p' ).text(), 'Application password revoked.' );
				assert.strictEqual( document.activeElement, $section().find( '.notice-success' )[0] );
				assert.strictEqual(
					$section().find( '.application-passwords-list-table-wrapper' ).css( 'display' ),
					'none',
					'Hides the table after the last row is revoked.'
				);
			} );
		} );

		QUnit.test( 'failed revoke keeps the row and shows a text error', function( assert ) {
			run( assert, { existing: true }, function() {
				stubApiRequest( function( options, deferred ) {
					deferred.reject(
						{ responseJSON: { message: HOSTILE_NAME } },
						'error',
						'Forbidden'
					);
				} );

				$section().find( 'tr[data-uuid="' + MOCK_UUID + '"] .delete' ).trigger( 'click' );

				assert.strictEqual( $section().find( 'tr[data-uuid="' + MOCK_UUID + '"]' ).length, 1, 'Row remains after a failed revoke.' );
				assert.strictEqual( $section().find( '.notice-error p' ).text(), HOSTILE_NAME );
				assert.strictEqual( $section().find( '.notice-error img' ).length, 0 );
			} );
		} );

		QUnit.test( 'revoke-all confirm cancel does not mutate', function( assert ) {
			var confirmStub = this.confirmStub;
			run( assert, { existing: true }, function() {
				confirmStub.returns( false );
				var stub = stubApiRequest( function() {
					assert.ok( false, 'Revoke-all must not run when confirm is cancelled.' );
				} );

				$section().find( '#revoke-all-application-passwords' ).trigger( 'click' );

				assert.strictEqual( stub.callCount, 0 );
				assert.strictEqual( $section().find( 'tr[data-uuid="' + MOCK_UUID + '"]' ).length, 1 );
			} );
		} );

		QUnit.test( 'successful revoke-all deletes the collection and clears the secret notice', function( assert ) {
			run( assert, {}, function() {
				var request;
				stubApiRequest( function( options, deferred ) {
					if ( options.method === 'POST' ) {
						deferred.resolve( createdResponse( 'Temp' ) );
						return;
					}
					request = options;
					deferred.resolve( { deleted: true, previous: [] } );
				} );

				$section().find( '#new_application_password_name' ).val( 'Temp' );
				$section().find( '#do_new_application_password' ).trigger( 'click' );
				assert.strictEqual( $section().find( '.new-application-password-notice' ).length, 1 );

				$section().find( '#revoke-all-application-passwords' ).trigger( 'click' );

				assert.strictEqual( request.method, 'DELETE' );
				assert.strictEqual(
					request.path,
					'/wp/v2/users/' + USER_ID + '/application-passwords?_locale=user',
					'Revoke-all path is the collection for the profile user.'
				);
				assert.strictEqual( $section().find( '.application-passwords-list-table-wrapper tbody' ).children().length, 0 );
				assert.strictEqual( $section().find( '.new-application-password-notice' ).length, 0, 'One-time secret notice is removed.' );
				assert.strictEqual( $section().find( '.notice-success p' ).text(), 'All application passwords revoked.' );
				assert.strictEqual(
					$section().find( '.application-passwords-list-table-wrapper' ).css( 'display' ),
					'none'
				);
			} );
		} );

		QUnit.test( 'failed revoke-all keeps rows and the secret notice', function( assert ) {
			run( assert, {}, function() {
				stubApiRequest( function( options, deferred ) {
					if ( options.method === 'POST' ) {
						deferred.resolve( createdResponse( 'Keep Me' ) );
						return;
					}
					deferred.reject( { responseJSON: { message: 'Could not delete application passwords.' } }, 'error', 'Error' );
				} );

				$section().find( '#new_application_password_name' ).val( 'Keep Me' );
				$section().find( '#do_new_application_password' ).trigger( 'click' );
				$section().find( '#revoke-all-application-passwords' ).trigger( 'click' );

				assert.strictEqual( $section().find( 'tr[data-uuid="' + MOCK_UUID + '"]' ).length, 1 );
				assert.strictEqual(
					$section().find( '.new-application-password-notice' ).length,
					0,
					'clearNotices() removes the one-time secret notice when revoke-all starts.'
				);
				assert.strictEqual( $section().find( '.notice-error p' ).text(), 'Could not delete application passwords.' );
			} );
		} );

		QUnit.test( 'dismissing the secret notice starts the legacy dismiss handler', function( assert ) {
			run( assert, {}, function() {
				stubApiRequest( function( options, deferred ) {
					deferred.resolve( createdResponse( 'Dismiss Me' ) );
				} );

				$section().find( '#new_application_password_name' ).val( 'Dismiss Me' );
				$section().find( '#do_new_application_password' ).trigger( 'click' );
				$section().find( '.new-application-password-notice .notice-dismiss' ).trigger( 'click' );

				assert.strictEqual(
					$section().find( '.new-application-password-notice' ).attr( 'role' ),
					undefined,
					'Dismiss handler runs and clears the alert role before animating the notice out.'
				);
			} );
		} );

		QUnit.test( 'legacy client does not register pagehide secret clearing', function( assert ) {
			run( assert, {}, function() {
				var pagehideListeners;

				stubApiRequest( function( options, deferred ) {
					deferred.resolve( createdResponse( 'Stay' ) );
				} );

				$section().find( '#new_application_password_name' ).val( 'Stay' );
				$section().find( '#do_new_application_password' ).trigger( 'click' );

				pagehideListeners = $._data( window, 'events' );
				assert.false(
					!! ( pagehideListeners && pagehideListeners.pagehide ),
					'Characterization: the legacy script does not bind window pagehide.'
				);

				$( window ).trigger( 'pagehide' );
				assert.strictEqual(
					$section().find( '#new-application-password-value' ).val(),
					MOCK_PASSWORD_PLACEHOLDER,
					'Characterization: a pagehide event leaves the one-time value in the notice input.'
				);
			} );
		} );
	} );
} );
