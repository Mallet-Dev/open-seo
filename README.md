# OpenSEO

OpenSEO is a self-hosted search workbench. This fork extends [OpenSEO by every-app](https://github.com/every-app/open-seo) with geographic rank evidence, saved search and analytics reports, and project-scoped investigation tools.

## Run locally

Install Docker with Compose 2.24 or newer, then build the checkout:

```sh
git clone --branch workbench https://github.com/Mallet-Dev/open-seo.git
cd open-seo
docker compose up -d --build --wait
```

Open [localhost:3001](http://localhost:3001). The default installation is a private, single-administrator workspace. You can open the app and inspect saved examples without a provider key. Live searches and AI requests use your configured providers and can incur charges. See the [Docker guide](docs/SELF_HOSTING_DOCKER.md) for configuration, health checks, updates and backup recovery.

## Explore a project

- Research keywords, domains, backlinks and organic rankings.
- Compare local search results by map point, business and observation date. Inspect missing observations and saved source evidence.
- Follow search performance from Google Search Console into Google Analytics. Review technical audits, business reviews and AI visibility in the same project.

For development, use the [local setup guide](docs/LOCAL_DEVELOPMENT.md). For remote access, review the [Cloudflare Access guide](docs/SELF_HOSTING_CLOUDFLARE.md). The [quality guide](docs/QUALITY-EVALUATION.md) describes controlled test coverage and its limits.

## Project and licence

Use [this fork](https://github.com/Mallet-Dev/open-seo) for source, updates and [contribution guidance](docs/CONTRIBUTING.md). The original project's [hosted app and pricing](https://openseo.so) and the inherited marketing site in `web/` describe the upstream service. The upstream [MIT licence](LICENSE) and [map library attribution](public/licenses/leaflet.txt) are retained.
