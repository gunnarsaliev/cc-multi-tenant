# Payload Multi-Tenant Example

This example demonstrates how to achieve a multi-tenancy in [Payload](https://github.com/payloadcms/payload). Tenants are separated by a `Tenants` collection.

## Quick Start

To spin up this example locally, follow these steps:

1. Run the following command to create a project from the example:

- `npx create-payload-app --example multi-tenant`

2. `cp .env.example .env` to copy the example environment variables

3. `pnpm payload migrate` to create the database schema
4. `pnpm dev`, `yarn dev` or `npm run dev` to start the server
   - Press `y` when prompted to seed the database
5. `open http://localhost:3000` to access the home page
6. `open http://localhost:3000/admin` to access the admin panel

### Default users

The seed script seeds 3 tenants.
Login with email `demo@payloadcms.com` and password `demo`

## How it works

A multi-tenant Payload application is a single server that hosts multiple "tenants". Examples of tenants may be your agency's clients, your business conglomerate's organizations, or your SaaS customers.

Each tenant has its own set of users, pages, and other data that is scoped to that tenant. This means that your application will be shared across tenants but the data will be scoped to each tenant.

### Collections

See the [Collections](https://payloadcms.com/docs/configuration/collections) docs for details on how to extend any of this functionality.

- #### Users

  The `users` collection is auth-enabled and encompasses both app-wide and tenant-scoped users based on the value of their `roles` and `tenants` fields. Users with the role `super-admin` can manage your entire application, while users with the _tenant role_ of `admin` have limited access to the platform and can manage only the tenant(s) they are assigned to, see [Tenants](#tenants) for more details.

  For additional help with authentication, see the official [Auth Example](https://github.com/payloadcms/payload/tree/main/examples/cms#readme) or the [Authentication](https://payloadcms.com/docs/authentication/overview#authentication-overview) docs.

- #### Tenants

  A `tenants` collection is used to achieve tenant-based access control. Each user is assigned an array of `tenants` which includes a relationship to a `tenant` and their `roles` within that tenant. You can then scope any document within your application to any of your tenants using a simple [relationship](https://payloadcms.com/docs/fields/relationship) field on the `users` or `pages` collections, or any other collection that your application needs. The value of this field is used to filter documents in the admin panel and API to ensure that users can only access documents that belong to their tenant and are within their role. See [Access Control](#access-control) for more details.

  For more details on how to extend this functionality, see the [Payload Access Control](https://payloadcms.com/docs/access-control/overview) docs.

  **Domain-based Tenant Setting**:

  This example also supports domain-based tenant selection, where tenants can be associated with a specific domain. If a tenant is associated with a domain (e.g., `gold.localhost:3000`), when a user logs in from that domain, they will be automatically scoped to the matching tenant. This is accomplished through an optional `afterLogin` hook that sets a `payload-tenant` cookie based on the domain.

For the domain portion of the example to function properly, you will need to add the following entries to your system's `/etc/hosts` file:

```
127.0.0.1 gold.localhost silver.localhost bronze.localhost
```

- #### Pages

  Each page is assigned a `tenant`, which is used to control access and scope API requests. Only users with the `super-admin` role can create pages, and pages are assigned to specific tenants. Other users can view only the pages assigned to the tenant they are associated with. `title` is localized in English and Bulgarian, and the slug is shared across locales.

- #### Blog

  Tenant-scoped posts with a draft and publish workflow, version history and a lockable slug that is unique per tenant. Anonymous visitors can only read published posts. The slug fills in from the title as you type and stays fixed after the first save with a title, so published links keep working. The optional main image must come from the post's own tenant.

  `title` and `content` are localized in English and Bulgarian. A post has one slug across locales, and Bulgarian titles are transliterated into it. Publishing applies to all locales.

- #### Media

  Tenant-scoped image uploads, resized with Sharp and stored in the `media` folder at the project root.

## Localization

Content is available in English (`en`, the default) and Bulgarian (`bg`). Pass `?locale=en` or `?locale=bg` to the REST API, or `locale` to the Local API. A missing translation falls back to the other language only when a locale is passed explicitly.

## Access control

Basic role-based access control is set up to determine what users can and cannot do based on their roles, which are:

- `super-admin`: They can access the Payload admin panel to manage your multi-tenant application. They can see all tenants and make all operations.
- `user`: They can only access the Payload admin panel if they are a tenant-admin, in which case they have a limited access to operations based on their tenant (see below).

This applies to each collection in the following ways:

- `users`: Only super-admins, tenant-admins, and the user themselves can access their profile. Anyone can create a user, but only these admins can delete users. See [Users](#users) for more details.
- `tenants`: Only super-admins and tenant-admins can read, create, update, or delete tenants. See [Tenants](#tenants) for more details.
- `pages`: Everyone can access pages, but only super-admins and tenant-admins can create, update, or delete them.

> If you have versions and drafts enabled on your pages, you will need to add additional read access control condition to check the user's tenants that prevents them from accessing draft documents of other tenants.

For more details on how to extend this functionality, see the [Payload Access Control](https://payloadcms.com/docs/access-control/overview#access-control) docs.

## CORS

This multi-tenant setup requires an open CORS policy. Since each tenant contains a dynamic list of domains, there's no way to know specifically which domains to whitelist at runtime without significant performance implications. This also means that the `serverURL` is not set, as this scopes all requests to a single domain.

Alternatively, if you know the domains of your tenants ahead of time and these values won't change often, you could simply remove the `domains` field altogether and instead use static values.

For more details on this, see the [CORS](https://payloadcms.com/docs/production/preventing-abuse#cross-origin-resource-sharing-cors) docs.

## Front-end

The frontend is scaffolded out in this example directory. You can view the code for rendering pages at `/src/app/(app)/tenant-slugs/[tenant]/[...slug]/page.tsx`. This is a starter template, you may need to adjust the app to better fit your needs.

## Questions

If you have any issues or questions, reach out to us on [Discord](https://discord.com/invite/payload) or start a [GitHub discussion](https://github.com/payloadcms/payload/discussions).

## Cookie consent

Each tenant has one cookie banner and a log of the consents its visitors gave. Tenant sites show the banner themselves and talk to two public endpoints.

- **Banner settings** (`consent-settings`): one per tenant, under Cookie consent in the admin. Texts are per language, and an empty text uses the standard wording. Besides the always-on necessary cookies it can ask about preferences, statistics and marketing, the same four categories Cookiebot uses. Raising **revision** shows the banner again to everyone who already answered.
- **Consent log** (`consent-logs`): one row per answer or change. Tenant admins and super admins can read it, and nobody can add, edit or delete rows. No IP address is stored.
- `GET /api/consent/config?tenant=<slug>&locale=<code>` returns the banner settings.
- `POST /api/consent/log` records a consent. It only accepts browsers on the tenant's `domain` (with or without `www`), so that field must match the site's address. Localhost is accepted outside production. This stops other websites writing to a tenant's log, but a script can fake the header, so add rate limiting before going live.

`examples/consent-banner/CookieBanner.tsx` is a ready-made banner for a tenant's Next.js site, built on [vanilla-cookieconsent](https://cookieconsent.orestbida.com).

## AI features

Everything works without API keys for development: set `AI_MOCK=true` for offline stand-in models (never active in production). Without keys or the mock, the app runs normally and AI features report that they aren't configured.

The database needs [pgvector](https://github.com/pgvector/pgvector) 0.8 or later. `docker compose up` starts one, or use `brew install pgvector`.

- **Compose:** buttons on a blog post's title, content and main image generate text and images with [`@ai-stack/payloadcms`](https://github.com/ashbuilds/payload-ai). It needs `OPENAI_API_KEY`, which goes directly to OpenAI rather than through the Gateway. Tenant admins and super admins can generate; only super admins can edit the prompts, because all tenants share them.
- **Field translation:** the Compose menu on a field translates it to Bulgarian or English. It rewrites that field in the locale being edited, so switch the admin to the target locale first, and copy the source text in if that field is empty. To translate a whole post from another locale, use the Translate button instead.
- **Translate:** the button on a blog post fills the locale selected in the admin from another locale, and saves the result as a draft. Publishing still applies to all locales.
- **Search:** `GET /api/search?tenant=<slug>&q=<text>&locale=<code>` searches published content by meaning and keywords. Publishing queues a job that updates the index. `pnpm search:backfill` indexes everything, for example after first adding keys.
- **MCP:** `/api/mcp` can read and create `blog` posts and read `pages`, plus `semanticSearch` and `translatePost`. Create keys under MCP → API Keys. A key acts as its owner, within that user's access. Give each tenant a service user with the `tenant-admin` role. To use it from Claude Code, the project's `.mcp.json` connects to `http://localhost:3000/api/mcp`: export `PAYLOAD_MCP_API_KEY` with your key.
- **Assistant:** an [eve](https://eve.dev/docs) agent at `/admin/assistant`, in `agent/`. It needs Node 24, `EVE_ENABLED=true` and `PAYLOAD_MCP_KEYS`. Outside Vercel, it also needs Docker for eve's sandbox.

### Going live

1. Set `AI_GATEWAY_API_KEY` (or use Vercel OIDC when deployed) and `AI_TRANSLATION_MODEL`, chosen from the [Gateway's model list](https://ai-gateway.vercel.sh/v1/models).
2. Try real en→bg and bg→en translations.
3. Run `pnpm search:backfill`, then test search with real Bulgarian queries. Adjust `SEARCH_MAX_VECTOR_DISTANCE` if unrelated results appear or good ones go missing.
4. Create the service users and MCP keys, and set `PAYLOAD_MCP_KEYS`.
5. Set `EVE_ENABLED=true` and `AI_AGENT_MODEL`, then run `npx eve eval`.
6. Set `CRON_SECRET`, add rate limiting to `/api/search`, and move `media` to cloud storage, since Vercel's function storage doesn't persist.

### Database and tests

The schema is managed by migrations in every environment, and they only run when you run them: neither `pnpm dev` nor a deploy applies them. After changing a collection, run `pnpm payload migrate:create`, then `pnpm payload migrate`. If there are pending migrations, the app can fail on queries for tables and columns that don't exist yet.

In production, run `pnpm payload migrate` with `POSTGRES_URL` pointing at the production database before the deployment that needs the change goes live. `pnpm dev:fresh` wipes the database, then applies every migration and reseeds.

`pnpm test` runs against a separate database, which must have a name ending in `_test`: run `createdb multi_tenant_test`, or set `TEST_POSTGRES_URL`.
# cc-multi-tenant
