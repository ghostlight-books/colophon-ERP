# Colophon ERP

Colophon is a modular bookstore ERP monorepo.

## Stack

- Monorepo: npm workspaces
- Backend: Node.js, Express, TypeScript
- Database: Prisma + SQLite
- Frontend: React, Vite, TypeScript, Tailwind CSS
- Shared: TypeScript types + Zod validation schemas

## Workspace Layout

- `packages/shared`: Shared domain types and validation schemas
- `packages/database`: Prisma schema, migrations, and seed scripts
- `server`: API hub and backend modules
- `client`: Frontend web app

## Quick Start

1. Install dependencies:
   `npm install`
2. Copy env:
   `cp .env.example .env`
3. Generate Prisma client:
   `npm run db:generate`
4. Run migrations:
   `npm run db:migrate`
5. Seed database:
   `npm run db:seed`
6. Start dev mode across workspaces:
   `npm run dev`

## Render deployment

The root `render.yaml` defines two Render services:

- `colophon-api`: the Express API with a 1 GB persistent disk for the SQLite database.
- `colophon-client`: the Vite static site, configured to call the API service.

To deploy:

1. Put this ERP root directory in the GitHub repository you want Render to deploy. The nested `colophon-erp/` directory is a separate Shopify template repository and should not be used as the Render root.
2. In Render, choose **New > Blueprint**, connect the GitHub repository, and select `render.yaml`.
3. Review the generated services and deploy. Render generates `CREDENTIAL_ENCRYPTION_KEY` and `ADMIN_MASTER_KEY`; do not replace them with values from source control.
4. After the first deploy, confirm the API health check at `https://<api-host>/api/health` and open the client URL.
5. Add `SQUARE_ACCESS_TOKEN` and `SQUARE_LOCATION_ID` to the `colophon-api` service if Square payments are enabled.

The API service uses `prisma migrate deploy` during Render's pre-deploy phase. The persistent disk is required because Render's default filesystem is ephemeral. The included SQLite setup is suitable for an initial single-instance deployment; move to a managed PostgreSQL database before adding multiple API instances or requiring higher availability.

## Shopify app configuration

The root `shopify.app.toml` contains the Shopify app identity, inventory/order scopes, and webhook declarations for the existing ERP. The generated Shopify template is kept separately under `colophon-erp/` because replacing the current Vite/Express runtime with a second React Router app would break the ERP.

Before linking or deploying, replace `https://example.com` in `shopify.app.toml` with the public HTTPS URL for the ERP and implement the declared OAuth callback and webhook signature verification. Local development commands are available as `npm run shopify:dev`, `npm run shopify:config`, and `npm run shopify:deploy`.

## Book lookup and pricing

Intake uses Open Library for free metadata and makes one conservative request to the public ThriftBooks search page for pricing. Successful lookup records are persisted in the SQLite `IsbnLookupCache` table, so a stored ISBN is returned locally without requesting any external provider again. The cache also prevents duplicate concurrent price requests.

The direct scraper uses a clear user agent, a ten-second timeout, and no CAPTCHA, authentication, or bot-protection bypass. A site markup change or access restriction can make a price unavailable, in which case the cached record keeps the metadata and a null price.
