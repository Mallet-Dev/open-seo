# Run OpenSEO with Docker

Docker Compose builds this fork from the checkout and stores its local D1, KV and object data in the project's `open_seo_data` volume. Use Docker Engine with Compose 2.24 or newer. This installation uses one shared local administrator and listens on loopback. Anyone who can reach the app can act as that administrator.

## Start

```sh
git clone --branch workbench https://github.com/Mallet-Dev/open-seo.git
cd open-seo
docker compose config --quiet
docker compose up -d --build --wait
```

Open [localhost:3001](http://localhost:3001). Startup installs locked dependencies, applies local migrations and builds the app. A first start can take several minutes. Open the workbench without provider credentials to inspect the setup and saved examples. Live search and AI requests require the corresponding provider account and may incur costs.

Build from a clean checkout of the revision you intend to run. Keep private files outside the source and public asset directories.

The service reads optional settings from a private `.env` file in the checkout. For search data, follow the [DataForSEO setup guide](./DATAFORSEO_API_KEY.md). AI features use `OPENROUTER_API_KEY`. Set `PORT` to choose a different local port. Reapply changes with `docker compose up -d --force-recreate --wait`. Keep the local administrator behind authentication before granting remote access. `ALLOWED_HOST` only permits the specified hostname in the preview server. For Cloudflare Access, see the [Cloudflare installation guide](./SELF_HOSTING_CLOUDFLARE.md).

## Check readiness

```sh
docker compose config --quiet
docker compose ps
docker compose exec -T open-seo node scripts/selfhost-health.mjs
```

The last command succeeds when the app and its database are ready. The local `/api/health` response includes feature status and setup guidance. Optional providers can be unconfigured. Use `docker compose logs open-seo` for startup diagnostics and review logs privately before sharing.

## Back up and update

Run the commands from the same checkout with the same Compose project name. Store the archive outside the checkout in a private directory. The archive contains all local application data and can include OAuth state. Keep your runtime configuration and any encryption secret separately in secure storage.

```sh
docker compose stop open-seo
sh scripts/selfhost-state.sh backup ../open-seo-before-update.tar.gz
git rev-parse HEAD
git switch workbench
git pull --ff-only origin workbench
docker compose up -d --build --wait
```

Keep the printed previous revision with the archive. The backup copies the application state directory, leaving generated build paths out of the archive. If you previously used `docker compose down`, run `docker compose create open-seo` with the original project name to reattach its volume before backing up. The backup command refuses to replace an existing archive. Choose a fresh filename for the next backup. Restart the original service with `docker compose up -d --wait` if you stop before updating.

## Restore and verify

Use a clean checkout of the revision matching the backup. Use an unused Compose project name for a fresh volume and a different port to keep the original installation available. Supply the matching private configuration to the restored installation. Restore archives you created and trust.

```sh
export COMPOSE_PROJECT_NAME=open-seo-restore
export PORT=3102
docker compose build
sh scripts/selfhost-state.sh restore ../open-seo-before-update.tar.gz
docker compose up -d --wait
docker compose exec -T open-seo node scripts/selfhost-health.mjs
```

Open [localhost:3102](http://localhost:3102) and verify a known saved project or report before switching traffic. Restore refuses to write into a populated volume. If restoration is interrupted, retry with a new project name. Preserve the original volume until the restored data has been verified.

## Telemetry

Self-host usage reporting is off by default. Setting `OPENSEO_TELEMETRY_ENABLED=1` opts this installation into aggregate usage and setup-status reporting to the original OpenSEO project's PostHog service. `OPENSEO_TELEMETRY_DISABLED=1` or `DO_NOT_TRACK=1` overrides opt-in. Recreate the service after changing settings.
