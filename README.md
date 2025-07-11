[Français](./README-fr.md)

---
# Dolibarr Integration Middleware

## 1. Introduction

**Purpose:** This project, "Dolibarr Integration Middleware," is a standalone Node.js application built with Fastify and PostgreSQL. Its primary function is to act as an intermediary between a Dolibarr ERP instance and frontend applications or other services. It synchronizes key data (products, categories, variants, image metadata, stock levels) from Dolibarr into its own optimized PostgreSQL database. This data is then exposed via a RESTful API. Products can be associated with multiple categories.

**Scope & Goals:**
-   **Decoupling:** To decouple frontend systems from direct reliance on the Dolibarr API, thereby improving frontend performance, resilience, and allowing for independent scaling.
-   **Performance:** To provide a faster, more optimized data source for read-heavy operations typically required by e-commerce frontends or product listings.
-   **Data Enrichment (Future):** To potentially enrich Dolibarr data with information from other sources or apply custom business logic before exposing it.
-   **Real-time Updates:** To achieve near real-time data synchronization using Dolibarr webhooks (with polling as a fallback mechanism).
-   **Flexible Image Handling:** To manage image metadata and construct CDN URLs, assuming image files are hosted on a user-configured CDN (e.g., an OVH web server), with the actual file placement managed by an external script.

**Target Users:** Developers building frontend experiences (e.g., e-commerce websites, product catalogs) based on data managed in Dolibarr, or developers needing a more robust API layer for Dolibarr data.

## 2. Features Implemented

-   **Data Synchronization Engine (`syncService.js`):**
    -   Synchronization of Categories, Products (with many-to-many category linking), Product Variants, Product Image Metadata, and Stock Levels.
    -   Transformation functions to map Dolibarr API responses to the local PostgreSQL schema (includes handling of Unix timestamps from Dolibarr for date fields).
    -   Initial full data sync capability (`runInitialSync` script in `package.json`).
    -   Handles basic pagination from Dolibarr API during sync.
-   **Image Metadata Handling (OVH CDN Strategy):**
    -   Stores image metadata (alt text, display order, original Dolibarr identifiers).
    -   Constructs image URLs based on a configured `CDN_BASE_URL`.
    -   **Note:** Actual image file uploading/placement to the CDN server is handled by an external script, not this middleware.
-   **Dolibarr API Interaction (`dolibarrApiService.js`):**
    -   Client service for making requests to the Dolibarr REST API. Adjusted for Dolibarr v18.0.4 specifics (e.g., category sorting, stock endpoint `/products/{id}/stock`, fetching product categories via `/categories/object/product/{id}`).
    -   Handles API key authentication and request timeouts.
-   **Webhook Handling (`webhookRoutes.js`):**
    -   Proof-of-concept endpoint (`/webhooks/dolibarr`) to receive webhooks from Dolibarr.
    -   Endpoint `POST /webhooks/webhook` to receive and process webhooks from Dolibarr.
    -   Secret key validation using `DOLIBARR_WEBHOOK_SECRET` environment variable (expects `X-Dolibarr-Webhook-Secret` header from Dolibarr - *actual header name may vary, confirm with your Dolibarr setup*).
    -   Supported events:
        -   `PRODUCT_CREATE`: Creates product, links categories, syncs variants and stock.
        -   `PRODUCT_MODIFY`: Updates product, re-links categories, re-syncs variants and stock.
        -   `PRODUCT_DELETE`: Deletes product and associated data (variants, stock, category links, images).
        -   `CATEGORY_CREATE`: Creates category, resolving parent-child relationships.
        -   `CATEGORY_MODIFY`: Updates category, including parent-child relationships.
        -   `CATEGORY_DELETE`: Deletes category (links from products are removed; child categories become top-level if `parent_id` FK schema update is applied).
        -   `STOCK_MOVEMENT`: Triggers a full stock re-sync for the affected product from Dolibarr.
    -   Asynchronous processing of webhooks to ensure quick response to Dolibarr.
-   **Polling Service (`pollingService.js`):**
    -   Cron-based polling for periodic data synchronization (can complement webhooks or act as a fallback).
-   **RESTful API (`apiRoutes.js`, Controllers):**
    -   `GET /api/v1/categories`: List all categories.
    -   `GET /api/v1/products`: List products with pagination, sorting, and filtering by a single `category_id` (leveraging the many-to-many relationship).
    -   `GET /api/v1/products/:slug`: Get a single product, including its variants, image URLs, stock levels, and an array of all its associated categories.
-   **API Documentation (`server.js`, Swagger):**
    -   Automatic OpenAPI (Swagger) specification generation via `@fastify/swagger` and UI via `@fastify/swagger-ui`.
-   **Database (`dbService.js`, `migrations/`):**
    -   PostgreSQL schema including `products`, `categories`, `product_variants`, `product_images`, `stock_levels`, and a `product_categories_map` junction table for many-to-many product-category links.
    -   Migrations for initial schema, OVH CDN image updates, and product-category many-to-many setup.
-   **Configuration (`config/index.js`, `.env`):**
    -   Centralized configuration using environment variables.
-   **Logging & Error Handling (`logger.js`, `server.js`):**
    -   Structured logging (Pino), centralized error handling.
-   **Dockerization (`Dockerfile`, `docker-compose.yml`):**
    -   Multi-stage `Dockerfile` and `docker-compose.yml` for development.
-   **Testing (`vitest.config.js`, `src/**/__tests__`):**
    -   Vitest testing framework. Unit tests for `syncService.js` transformations.
-   **Security Headers (`server.js`):**
    -   Basic security headers via `@fastify/helmet`. (Fastify 5.x compatible version).

## 3. Architectural Choices & Key Technologies
    (No significant changes here, but Fastify version is now 5.x)
-   **Node.js:** Runtime environment.
-   **Fastify (v5.x):** High-performance web framework.
-   **PostgreSQL:** Relational database.
-   **Docker & Docker Compose:** Containerization.
-   **Vitest:** Testing framework.
-   **Webhook-First with Polling Fallback:** Synchronization strategy.
-   **Standalone Service:** Decoupled architecture.
-   **Environment Variable Configuration.**
-   **OVH-based CDN for Images.**

## 4. Project Structure
(The structure itself is largely unchanged, but the new migration file is relevant)
```
dolibarr-middleware/
├── migrations/                 # SQL database migration files
│   ├── 001_initial_schema.sql
│   ├── 002_update_product_images_for_ovh_cdn.sql
│   └── 003_product_many_to_many_categories.sql # New
# ... (rest of structure is the same)
```

**Key Files & Roles:**
(Descriptions for `syncService.js`, `dolibarrApiService.js`, `productController.js` should implicitly include the new many-to-many category logic and API adaptations).

## 5. Setup and Installation
(Largely the same, emphasize applying all migrations)

**Steps:**
1.  ...
2.  ...
3.  ...
4.  **Install Dependencies:** `npm install` (Fastify 5.x and compatible plugins are now used).

## 6. Running the Application

### B. Applying Database Migrations
Execute the SQL migration files from the `migrations/` directory in order:
    *   `migrations/001_initial_schema.sql`
    *   `migrations/002_update_product_images_for_ovh_cdn.sql`
    *   `migrations/003_product_many_to_many_categories.sql`
    *   **Important for Webhooks:** A migration to add `parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL` to the `categories` table is crucial for correct hierarchical updates when parent categories are deleted via webhooks. If not already present, this should be added. Example:
        ```sql
        -- Migration: 004_add_parent_id_fk_to_categories.sql (example name)
        BEGIN;
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id INTEGER DEFAULT NULL;
        ALTER TABLE categories ADD CONSTRAINT fk_categories_parent_id FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL;
        COMMIT;
        ```
    *(And any subsequent migration files)*
    *Example using `psql` (if installed locally):*
    ```bash
    psql -h localhost -p 5433 -U YOUR_DB_USER -d YOUR_DB_NAME -f migrations/001_initial_schema.sql
    psql -h localhost -p 5433 -U YOUR_DB_USER -d YOUR_DB_NAME -f migrations/002_update_product_images_for_ovh_cdn.sql
    psql -h localhost -p 5433 -U YOUR_DB_USER -d YOUR_DB_NAME -f migrations/003_product_many_to_many_categories.sql
    ```

### C. Triggering Initial Data Sync
The `sync:initial` script in `package.json` triggers the full data synchronization. This is important to run before enabling webhooks to ensure the local database has a baseline.
```bash
docker-compose exec app npm run sync:initial
```

### D. Configuring Dolibarr Webhooks (New Section)
To enable real-time updates, configure webhooks in your Dolibarr instance:
1.  **Access Webhook Module:** Navigate to the Webhooks module in Dolibarr (e.g., Setup -> Modules/Applications -> Webhooks).
2.  **Create Webhooks:** For each of the following events, create a new webhook:
    *   `PRODUCT_CREATE`
    *   `PRODUCT_MODIFY`
    *   `PRODUCT_DELETE`
    *   `CATEGORY_CREATE`
    *   `CATEGORY_MODIFY`
    *   `CATEGORY_DELETE`
    *   `STOCK_MOVEMENT` (Covers various stock operations including inventory changes, shipments, etc.)
3.  **Target URL:** Set the "URL to notify" for each webhook to:
    `http://<your_middleware_host>:<your_middleware_port>/webhooks/webhook`
    (Replace `<your_middleware_host>` and `<your_middleware_port>` with the actual host and port where this middleware application is accessible from your Dolibarr server).
4.  **HTTP Method:** Ensure the method is `POST`.
5.  **Secret (Optional but Recommended):**
    *   If you have set the `DOLIBARR_WEBHOOK_SECRET` environment variable for this middleware, generate a strong secret string.
    *   In Dolibarr's webhook configuration, there should be an option to add a custom HTTP header. Add a header like:
        *   Header Name: `X-Dolibarr-Webhook-Secret` (Note: The exact header name Dolibarr allows you to configure or sends by default for a secret might vary. Please verify this in your Dolibarr version. This is the header the middleware currently expects.)
        *   Header Value: Your chosen secret string.
    *   Ensure the "Type of content" is `application/json`.
6.  **Encoding:** Usually `UTF-8`.
7.  **Activate:** Ensure each webhook is active.

**Important Notes for Initial Sync & Webhooks:**
*   **API Key Permissions:** Essential for all relevant Dolibarr modules (Categories, Products, Stock, etc.).
*   **Dolibarr Version Compatibility (Tested with v18.0.4):**
    *   API interactions (endpoints, parameters like category sorting, stock endpoint `/products/{id}/stock`, fetching product categories via `/categories/object/product/{id}`) have been adapted for v18.0.4. Users of other versions must verify these in `dolibarrApiService.js` and field mappings in `syncService.js`.
    *   Dolibarr may return `404 Not Found` for stock requests if a product has zero stock; this is logged and the sync continues.
    *   Timestamps from Dolibarr (Unix seconds) are converted to JavaScript Date objects.
    *   Products are linked to categories via a many-to-many relationship.
*   **Field Mappings:** Review `transform*` functions in `syncService.js` if issues occur.

## 8. Known Limitations & Technical Debt

-   **Dolibarr API Specificity & Versioning:**
    *   Core API interaction has been significantly refined for Dolibarr v18.0.4 (category fetching/linking, stock endpoint, timestamp conversions). However, users **must always verify and potentially adapt** API calls in `dolibarrApiService.js` and transformations in `syncService.js` for their specific Dolibarr version, configuration, and custom fields.
    *   The behavior of Dolibarr's API (e.g., 404 for zero-stock items) is handled but is dependent on Dolibarr.
-   **Webhook Payload Parsing:** (Remains a critical TODO)
-   **Image File Synchronization:** (External script still needed)
-   **Database Migrations:** Manual application of `.sql` files. Integration of a migration tool is recommended.
-   (Other points remain largely the same)

## 9. Roadmap & Next Steps (Pending Tasks)

1.  **Dolibarr API Adaptation & Testing (Largely Addressed for v18.0.4 Initial Sync):**
    *   **Completed for v18.0.4 initial sync:**
        *   Category fetching defaults and many-to-many linking with products.
        *   Product stock endpoint corrected and data parsing improved.
        *   Transformation functions updated for Unix timestamps.
    *   **Ongoing Verification Needed:** Users should always test with their specific Dolibarr setup and version, especially for less common data or if variants/other modules have complex API responses.
2.  **CRITICAL: Webhook Implementation & Testing:** (No change - still a top priority)
    *   The middleware now processes these webhooks to update its local database.
3.  **Schema Update for Category Hierarchy:**
    *   Apply the migration to add `parent_id` with `ON DELETE SET NULL` to the `categories` table to ensure correct behavior when parent categories are deleted.
4.  **Develop External Image Sync Script for OVH:** (No change)
5.  **Integrate a Database Migration Tool:** (No change)
5.  **Enhance Test Coverage:** (No change)
6.  **Refine API Features:**
    *   Product listing `GET /api/v1/products` now supports filtering by a single `category_id` using the many-to-many relationship.
    *   Product detail `GET /api/v1/products/:slug` now includes an array of all associated categories.
    *   Further advanced filtering, sorting, and search capabilities could be added.
    *   Add detailed response schemas to all API routes in `apiRoutes.js`.
 (Other points remain largely the same)

---
This document aims to provide a comprehensive overview. For specific implementation details, please refer to the source code and inline comments.
