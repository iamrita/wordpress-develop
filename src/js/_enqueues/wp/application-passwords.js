/**
 * WordPress Application Passwords React island.
 *
 * Synced-package shape for `@wordpress/application-passwords`.
 * Uses only wp-element, wp-api-fetch, wp-date, wp-i18n, and wp-hooks.
 * Grunt copies this file to wp-includes/js/dist/application-passwords.js.
 *
 * @output wp-includes/js/dist/application-passwords.js
 */
( function( wp ) {
	if ( ! wp || ! wp.element || ! wp.apiFetch ) {
		return;
	}

	var el = wp.element.createElement;
	var createRoot = wp.element.createRoot;
	var useState = wp.element.useState;
	var useEffect = wp.element.useEffect;
	var useRef = wp.element.useRef;
	var Fragment = wp.element.Fragment;
	var __ = wp.i18n.__;
	var sprintf = wp.i18n.sprintf;
	var dateI18n = wp.date && wp.date.dateI18n ? wp.date.dateI18n : function() {
		return '—';
	};

	function collectionPath( userId ) {
		return '/wp/v2/users/' + userId + '/application-passwords?_locale=user';
	}

	function itemPath( userId, uuid ) {
		return '/wp/v2/users/' + userId + '/application-passwords/' + encodeURIComponent( uuid ) + '?_locale=user';
	}

	function normalizeItem( item ) {
		return {
			uuid: item.uuid,
			name: item.name,
			created: item.created,
			last_used: item.last_used,
			last_ip: item.last_ip
		};
	}

	function errorMessage( error ) {
		if ( error && error.message ) {
			return String( error.message );
		}
		return __( 'An error occurred.' );
	}

	function errorStatus( error ) {
		if ( ! error ) {
			return 0;
		}
		if ( error.data && error.data.status ) {
			return parseInt( error.data.status, 10 );
		}
		if ( error.status ) {
			return parseInt( error.status, 10 );
		}
		return 0;
	}

	function isAuthFailure( status ) {
		return 401 === status || 403 === status || 501 === status;
	}

	function formatDate( value ) {
		if ( ! value ) {
			return '—';
		}
		return dateI18n( __( 'F j, Y' ), value );
	}

	function Notice( props ) {
		return el(
			'div',
			{
				className: 'is-dismissible notice notice-' + props.type + ( props.secret ? ' new-application-password-notice' : '' ),
				role: 'alert',
				tabIndex: -1,
				ref: props.noticeRef
			},
			props.secret
				? el(
					Fragment,
					null,
					el(
						'p',
						{ className: 'application-password-display' },
						el(
							'label',
							{ htmlFor: 'new-application-password-value' },
							__( 'Your new password for ' ),
							el( 'strong', null, props.secretName ),
							__( ' is:' )
						),
						el( 'input', {
							id: 'new-application-password-value',
							type: 'text',
							className: 'code',
							readOnly: true,
							value: props.secret
						} ),
						el(
							'button',
							{
								type: 'button',
								className: 'button copy-button',
								'data-clipboard-text': props.secret
							},
							__( 'Copy' )
						),
						el( 'span', { className: 'success hidden', 'aria-hidden': 'true' }, __( 'Copied!' ) )
					),
					el( 'p', null, __( 'Be sure to save this in a safe location. You will not be able to retrieve it.' ) )
				)
				: el( 'p', null, props.message ),
			el(
				'button',
				{
					type: 'button',
					className: 'notice-dismiss',
					onClick: props.onDismiss
				},
				el( 'span', { className: 'screen-reader-text' }, __( 'Dismiss this notice.' ) )
			)
		);
	}

	function ApplicationPasswordsApp( props ) {
		var settings = props.settings || {};
		var userId = parseInt( settings.userId, 10 );
		var canCreate = false !== settings.canCreate;

		var nameRef = useRef( null );
		var noticeRef = useRef( null );
		var creatingRef = useRef( false );
		var revokingRef = useRef( false );

		var name = useState( '' );
		var setName = name[1];
		name = name[0];

		var items = useState( [] );
		var setItems = items[1];
		items = items[0];

		var loading = useState( true );
		var setLoading = loading[1];
		loading = loading[0];

		var loadError = useState( '' );
		var setLoadError = loadError[1];
		loadError = loadError[0];

		var notice = useState( null );
		var setNotice = notice[1];
		notice = notice[0];

		var secret = useState( null );
		var setSecret = secret[1];
		secret = secret[0];

		var secretName = useState( '' );
		var setSecretName = secretName[1];
		secretName = secretName[0];

		var creating = useState( false );
		var setCreating = creating[1];
		creating = creating[0];

		function clearSecret() {
			setSecret( null );
			setSecretName( '' );
		}

		function dismissNotice() {
			clearSecret();
			setNotice( null );
			if ( nameRef.current ) {
				nameRef.current.focus();
			}
		}

		useEffect(
			function() {
				var cancelled = false;
				wp.apiFetch( { path: collectionPath( userId ) } )
					.then( function( response ) {
						if ( cancelled ) {
							return;
						}
						var list = Array.isArray( response ) ? response.map( normalizeItem ) : [];
						setItems( list );
						setLoading( false );
					} )
					.catch( function( error ) {
						if ( cancelled ) {
							return;
						}
						setLoading( false );
						setLoadError( errorMessage( error ) );
						if ( isAuthFailure( errorStatus( error ) ) ) {
							clearSecret();
						}
					} );
				return function() {
					cancelled = true;
				};
			},
			[ userId ]
		);

		useEffect(
			function() {
				function onPageHide() {
					clearSecret();
				}
				window.addEventListener( 'pagehide', onPageHide );
				return function() {
					window.removeEventListener( 'pagehide', onPageHide );
					clearSecret();
				};
			},
			[]
		);

		useEffect(
			function() {
				if ( noticeRef.current ) {
					noticeRef.current.focus();
				}
			},
			[ notice, secret ]
		);

		function createPassword() {
			if ( creatingRef.current ) {
				return;
			}
			var trimmed = name;
			if ( 0 === trimmed.length ) {
				if ( nameRef.current ) {
					nameRef.current.focus();
				}
				return;
			}

			creatingRef.current = true;
			setCreating( true );
			setNotice( null );
			clearSecret();

			var request = { name: trimmed };
			request = wp.hooks.applyFilters( 'wp_application_passwords_new_password_request', request, userId );

			wp.apiFetch( {
				path: collectionPath( userId ),
				method: 'POST',
				data: request
			} )
				.then( function( response ) {
					var item = normalizeItem( response );
					setItems( function( current ) {
						return [ item ].concat( current );
					} );
					setName( '' );
					if ( response.password ) {
						setSecret( String( response.password ) );
						setSecretName( item.name );
					}
					setNotice( { type: 'success', secret: true } );
					wp.hooks.doAction( 'wp_application_passwords_created_password', response, request );
				} )
				.catch( function( error ) {
					if ( isAuthFailure( errorStatus( error ) ) ) {
						clearSecret();
					}
					setNotice( { type: 'error', message: errorMessage( error ) } );
				} )
				.finally( function() {
					creatingRef.current = false;
					setCreating( false );
				} );
		}

		function revokeOne( uuid ) {
			if ( revokingRef.current ) {
				return;
			}
			if ( ! window.confirm( __( 'Are you sure you want to revoke this password? This action cannot be undone.' ) ) ) {
				return;
			}

			revokingRef.current = true;
			setNotice( null );
			clearSecret();

			wp.apiFetch( {
				path: itemPath( userId, uuid ),
				method: 'DELETE'
			} )
				.then( function( response ) {
					if ( response && response.deleted ) {
						setItems( function( current ) {
							return current.filter( function( item ) {
								return item.uuid !== uuid;
							} );
						} );
						setNotice( { type: 'success', message: __( 'Application password revoked.' ) } );
					}
				} )
				.catch( function( error ) {
					if ( isAuthFailure( errorStatus( error ) ) ) {
						clearSecret();
					}
					setNotice( { type: 'error', message: errorMessage( error ) } );
				} )
				.finally( function() {
					revokingRef.current = false;
				} );
		}

		function revokeAll() {
			if ( revokingRef.current ) {
				return;
			}
			if ( ! window.confirm( __( 'Are you sure you want to revoke all passwords? This action cannot be undone.' ) ) ) {
				return;
			}

			revokingRef.current = true;
			setNotice( null );
			clearSecret();

			wp.apiFetch( {
				path: collectionPath( userId ),
				method: 'DELETE'
			} )
				.then( function( response ) {
					if ( response && response.deleted ) {
						setItems( [] );
						setNotice( { type: 'success', message: __( 'All application passwords revoked.' ) } );
					}
				} )
				.catch( function( error ) {
					if ( isAuthFailure( errorStatus( error ) ) ) {
						clearSecret();
					}
					setNotice( { type: 'error', message: errorMessage( error ) } );
				} )
				.finally( function() {
					revokingRef.current = false;
				} );
		}

		function onNameKeyDown( event ) {
			if ( 'Enter' === event.key ) {
				event.preventDefault();
				createPassword();
			}
		}

		var rows = items.map( function( item ) {
			return el(
				'tr',
				{ key: item.uuid, 'data-uuid': item.uuid },
				el( 'td', { className: 'name column-name has-row-actions column-primary' }, item.name ),
				el( 'td', { className: 'created column-created' }, formatDate( item.created ) ),
				el( 'td', { className: 'last_used column-last_used' }, formatDate( item.last_used ) ),
				el( 'td', { className: 'last_ip column-last_ip' }, item.last_ip || '—' ),
				el(
					'td',
					{ className: 'revoke column-revoke' },
					el(
						'button',
						{
							type: 'button',
							className: 'button delete',
							'aria-label': sprintf(
								/* translators: %s: the application password's given name. */
								__( 'Revoke "%s"' ),
								item.name
							),
							onClick: function() {
								revokeOne( item.uuid );
							}
						},
						__( 'Revoke' )
					)
				)
			);
		} );

		return el(
			Fragment,
			null,
			canCreate && el(
				'div',
				{ className: 'create-application-password form-wrap' },
				el(
					'div',
					{ className: 'form-field' },
					el( 'label', { htmlFor: 'new_application_password_name' }, __( 'New Application Password Name' ) ),
					el( 'input', {
						type: 'text',
						id: 'new_application_password_name',
						name: 'new_application_password_name',
						className: 'input ltr',
						'aria-required': 'true',
						spellCheck: false,
						value: name,
						ref: nameRef,
						onChange: function( event ) {
							setName( event.target.value );
						},
						onKeyDown: onNameKeyDown
					} ),
					el(
						'p',
						{ className: 'description', id: 'new_application_password_name_desc' },
						__( 'Required to create an Application Password, but not to update the user.' )
					)
				),
				el(
					'button',
					{
						type: 'button',
						name: 'do_new_application_password',
						id: 'do_new_application_password',
						className: 'button button-secondary' + ( creating ? ' disabled' : '' ),
						'aria-disabled': creating ? 'true' : undefined,
						onClick: createPassword
					},
					__( 'Add Application Password' )
				)
			),
			notice && el( Notice, {
				type: notice.type,
				message: notice.message,
				secret: secret,
				secretName: secretName,
				noticeRef: noticeRef,
				onDismiss: dismissNotice
			} ),
			loading && el( 'p', { className: 'application-passwords-loading' }, __( 'Loading…' ) ),
			loadError && el( 'div', { className: 'notice notice-error', role: 'alert' }, el( 'p', null, loadError ) ),
			! loading && items.length > 0 && el(
				'div',
				{ className: 'application-passwords-list-table-wrapper' },
				el(
					'table',
					{ className: 'wp-list-table widefat fixed striped' },
					el(
						'thead',
						null,
						el(
							'tr',
							null,
							el( 'th', { scope: 'col' }, __( 'Name' ) ),
							el( 'th', { scope: 'col' }, __( 'Created' ) ),
							el( 'th', { scope: 'col' }, __( 'Last Used' ) ),
							el( 'th', { scope: 'col' }, __( 'Last IP' ) ),
							el( 'th', { scope: 'col' }, __( 'Revoke' ) )
						)
					),
					el( 'tbody', null, rows )
				),
				el(
					'button',
					{
						type: 'button',
						name: 'revoke-all-application-passwords',
						id: 'revoke-all-application-passwords',
						className: 'button delete',
						onClick: revokeAll
					},
					__( 'Revoke all application passwords' )
				)
			)
		);
	}

	function initialize( target, settings ) {
		if ( ! target || ! settings || ! settings.userId ) {
			return null;
		}
		var root = createRoot( target );
		wp.element.flushSync( function() {
			root.render( el( ApplicationPasswordsApp, { settings: settings } ) );
		} );
		return root;
	}

	wp.applicationPasswords = {
		initialize: initialize
	};
} )( window.wp );
