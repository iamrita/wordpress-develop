/**
 * Media Library (grid mode) — React/DataViews implementation.
 *
 * Replaces the legacy Backbone `wp.media( { frame: 'manage' } )` grid with a
 * React application built on the `@wordpress/*` runtime packages that ship with
 * WordPress (`wp.element`, `wp.components`, `wp.apiFetch`, `wp.data`). Data is
 * read from the `/wp/v2/media` REST endpoint.
 *
 * @output wp-admin/js/media-library-dataviews.js
 */

/* eslint-disable no-var */
( function ( wp, settings ) {
	if ( ! wp || ! wp.element || ! wp.components || ! wp.apiFetch ) {
		return;
	}

	var el = wp.element.createElement;
	var useState = wp.element.useState;
	var useEffect = wp.element.useEffect;
	var useCallback = wp.element.useCallback;
	var useRef = wp.element.useRef;
	var createRoot = wp.element.createRoot;
	var render = wp.element.render;

	var apiFetch = wp.apiFetch;
	var components = wp.components;
	var Spinner = components.Spinner;
	var Button = components.Button;
	var SelectControl = components.SelectControl;
	var SearchControl = components.SearchControl;
	var Notice = components.Notice;
	var CheckboxControl = components.CheckboxControl;

	var __ = ( wp.i18n && wp.i18n.__ ) || function ( s ) { return s; };
	var sprintf = ( wp.i18n && wp.i18n.sprintf ) || function ( s ) { return s; };

	var config = settings || {};
	var PER_PAGE = config.perPage || 40;
	var EDIT_BASE = config.editBaseUrl || 'post.php';
	var CAN_DELETE = !! config.canDelete;

	/**
	 * Decode HTML entities / strip tags from a rendered string.
	 *
	 * @param {string} html Rendered HTML string.
	 * @return {string} Plain text.
	 */
	function toPlainText( html ) {
		if ( ! html ) {
			return '';
		}
		var tmp = document.createElement( 'div' );
		tmp.innerHTML = html;
		return tmp.textContent || tmp.innerText || '';
	}

	/**
	 * Best available thumbnail URL for an attachment.
	 *
	 * @param {Object} item REST attachment object.
	 * @return {string|null} Image URL, or null when not previewable.
	 */
	function getThumb( item ) {
		var details = item.media_details;
		if ( details && details.sizes ) {
			var sizes = details.sizes;
			if ( sizes.medium ) {
				return sizes.medium.source_url;
			}
			if ( sizes.thumbnail ) {
				return sizes.thumbnail.source_url;
			}
			if ( sizes.full ) {
				return sizes.full.source_url;
			}
		}
		if ( item.media_type === 'image' && item.source_url ) {
			return item.source_url;
		}
		return null;
	}

	function getTitle( item ) {
		var title = item.title && item.title.rendered ? toPlainText( item.title.rendered ) : '';
		if ( ! title ) {
			// translators: %d: Attachment ID.
			return sprintf( __( 'Untitled (#%d)' ), item.id );
		}
		return title;
	}

	function getAuthorName( item ) {
		if ( item._embedded && item._embedded.author && item._embedded.author[ 0 ] ) {
			return item._embedded.author[ 0 ].name || '';
		}
		return '';
	}

	function formatDate( dateString ) {
		if ( ! dateString ) {
			return '';
		}
		var d = new Date( dateString );
		if ( isNaN( d.getTime() ) ) {
			return dateString;
		}
		return d.toLocaleDateString() + ' ' + d.toLocaleTimeString( [], { hour: '2-digit', minute: '2-digit' } );
	}

	function editUrl( id ) {
		var sep = EDIT_BASE.indexOf( '?' ) === -1 ? '?' : '&';
		return EDIT_BASE + sep + 'post=' + id + '&action=edit';
	}

	/**
	 * Thumbnail (or mime-type placeholder) for a single attachment.
	 */
	function Thumbnail( props ) {
		var item = props.item;
		var thumb = getThumb( item );
		if ( thumb ) {
			return el( 'img', {
				className: 'media-dataviews__thumb-img',
				src: thumb,
				alt: getTitle( item ),
				loading: 'lazy',
			} );
		}
		return el(
			'div',
			{ className: 'media-dataviews__thumb-placeholder', 'aria-hidden': true },
			el( 'span', { className: 'media-dataviews__mime' }, item.mime_type || item.media_type || '' )
		);
	}

	/**
	 * The toolbar: search, media-type filter, sort, and layout switch.
	 */
	function Toolbar( props ) {
		return el(
			'div',
			{ className: 'media-dataviews__toolbar' },
			el(
				'div',
				{ className: 'media-dataviews__filters' },
				el( SearchControl, {
					__nextHasNoMarginBottom: true,
					label: __( 'Search media' ),
					placeholder: __( 'Search media items…' ),
					value: props.search,
					onChange: props.onSearch,
				} ),
				el( SelectControl, {
					__nextHasNoMarginBottom: true,
					label: __( 'Media type' ),
					hideLabelFromVision: true,
					value: props.mediaType,
					options: [
						{ label: __( 'All media items' ), value: '' },
						{ label: __( 'Images' ), value: 'image' },
						{ label: __( 'Audio' ), value: 'audio' },
						{ label: __( 'Video' ), value: 'video' },
						{ label: __( 'Documents' ), value: 'application' },
						{ label: __( 'Spreadsheets' ), value: 'spreadsheet' },
						{ label: __( 'Archives' ), value: 'archive' },
					],
					onChange: props.onMediaType,
				} ),
				el( SelectControl, {
					__nextHasNoMarginBottom: true,
					label: __( 'Sort by' ),
					hideLabelFromVision: true,
					value: props.sort,
					options: [
						{ label: __( 'Newest first' ), value: 'date/desc' },
						{ label: __( 'Oldest first' ), value: 'date/asc' },
						{ label: __( 'Title A → Z' ), value: 'title/asc' },
						{ label: __( 'Title Z → A' ), value: 'title/desc' },
					],
					onChange: props.onSort,
				} )
			),
			el(
				'div',
				{ className: 'media-dataviews__layout-switch', role: 'group', 'aria-label': __( 'View mode' ) },
				el(
					Button,
					{
						variant: props.view === 'grid' ? 'primary' : 'secondary',
						icon: 'grid-view',
						label: __( 'Grid view' ),
						isPressed: props.view === 'grid',
						onClick: function () { props.onView( 'grid' ); },
					}
				),
				el(
					Button,
					{
						variant: props.view === 'table' ? 'primary' : 'secondary',
						icon: 'list-view',
						label: __( 'List view' ),
						isPressed: props.view === 'table',
						onClick: function () { props.onView( 'table' ); },
					}
				)
			)
		);
	}

	/**
	 * Grid layout of attachments.
	 */
	function GridLayout( props ) {
		return el(
			'ul',
			{ className: 'media-dataviews__grid' },
			props.items.map( function ( item ) {
				var isSelected = props.selection.indexOf( item.id ) !== -1;
				return el(
					'li',
					{
						key: item.id,
						className: 'media-dataviews__grid-item' + ( isSelected ? ' is-selected' : '' ),
					},
					el(
						'div',
						{ className: 'media-dataviews__grid-thumb' },
						el( CheckboxControl, {
							__nextHasNoMarginBottom: true,
							className: 'media-dataviews__select',
							label: '',
							'aria-label': sprintf( __( 'Select %s' ), getTitle( item ) ),
							checked: isSelected,
							onChange: function () { props.onToggleSelect( item.id ); },
						} ),
						el( Thumbnail, { item: item } )
					),
					el(
						'div',
						{ className: 'media-dataviews__grid-meta' },
						el(
							'a',
							{ className: 'media-dataviews__title', href: editUrl( item.id ) },
							getTitle( item )
						),
						el( 'span', { className: 'media-dataviews__subtle' }, item.mime_type )
					)
				);
			} )
		);
	}

	/**
	 * Table layout of attachments.
	 */
	function TableLayout( props ) {
		var items = props.items;
		var allSelected = items.length > 0 && items.every( function ( item ) {
			return props.selection.indexOf( item.id ) !== -1;
		} );

		return el(
			'table',
			{ className: 'media-dataviews__table widefat striped' },
			el(
				'thead',
				null,
				el(
					'tr',
					null,
					el( 'th', { className: 'check-column' },
						el( CheckboxControl, {
							__nextHasNoMarginBottom: true,
							label: '',
							'aria-label': __( 'Select all' ),
							checked: allSelected,
							onChange: function () { props.onToggleSelectAll( ! allSelected ); },
						} )
					),
					el( 'th', null, __( 'File' ) ),
					el( 'th', null, __( 'Author' ) ),
					el( 'th', null, __( 'Type' ) ),
					el( 'th', null, __( 'Date' ) ),
					el( 'th', null, __( 'Actions' ) )
				)
			),
			el(
				'tbody',
				null,
				items.map( function ( item ) {
					var isSelected = props.selection.indexOf( item.id ) !== -1;
					return el(
						'tr',
						{ key: item.id, className: isSelected ? 'is-selected' : '' },
						el( 'td', { className: 'check-column' },
							el( CheckboxControl, {
								__nextHasNoMarginBottom: true,
								label: '',
								'aria-label': sprintf( __( 'Select %s' ), getTitle( item ) ),
								checked: isSelected,
								onChange: function () { props.onToggleSelect( item.id ); },
							} )
						),
						el( 'td', { className: 'media-dataviews__file-cell' },
							el( 'span', { className: 'media-dataviews__table-thumb' }, el( Thumbnail, { item: item } ) ),
							el( 'a', { className: 'media-dataviews__title', href: editUrl( item.id ) }, getTitle( item ) )
						),
						el( 'td', null, getAuthorName( item ) ),
						el( 'td', null, item.mime_type ),
						el( 'td', null, formatDate( item.date ) ),
						el( 'td', null,
							el( Button, {
								variant: 'link',
								href: editUrl( item.id ),
							}, __( 'Edit' ) ),
							CAN_DELETE ? el( Button, {
								variant: 'link',
								isDestructive: true,
								className: 'media-dataviews__delete-link',
								onClick: function () { props.onDelete( [ item.id ] ); },
							}, __( 'Delete' ) ) : null
						)
					);
				} )
			)
		);
	}

	/**
	 * Pagination footer.
	 */
	function Pagination( props ) {
		if ( props.totalPages <= 1 ) {
			return null;
		}
		return el(
			'div',
			{ className: 'media-dataviews__pagination' },
			el( Button, {
				variant: 'secondary',
				disabled: props.page <= 1,
				onClick: function () { props.onPage( props.page - 1 ); },
			}, __( 'Previous' ) ),
			el( 'span', { className: 'media-dataviews__page-info' },
				sprintf( __( 'Page %1$d of %2$d (%3$d items)' ), props.page, props.totalPages, props.totalItems )
			),
			el( Button, {
				variant: 'secondary',
				disabled: props.page >= props.totalPages,
				onClick: function () { props.onPage( props.page + 1 ); },
			}, __( 'Next' ) )
		);
	}

	/**
	 * Root application component.
	 */
	function MediaLibraryApp() {
		var itemsState = useState( [] );
		var items = itemsState[ 0 ];
		var setItems = itemsState[ 1 ];

		var loadingState = useState( true );
		var loading = loadingState[ 0 ];
		var setLoading = loadingState[ 1 ];

		var errorState = useState( null );
		var error = errorState[ 0 ];
		var setError = errorState[ 1 ];

		var noticeState = useState( null );
		var notice = noticeState[ 0 ];
		var setNotice = noticeState[ 1 ];

		var pageState = useState( 1 );
		var page = pageState[ 0 ];
		var setPage = pageState[ 1 ];

		var totalPagesState = useState( 1 );
		var totalPages = totalPagesState[ 0 ];
		var setTotalPages = totalPagesState[ 1 ];

		var totalItemsState = useState( 0 );
		var totalItems = totalItemsState[ 0 ];
		var setTotalItems = totalItemsState[ 1 ];

		var searchState = useState( config.initialSearch || '' );
		var search = searchState[ 0 ];
		var setSearch = searchState[ 1 ];

		var mediaTypeState = useState( '' );
		var mediaType = mediaTypeState[ 0 ];
		var setMediaType = mediaTypeState[ 1 ];

		var sortState = useState( 'date/desc' );
		var sort = sortState[ 0 ];
		var setSort = sortState[ 1 ];

		var viewState = useState( config.initialView || 'grid' );
		var view = viewState[ 0 ];
		var setView = viewState[ 1 ];

		var selectionState = useState( [] );
		var selection = selectionState[ 0 ];
		var setSelection = selectionState[ 1 ];

		var debounceRef = useRef( null );

		var fetchItems = useCallback( function () {
			setLoading( true );
			setError( null );

			var sortParts = sort.split( '/' );
			var query = {
				per_page: PER_PAGE,
				page: page,
				orderby: sortParts[ 0 ],
				order: sortParts[ 1 ],
				_embed: 'author',
			};
			if ( search ) {
				query.search = search;
			}
			if ( mediaType ) {
				// `spreadsheet` and `archive` are not REST media_type values; map to mime prefixes.
				if ( mediaType === 'spreadsheet' ) {
					query.mime_type = 'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
				} else if ( mediaType === 'archive' ) {
					query.mime_type = 'application/zip,application/x-tar,application/gzip,application/x-rar-compressed';
				} else {
					query.media_type = mediaType;
				}
			}

			var queryString = Object.keys( query ).map( function ( key ) {
				return encodeURIComponent( key ) + '=' + encodeURIComponent( query[ key ] );
			} ).join( '&' );

			apiFetch( { path: '/wp/v2/media?' + queryString, parse: false } )
				.then( function ( response ) {
					var pages = parseInt( response.headers.get( 'X-WP-TotalPages' ), 10 ) || 1;
					var total = parseInt( response.headers.get( 'X-WP-Total' ), 10 ) || 0;
					setTotalPages( pages );
					setTotalItems( total );
					return response.json();
				} )
				.then( function ( data ) {
					setItems( data );
					setLoading( false );
				} )
				.catch( function ( err ) {
					setError( ( err && err.message ) || __( 'Could not load the media library.' ) );
					setLoading( false );
				} );
		}, [ page, search, mediaType, sort ] );

		useEffect( function () {
			fetchItems();
		}, [ fetchItems ] );

		var onSearch = function ( value ) {
			if ( debounceRef.current ) {
				clearTimeout( debounceRef.current );
			}
			debounceRef.current = setTimeout( function () {
				setPage( 1 );
				setSearch( value );
			}, 300 );
		};

		var onMediaType = function ( value ) {
			setPage( 1 );
			setMediaType( value );
		};

		var onSort = function ( value ) {
			setPage( 1 );
			setSort( value );
		};

		var onToggleSelect = function ( id ) {
			setSelection( function ( prev ) {
				if ( prev.indexOf( id ) !== -1 ) {
					return prev.filter( function ( x ) { return x !== id; } );
				}
				return prev.concat( [ id ] );
			} );
		};

		var onToggleSelectAll = function ( selectAll ) {
			if ( selectAll ) {
				setSelection( items.map( function ( item ) { return item.id; } ) );
			} else {
				setSelection( [] );
			}
		};

		var onDelete = function ( ids ) {
			if ( ! CAN_DELETE || ! ids.length ) {
				return;
			}
			var confirmMessage = ids.length === 1 ?
				__( 'Delete this media item permanently?' ) :
				sprintf( __( 'Delete %d media items permanently?' ), ids.length );
			/* eslint-disable no-alert */
			var confirmed = window.confirm( confirmMessage );
			/* eslint-enable no-alert */
			if ( ! confirmed ) {
				return;
			}

			setLoading( true );
			var requests = ids.map( function ( id ) {
				return apiFetch( { path: '/wp/v2/media/' + id + '?force=true', method: 'DELETE' } );
			} );

			Promise.all( requests )
				.then( function () {
					setSelection( [] );
					var successMessage = ids.length === 1 ?
						__( 'Media item permanently deleted.' ) :
						sprintf( __( '%d media items permanently deleted.' ), ids.length );
					setNotice( { status: 'success', message: successMessage } );
					fetchItems();
				} )
				.catch( function ( err ) {
					setNotice( {
						status: 'error',
						message: ( err && err.message ) || __( 'The media item could not be deleted.' ),
					} );
					setLoading( false );
				} );
		};

		var layoutProps = {
			items: items,
			selection: selection,
			onToggleSelect: onToggleSelect,
			onToggleSelectAll: onToggleSelectAll,
			onDelete: onDelete,
		};

		var children = [];

		children.push( el( Toolbar, {
			key: 'toolbar',
			search: search,
			mediaType: mediaType,
			sort: sort,
			view: view,
			onSearch: onSearch,
			onMediaType: onMediaType,
			onSort: onSort,
			onView: setView,
		} ) );

		if ( CAN_DELETE && selection.length > 0 ) {
			children.push( el(
				'div',
				{ key: 'bulk', className: 'media-dataviews__bulk' },
				el( 'span', null, sprintf( __( '%d selected' ), selection.length ) ),
				el( Button, {
					variant: 'primary',
					isDestructive: true,
					onClick: function () { onDelete( selection ); },
				}, __( 'Delete permanently' ) ),
				el( Button, {
					variant: 'tertiary',
					onClick: function () { setSelection( [] ); },
				}, __( 'Clear selection' ) )
			) );
		}

		if ( notice ) {
			children.push( el( Notice, {
				key: 'notice',
				status: notice.status,
				onRemove: function () { setNotice( null ); },
			}, notice.message ) );
		}

		if ( error ) {
			children.push( el( Notice, { key: 'error', status: 'error', isDismissible: false }, error ) );
		}

		if ( loading ) {
			children.push( el( 'div', { key: 'loading', className: 'media-dataviews__loading' }, el( Spinner, null ) ) );
		} else if ( ! error && items.length === 0 ) {
			children.push( el( 'div', { key: 'empty', className: 'media-dataviews__empty' }, __( 'No media items found.' ) ) );
		} else if ( ! error && view === 'grid' ) {
			children.push( el( GridLayout, Object.assign( { key: 'grid' }, layoutProps ) ) );
		} else if ( ! error ) {
			children.push( el( TableLayout, Object.assign( { key: 'table' }, layoutProps ) ) );
		}

		children.push( el( Pagination, {
			key: 'pagination',
			page: page,
			totalPages: totalPages,
			totalItems: totalItems,
			onPage: setPage,
		} ) );

		return el( 'div', { className: 'media-dataviews' }, children );
	}

	function mount() {
		var container = document.getElementById( 'wp-media-grid-app' );
		if ( ! container ) {
			return;
		}
		var app = el( MediaLibraryApp, null );
		if ( createRoot ) {
			createRoot( container ).render( app );
		} else if ( render ) {
			render( app, container );
		}
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', mount );
	} else {
		mount();
	}

	wp.mediaLibraryDataViews = { mount: mount, App: MediaLibraryApp };
}( window.wp, window._wpMediaLibraryDataViews ) );
