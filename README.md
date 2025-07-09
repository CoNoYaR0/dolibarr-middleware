# Dolibarr Integration Middleware

## Overview

This project is a Node.js (Fastify) middleware application designed to synchronize data (products, categories, variants, image metadata, stock levels) from a Dolibarr ERP instance into an optimized PostgreSQL database. It then exposes this synchronized data via a RESTful API for consumption by frontend applications or other services.

The primary goals are:
-   Decouple frontend applications from direct Dolibarr API calls, improving frontend performance and resilience.
-   Reduce direct load on the Dolibarr instance.
-   Provide a more flexible and potentially enriched data source than the raw Dolibarr API.
-   Enable real-time (or near real-time) updates through webhooks and a polling fallback mechanism.
-   Store metadata for product images, with actual image files served from your own CDN (e.g., OVH hosting at `https://cdn.stainedglass.tn/`) managed by an external script.

## Features (Planned & Implemented)

-   **Data Synchronization:**
    -   [x] Categories
    -   [x] Products
    -   [x] Product Variants
    -   [x] Product Image Metadata (constructs CDN URLs pointing to your OVH CDN; actual file placement is external)
    -   [x] Stock Levels
-   **Synchronization Mechanisms:**
    -   [x] Initial full data sync (manually triggerable - *CLI/endpoint for this TBD*)
    -   [x] Webhook handling (Proof of Concept for products, categories, stock - *needs Dolibarr-specific payload adaptation*)
    -   [x] Polling service for fallback/regular updates (Implemented for stock levels)
-   **API:**
    -   [x] `GET /api/v1/categories` - List all categories.
    -   [x] `GET /api/v1/products` - List products with pagination, basic filtering by category, and sorting.
    -   [x] `GET /api/v1/products/:slug` - Get a single product by slug, including its variants, images (URLs), and stock.
    -   [x] API Documentation via Swagger/OpenAPI available at `/documentation`.
-   **Tech Stack:**
    -   Node.js
    -   Fastify (web framework)
    -   PostgreSQL (database)
    -   Image hosting on your own CDN (e.g., OVH, configured via `CDN_BASE_URL`). Requires an external script (e.g., PHP) on that CDN server to place images.
    -   Docker & Docker Compose (for development and deployment of this middleware)
    -   Vitest (for testing)

## Prerequisites

-   Node.js (v18+ recommended)
-   npm (or yarn)
-   Docker & Docker Compose
-   A running PostgreSQL instance (Docker Compose provides one for development)
-   A running Dolibarr instance with API access enabled.
-   Your own CDN hosting (e.g., an OVH web server) accessible via a public URL (e.g., `https://cdn.stainedglass.tn/`) where product images will be placed.
-   An external script (e.g., PHP, like the `sync_images.php` from the initial CDN task) running on your CDN server, responsible for fetching original images from Dolibarr and placing them into the correct public directory on your CDN server. This middleware will only store the expected URLs.

## Project Structure

```
dolibarr-middleware/
├── migrations/                 # SQL database migration files
│   ├── 001_initial_schema.sql
│   └── 002_update_product_images_for_ovh_cdn.sql
├── src/                        # Source code
│   ├── config/                 # Configuration management (index.js)
│   ├── controllers/            # API route handlers
│   ├── routes/                 # API and webhook route definitions
│   ├── services/               # Business logic and external service integrations
│   │   ├── __tests__/          # Unit/integration tests
│   │   ├── dbService.js
│   │   ├── dolibarrApiService.js
│   │   ├── pollingService.js
│   │   └── syncService.js      # (s3Service.js has been removed)
│   ├── utils/                  # Utility functions
│   └── server.js               # Fastify server setup
├── .env.example                # Example environment variables file
├── .eslintrc.json
├── .gitignore
├── .prettierrc.json
├── Dockerfile
├── docker-compose.yml
├── package-lock.json
├── package.json
├── README.md                   # This file
└── vitest.config.js
```

## Configuration

Create a `.env` file in the root of the `dolibarr-middleware` project using `.env.example` as a template.

**Key Environment Variables:**

-   `NODE_ENV`, `PORT`, `LOG_LEVEL`
-   `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL_MODE`
-   `DOLIBARR_API_URL`, `DOLIBARR_API_KEY`, `DOLIBARR_WEBHOOK_SECRET`
-   `CDN_BASE_URL`: The base public URL for your images on your OVH CDN (e.g., `https://cdn.stainedglass.tn/your-image-folder/`). **Ensure this ends with a trailing slash.**
-   `POLLING_ENABLED`, `POLLING_STOCK_SYNC_INTERVAL`

*(AWS variables like `AWS_ACCESS_KEY_ID`, etc., are no longer required for this middleware).*

## Installation

1.  Clone repository.
2.  Navigate to `dolibarr-middleware`.
3.  Create and configure `.env`.
4.  Run `npm install`.

## Running the Application

### Development (with Docker Compose)

1.  Ensure Docker & Docker Compose are running.
2.  Have `.env` configured (especially `DB_HOST=db`).
3.  Run `docker-compose up --build`.
4.  App at `http://localhost:PORT`, API docs at `/documentation`.
5.  PostgreSQL on host at `DB_EXTERNAL_PORT` (default 5433).

### Applying Database Migrations

1.  Connect to the PostgreSQL DB (details in README for manual psql).
2.  Run SQL from `migrations/001_initial_schema.sql`.
3.  Then run SQL from `migrations/002_update_product_images_for_ovh_cdn.sql`.

*(A proper migration tool is a future improvement).*

## Image Handling Workflow (OVH CDN)

1.  This Node.js middleware fetches product data from Dolibarr, including metadata about images (e.g., filename, Dolibarr's internal path/ID for the image).
2.  The `syncProductImageMetadata` function in this middleware constructs an expected public URL for each image (e.g., `CDN_BASE_URL` + `filename`). This URL and other metadata (alt text, display order) are stored in the `product_images` table in the PostgreSQL database.
3.  **Crucially, an external script (e.g., a PHP script like `sync_images.php` from the original `cdn/` task, running on your OVH server) is responsible for:**
    *   Actually fetching the original image file from Dolibarr (using the `original_dolibarr_path` or `original_dolibarr_filename` stored by this middleware, or by directly querying Dolibarr's API/document store).
    *   Saving/copying this image file to the correct public directory on your OVH server so that it's accessible via the constructed `cdn_url`.
    *   This external script needs to be triggered (e.g., via cron job on OVH, or perhaps a webhook call from this middleware if your OVH server can receive it). The details of this external script are outside the scope of this Node.js middleware project but are essential for images to appear.

## Running Tests, Triggering Sync, Webhook Setup

(These sections remain largely the same as before, but remember image sync now only handles metadata).

## Further Development & TODOs

-   (Existing TODOs...)
-   **Develop/Refine the external PHP script on OVH for actual image file synchronization.** Ensure its logic for determining source (from Dolibarr) and destination filenames/paths on OVH matches what this middleware stores in `cdn_url` and `original_dolibarr_filename/path`.
-   Consider how the external OVH image sync script will be triggered.

---

This README provides a starting point. It should be expanded as the project evolves.
