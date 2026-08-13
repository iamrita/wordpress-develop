<?php
/**
 * Tests for the Application Passwords React UI renderer gate.
 *
 * @group admin
 * @group application-passwords
 *
 * @covers ::wp_use_application_passwords_react_ui
 * @covers ::wp_get_application_passwords_ui_boot_config
 * @covers ::wp_print_application_passwords_react_mount
 */
class WP_Test_Application_Passwords_React_UI extends WP_UnitTestCase {

	/**
	 * Administrator user ID.
	 *
	 * @var int
	 */
	public static $user_id;

	public static function wpSetUpBeforeClass( WP_UnitTest_Factory $factory ) {
		require_once ABSPATH . 'wp-admin/includes/user.php';
		self::$user_id = $factory->user->create( array( 'role' => 'administrator' ) );
	}

	public function set_up() {
		parent::set_up();
		require_once ABSPATH . 'wp-admin/includes/user.php';
		wp_set_current_user( self::$user_id );
	}

	public function tear_down() {
		foreach ( wp_get_application_passwords_legacy_ui_hooks() as $hook ) {
			remove_all_filters( $hook );
			remove_all_actions( $hook );
		}
		remove_all_filters( 'wp_use_application_passwords_react_ui' );
		unset( $_GET['application_passwords_ui'], $_GET['wp_application_passwords_ui'] );
		parent::tear_down();
	}

	/**
	 * @ticket WOR-3
	 */
	public function test_default_unextended_install_selects_react() {
		$this->assertTrue( wp_use_application_passwords_react_ui() );
		$this->assertSame( 'react', wp_get_application_passwords_ui_boot_config( self::$user_id )['renderer'] );
	}

	/**
	 * @ticket WOR-3
	 */
	public function test_kill_switch_filter_false_forces_legacy() {
		add_filter( 'wp_use_application_passwords_react_ui', '__return_false' );

		$this->assertFalse( wp_use_application_passwords_react_ui() );
		$this->assertSame( 'legacy', wp_get_application_passwords_ui_boot_config( self::$user_id )['renderer'] );
	}

	/**
	 * @ticket WOR-3
	 */
	public function test_query_string_does_not_override_renderer() {
		$_GET['application_passwords_ui']    = 'legacy';
		$_GET['wp_application_passwords_ui'] = 'legacy';

		$this->assertTrue( wp_use_application_passwords_react_ui() );
		$this->assertSame( 'react', wp_get_application_passwords_ui_boot_config( self::$user_id )['renderer'] );
	}

	/**
	 * @ticket WOR-3
	 */
	public function test_create_form_action_forces_legacy_even_when_filter_is_true() {
		add_filter( 'wp_use_application_passwords_react_ui', '__return_true' );
		add_action( 'wp_create_application_password_form', '__return_true' );

		$this->assertFalse( wp_use_application_passwords_react_ui() );
	}

	/**
	 * @ticket WOR-3
	 * @dataProvider data_column_extension_callbacks
	 */
	public function test_column_extension_hooks_force_legacy( $hook, $callback ) {
		add_filter( 'wp_use_application_passwords_react_ui', '__return_true' );
		add_filter( $hook, $callback );

		$this->assertFalse(
			wp_use_application_passwords_react_ui(),
			sprintf( 'Hook %s must force the legacy renderer (SEC-4).', $hook )
		);
	}

	public function data_column_extension_callbacks() {
		return array(
			'added column'            => array(
				'manage_application-passwords-user_columns',
				static function ( $columns ) {
					$columns['note'] = 'Note';
					return $columns;
				},
			),
			'removed column'          => array(
				'manage_application-passwords-user_columns',
				static function ( $columns ) {
					unset( $columns['last_ip'] );
					return $columns;
				},
			),
			'renamed column'          => array(
				'manage_application-passwords-user_columns',
				static function ( $columns ) {
					$columns['name'] = 'Application';
					return $columns;
				},
			),
			'custom column render'    => array(
				'manage_application-passwords-user_custom_column',
				'__return_empty_string',
			),
			'custom column JS template' => array(
				'manage_application-passwords-user_custom_column_js_template',
				'__return_empty_string',
			),
		);
	}

	/**
	 * @ticket WOR-3
	 */
	public function test_selector_is_not_fooled_by_list_table_columns_filter() {
		$this->assertTrue( wp_use_application_passwords_react_ui(), 'Decision must be made before the list table exists.' );

		require_once ABSPATH . 'wp-admin/includes/class-wp-list-table.php';
		require_once ABSPATH . 'wp-admin/includes/class-wp-application-passwords-list-table.php';
		set_current_screen( 'application-passwords-user' );
		new WP_Application_Passwords_List_Table( array( 'screen' => 'application-passwords-user' ) );

		$this->assertTrue(
			(bool) has_filter( 'manage_application-passwords-user_columns' ),
			'List table registration adds the columns filter; later checks would see an extension.'
		);
	}

	/**
	 * @ticket WOR-3
	 */
	public function test_boot_config_contains_only_presentation_fields() {
		$config = wp_get_application_passwords_ui_boot_config( self::$user_id );

		$this->assertSame(
			array( 'userId', 'renderer', 'canCreate' ),
			array_keys( $config )
		);
		$this->assertSame( self::$user_id, $config['userId'] );
		$this->assertSame( 'react', $config['renderer'] );
		$this->assertIsBool( $config['canCreate'] );
		$this->assertArrayNotHasKey( 'nonce', $config );
		$this->assertArrayNotHasKey( 'password', $config );
		$this->assertArrayNotHasKey( 'passwords', $config );
		$this->assertArrayNotHasKey( 'items', $config );
	}

	/**
	 * @ticket WOR-3
	 */
	public function test_boot_config_user_id_is_integer_from_php() {
		$config = wp_get_application_passwords_ui_boot_config( (string) self::$user_id );

		$this->assertIsInt( $config['userId'] );
		$this->assertSame( self::$user_id, $config['userId'] );
	}

	/**
	 * @ticket WOR-3
	 */
	public function test_react_mount_emits_node_and_non_secret_inline_config() {
		wp_enqueue_script( 'application-passwords' );

		$html = get_echo( 'wp_print_application_passwords_react_mount', array( self::$user_id ) );

		$this->assertStringContainsString( 'id="application-passwords-root"', $html );
		$this->assertStringNotContainsString( 'create-application-password', $html );
		$this->assertStringNotContainsString( 'tmpl-new-application-password', $html );
		$this->assertStringNotContainsString( 'application-passwords-list-table-wrapper', $html );

		$before = wp_scripts()->get_data( 'application-passwords', 'before' );
		$joined = implode( '', (array) $before );

		$this->assertStringContainsString( 'wpApplicationPasswordsSettings', $joined );
		$this->assertStringContainsString( '"userId":' . self::$user_id, $joined );
		$this->assertStringContainsString( '"renderer":"react"', $joined );
		$this->assertStringNotContainsString( '_wpnonce', $joined );
		$this->assertStringNotContainsString( 'X-WP-Nonce', $joined );
		$this->assertDoesNotMatchRegularExpression( '/"password"\s*:/', $joined );
	}

	/**
	 * @ticket WOR-3
	 */
	public function test_application_passwords_script_keeps_legacy_and_react_dependencies() {
		$scripts = new WP_Scripts();
		wp_default_scripts( $scripts );

		$registered = $scripts->query( 'application-passwords', 'registered' );

		$this->assertNotFalse( $registered );
		foreach ( array( 'jquery', 'wp-util', 'wp-api-request', 'wp-date', 'wp-i18n', 'wp-hooks', 'wp-element', 'wp-api-fetch', 'wp-application-passwords' ) as $dep ) {
			$this->assertContains( $dep, $registered->deps, $dep . ' must remain a dependency during dual-path support.' );
		}

		$package = $scripts->query( 'wp-application-passwords', 'registered' );
		$this->assertNotFalse( $package );
		foreach ( array( 'wp-element', 'wp-api-fetch', 'wp-date', 'wp-i18n', 'wp-hooks' ) as $dep ) {
			$this->assertContains( $dep, $package->deps, $dep . ' must be a dependency of the synced package.' );
		}
	}

	/**
	 * @ticket WOR-3
	 */
	public function test_user_edit_has_no_query_string_renderer_override() {
		$source = file_get_contents( ABSPATH . 'wp-admin/user-edit.php' );

		$this->assertStringNotContainsString( "\$_GET['application_passwords_ui']", $source );
		$this->assertStringNotContainsString( '$_REQUEST[\'application_passwords_ui\']', $source );
		$this->assertStringContainsString( 'wp_use_application_passwords_react_ui()', $source );
		$this->assertStringContainsString( 'wp_print_application_passwords_react_mount', $source );
	}
}
