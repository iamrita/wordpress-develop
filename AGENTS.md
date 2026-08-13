# AGENTS.md

This is the WordPress Core development repository (`wordpress-develop`). It is a PHP + MySQL +
JavaScript project whose local development environment runs in Docker (nginx, PHP-FPM, MySQL, and a
WP-CLI container). See `README.md` for the canonical developer commands; this file only records the
non-obvious details that matter when working inside a Cursor Cloud VM.

## Cursor Cloud specific instructions

The startup update script only runs `npm install`. Everything below (Docker daemon, containers,
asset build, WordPress install) must be brought up manually in the session before the site or the
PHP test suite will work.

### 1. Start the Docker daemon (required, not automatic)

This VM has no systemd (`systemctl` fails with "Host is down"), so the Docker daemon is not started
for you. Start it once per session and make the socket usable by the non-root `ubuntu` user, because
the project's npm scripts (`env:start`, `test:php`, `env:cli`, …) invoke `docker` **without** sudo:

```
sudo dockerd > /tmp/dockerd.log 2>&1 &   # or run in a tmux session so it survives
sleep 5
sudo chmod 666 /var/run/docker.sock
docker info                              # confirm the daemon is reachable
```

Docker is configured with the `fuse-overlayfs` storage driver and iptables-legacy (see
`/etc/docker/daemon.json`); this is required for docker-in-docker on this kernel. Do not switch the
storage driver back to `overlay2`.

### 2. Bring up the environment and install WordPress

After the daemon is running, from `/workspace`:

```
npm run build:dev     # build/copy JS+CSS into src/ (the site serves from src/, so this is needed)
npm run env:start     # docker compose up (mysql/php/nginx/cli) + composer install of PHP deps
npm run env:install   # create the DB, wp-config.php, and install WordPress
```

- Site front-end: http://localhost:8889 — admin: http://localhost:8889/wp-admin (`admin` / `password`).
- `env:start` also runs `composer update` **inside the PHP container**, so PHP/Composer do not need
  to be installed on the host. There is no host-level `php` or `composer` binary.
- To rebuild assets on change, run `npm run dev` (grunt watcher).

### 3. Lint / test / build commands

- JS lint: `npm run grunt jshint:<target>` (e.g. `jshint:grunt`, `jshint:tests`, `jshint:core`). This
  is the canonical JS linter. Note `npm run lint:jsdoc` (wp-scripts default config) reports many
  errors against legacy `src/js/_enqueues` files and is not a clean whole-repo gate.
- PHP tests: `npm run test:php` runs PHPUnit 9.6 inside the PHP container. Scope it to stay fast,
  e.g. `npm run test:php -- tests/phpunit/tests/functions/absint.php` or `-- --filter <name>`.
- PHP static analysis / coding standards: `npm run typecheck:php` (PHPStan) and the phpcs config in
  `phpcs.xml.dist`, both run through the container via composer scripts.
- E2E: `npm run test:e2e` (Playwright) requires the environment to be up.

### Node version note

The default `node` on PATH is v22 (`/exec-daemon/node`), which satisfies the repo's `engines`
(`>=20.10.0`) even though `.nvmrc` pins 20.x, so `npm install` (with `engine-strict=true`) and the
build tooling work as-is. Node 20 is also installed via nvm if an exact match is ever needed.
