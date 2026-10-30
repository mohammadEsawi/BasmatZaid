# Basmat Zaid (بصمة زيد)

E-commerce store for handmade gypsum crafts, favors, gifts and molds. Customers order as guests, every order is saved in PostgreSQL, stock is managed automatically, WhatsApp is used to confirm orders, and the business is run from a dashboard at `/admin/login`.

**Stack:** React, TypeScript, Vite, Tailwind, shadcn/ui-style components, React Router, React Hook Form, Zod · Express 5, Prisma 6, PostgreSQL · Vitest, Supertest.

## Project structure

```
backend/
  prisma/            schema, migrations, seed
  src/modules/       auth, products, categories, inventory, orders, customers,
                     delivery, settings, dashboard, uploads
  src/middleware/    auth + CSRF + roles, rate limits, error handling
  src/services/      image storage, WhatsApp messages
  src/scripts/       create-admin
  tests/             API and unit tests
frontend/
  src/pages/         store/ and admin/ route pages
  src/features/      cart, checkout, orders, admin auth
  src/components/    ui/, store/, admin/
  src/services/      API clients
docker-compose.yml
```

## Local development

Requires Node 20+ and PostgreSQL.

```bash
npm install
cp backend/.env.example backend/.env      # set DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
createdb basmat_zaid
npm run db:deploy                         # apply migrations
npm run db:seed                           # settings, categories, delivery areas, first admin
npm run dev                               # API on :4000, store on :5173
```

Set `SEED_DEMO_DATA=true` before seeding to add demo products. To run each side alone: `npm run dev:backend`, `npm run dev:frontend`.

Vite proxies `/api` and `/uploads` to the API, so no CORS setup is needed in development.

**After the first login,** set the order WhatsApp number in `/admin/settings`. Until then, orders still save normally but no WhatsApp button appears.

## Admin accounts

There is no default password and no public registration. The account comes from environment variables:

```bash
npm run admin:create                         # creates ADMIN_EMAIL with ADMIN_PASSWORD (role OWNER)
npm run admin:create -- --reset-password     # changes the password and revokes all sessions
```

Passwords need 12+ characters with letters and digits. Remove `ADMIN_PASSWORD` from the environment once the account exists.

Roles: `OWNER` and `ADMIN` manage everything; `STAFF` can view everything, process orders and adjust stock, but cannot change the catalogue or settings.

## Testing

```bash
createdb basmat_zaid_test
cp backend/.env.test.example backend/.env.test
npm test
```

Backend tests refuse to run unless the database name ends in `_test`, because they empty its tables between tests. They cover login, authorization, CSRF, products, stock changes, prices, delivery fees, concurrent orders (no overselling), duplicate submissions, cancellation, WhatsApp messages and uploads.

To try the whole flow by hand: add a product to the cart at `http://localhost:5173`, check out, press the WhatsApp button, then find the order under `/admin/orders`. Confirm that stock dropped; cancel the order and confirm it came back.

## How orders work

1. The checkout page shows totals from `POST /api/orders/quote`. The browser never supplies prices.
2. `POST /api/orders` runs one database transaction: validate and price from the database, decrement stock with a guarded update (`WHERE stock >= quantity`), upsert the customer, assign the order number, save the order, items, status history and inventory movements. Any failure rolls back everything.
3. Stock is taken when the order is created. Cancelling restores it exactly once (`inventoryStatus` moves `DEDUCTED` → `RESTORED` in a guarded update).
4. A client-generated idempotency key means double clicks and retries return the same order.
5. The WhatsApp link is built from the saved order. Customers open it themselves; nothing is sent automatically.

Inventory terms: **available** can still be ordered, **reserved** is in open orders, **sold** is in completed orders, **on hand** = available + reserved.

Status flow: `NEW → CONFIRMED → PREPARING → READY → OUT_FOR_DELIVERY (delivery only) → COMPLETED`. Orders can be cancelled until completed; completed and cancelled orders are final.

Deleting a product that appears in orders archives it instead, and order items keep snapshots of names and prices.

## Production deployment

### Docker

```bash
cp .env.example .env      # set every value
docker compose up -d --build
```

On start, the API applies migrations and seeds base data (existing rows are never overwritten). Nginx serves the store on `HTTP_PORT` and forwards `/api` and `/uploads`.

**HTTPS is required.** Admin cookies are `Secure` in production, so put an HTTPS proxy (Caddy, Nginx, Cloudflare) in front. `TRUST_PROXY=2` in the compose file assumes exactly that proxy plus the bundled Nginx. Without an outer proxy, set it to `1`, or clients could spoof their IP and bypass rate limits.

Back up the `db-data` and `uploads` volumes.

### Without Docker

```bash
npm ci
npm run build
npm run db:deploy
npm run db:seed
NODE_ENV=production node backend/dist/server.js
```

Serve `frontend/dist` as a static site with a fallback to `index.html`.

If the frontend and API are on different domains, build with `VITE_API_URL=https://api.example.com`, add the frontend to `CORS_ORIGINS`, and set `COOKIE_SAMESITE=none`. Same-site subdomains can keep `lax`.

## Environment variables

Full lists with comments: `backend/.env.example`, `frontend/.env.example`, and `.env.example` for Docker.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection |
| `CORS_ORIGINS` | Allowed frontend origins, comma-separated |
| `TRUST_PROXY` | Number of reverse proxies in front of the API |
| `SESSION_TTL_HOURS` | Admin session lifetime |
| `COOKIE_SAMESITE`, `COOKIE_SECURE`, `COOKIE_DOMAIN` | Admin cookie settings |
| `STORAGE_PROVIDER` | `local` or `cloudinary` (with `CLOUDINARY_*`) |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | Local storage folder and upload size limit |
| `ADMIN_*` | First admin account |
| `SEED_DEMO_DATA` | Demo products, development only |
| `VITE_API_URL` | API address for the frontend, set at build time |

## Security

- Argon2id password hashing; server-side sessions stored hashed, in HTTP-only cookies
- CSRF token required on every admin write; roles checked on the server
- Rate limits on login, orders, tracking and the API overall
- Uploaded images are decoded and re-encoded to WebP, which rejects disguised files and strips metadata
- Input validated with Zod; database access through Prisma; CHECK constraints block negative stock and prices
- Order tracking needs the secret token or the phone number on the order

## Known limitations

- Payment is recorded manually (cash or bank transfer); there is no online payment.
- A completed order cannot be cancelled or refunded in the system. Handle it with a manual stock adjustment and the payment status.
- Additional admin accounts have no dashboard screen; add them with the script or database. The script always creates an `OWNER`.
- The stock filters on the products page work in memory, which suits catalogues up to a few thousand products.
- Rate limits are per process. Running several API instances needs a shared store such as Redis.
