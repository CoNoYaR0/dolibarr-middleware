# Dolibarr Integration Middleware

## 1. Introduction

**Purpose:** This project, "Dolibarr Integration Middleware," is a standalone Node.js application built with Fastify and PostgreSQL. Its primary function is to act as an intermediary between a Dolibarr ERP instance and frontend applications or other services. It synchronizes key data (products, categories, variants, image metadata, stock levels) from Dolibarr into its own optimized PostgreSQL database. This data is then exposed via a RESTful API.

**Scope & Goals:**
-   **Decoupling:** To decouple frontend systems from direct reliance on the Dolibarr API, thereby improving frontend performance, resilience, and allowing for independent scaling.
-   **Performance:** To provide a faster, more optimized data source for read-heavy operations typically required by e-commerce frontends or product listings.
-   **Data Enrichment (Future):** To potentially enrich Dolibarr data with information from other sources or apply custom business logic before exposing it.
-   **Real-time Updates:** To achieve near real-time data synchronization using Dolibarr webhooks (with polling as a fallback mechanism).
-   **Flexible Image Handling:** To manage image metadata and construct CDN URLs, assuming image files are hosted on a user-configured CDN (e.g., an OVH web server), with the actual file placement managed by an external script.

**Target Users:** Developers building frontend experiences (e.g., e-commerce websites, product catalogs) based on data managed in Dolibarr, or developers needing a more robust API layer for Dolibarr data.

## 2. Features Implemented

-   **Data Synchronization Engine (`syncService.js`):**
    -   Synchronization of Categories, Products, Product Variants, Product Image Metadata, and Stock Levels.
    -   Transformation functions to map Dolibarr API responses to the local PostgreSQL schema.
    -   Initial full data sync capability (`runInitialSync`).
    -   Handles basic pagination from Dolibarr API during sync.
-   **Image Metadata Handling (OVH CDN Strategy):**
    -   Stores image metadata (alt text, display order, original Dolibarr identifiers).
    -   Constructs image URLs based on a configured `CDN_BASE_URL` (e.g., pointing to OVH hosting).
    -   **Note:** Actual image file uploading/placement to the CDN server is handled by an external script (e.g., PHP on the OVH server), not this middleware. This middleware only manages the metadata and URLs.
-   **Dolibarr API Interaction (`dolibarrApiService.js`):**
    -   Client service for making requests to the Dolibarr REST API (products, categories, variants, stock, file downloads).
    -   Handles API key authentication and request timeouts.
-   **Webhook Handling (`webhookRoutes.js`):**
    -   Proof-of-concept endpoint (`/webhooks/dolibarr`) to receive webhooks from Dolibarr.
    -   Basic secret key validation.
    -   Placeholder logic for processing product, category, and stock update events. **Requires significant adaptation based on actual Dolibarr webhook payloads.**
-   **Polling Service (`pollingService.js`):**
    -   Cron-based polling using `node-cron` for periodic data synchronization.
    -   Currently implemented for stock level synchronization.
    -   Configurable intervals and enable/disable flag.
-   **RESTful API (`apiRoutes.js`, Controllers):**
    -   `GET /api/v1/categories`: List all categories.
    -   `GET /api/v1/products`: List products with pagination, basic filtering by category, and sorting.
    -   `GET /api/v1/products/:slug`: Get a single product by its slug, including its variants, image URLs, and stock level information.
-   **API Documentation (`server.js`, Swagger):**
    -   Automatic OpenAPI (Swagger) specification generation.
    -   Interactive Swagger UI available at `/documentation`.
-   **Database (`dbService.js`, `migrations/`):**
    -   PostgreSQL database schema for storing synchronized data.
    -   Connection pooling and query execution service.
    -   Initial schema migration and a migration for OVH CDN image handling changes.
-   **Configuration (`config/index.js`, `.env`):**
    -   Centralized configuration management using environment variables (`.env` file for development).
-   **Logging & Error Handling (`logger.js`, `server.js`):**
    -   Structured logging using Pino (JSON in production, pretty-printed in development).
    -   Centralized error handler in Fastify for consistent API error responses.
    -   Request ID tracing in logs.
-   **Dockerization (`Dockerfile`, `docker-compose.yml`):**
    -   Multi-stage `Dockerfile` for creating optimized production images.
    -   `docker-compose.yml` for local development environment (includes app and PostgreSQL services).
-   **Testing (`vitest.config.js`, `src/**/__tests__`):**
    -   Vitest testing framework setup.
    -   Unit tests for all data transformation functions in `syncService.js`.
    -   Example integration-style test for `syncCategories` function.
-   **Security Headers (`server.js`):**
    -   Basic security headers via `@fastify/helmet`.

## 3. Architectural Choices & Key Technologies

-   **Node.js:** Runtime environment.
-   **Fastify:** High-performance, low-overhead web framework for Node.js. Chosen for its speed, extensibility, and built-in support for features like logging (Pino) and schema validation.
-   **PostgreSQL:** Relational database for storing the synchronized and structured data. Chosen for its robustness, data integrity features, and JSONB support.
-   **Docker & Docker Compose:** For containerization, ensuring consistent development and deployment environments.
-   **Vitest:** Modern and fast testing framework.
-   **Webhook-First with Polling Fallback:** Strategy for data synchronization to balance real-time updates with reliability.
-   **Standalone Service:** The middleware is designed as a separate service, decoupling it from the Dolibarr PHP application and any frontend applications.
-   **Environment Variable Configuration:** Standard practice for managing application settings across different environments.
-   **OVH-based CDN for Images:** Image files are hosted on user-provided OVH (or similar) web hosting, served via a user-defined `CDN_BASE_URL`. This middleware stores image metadata and URLs but relies on an external script (not part of this project) on the OVH server for actual file placement.

## 4. Project Structure

```
dolibarr-middleware/
├── migrations/                 # SQL database migration files
│   ├── 001_initial_schema.sql
│   └── 002_update_product_images_for_ovh_cdn.sql
├── src/                        # Source code
│   ├── config/                 # Configuration management (index.js)
│   ├── controllers/            # API route handlers (categoryController.js, productController.js)
│   ├── models/                 # (Currently unused, could hold DB interaction logic/ORM models later)
│   ├── routes/                 # API and webhook route definitions (apiRoutes.js, webhookRoutes.js)
│   ├── services/               # Business logic and external service integrations
│   │   ├── __tests__/          # Unit/integration tests for services (syncService.test.js)
│   │   ├── dbService.js        # PostgreSQL connection and query helper
│   │   ├── dolibarrApiService.js # Client for Dolibarr API
│   │   ├── pollingService.js   # Cron-based polling tasks
│   │   └── syncService.js      # Data synchronization logic (s3Service.js removed)
│   ├── utils/                  # Utility functions (logger.js)
│   └── server.js               # Fastify server setup and entry point
├── .env.example                # Example environment variables file
├── .eslintrc.json              # ESLint configuration
├── .gitignore                  # Git ignore file
├── .prettierrc.json            # Prettier configuration
├── Dockerfile                  # Dockerfile for building the application image
├── docker-compose.yml          # Docker Compose for local development environment
├── package-lock.json
├── package.json
├── README.md                   # This file (being generated)
└── vitest.config.js            # Vitest configuration
```

**Key Files & Roles:**
-   `src/server.js`: Main application entry point, Fastify server setup, plugin registration, route registration, error handling, graceful shutdown.
-   `src/config/index.js`: Centralized configuration loader from environment variables.
-   `src/services/dbService.js`: Handles PostgreSQL database connection and queries.
-   `src/services/dolibarrApiService.js`: Encapsulates all communication with the Dolibarr REST API.
-   `src/services/syncService.js`: Contains core logic for fetching data from Dolibarr, transforming it, and saving it to the local database. Includes functions for categories, products, variants, image metadata, and stock.
-   `src/services/pollingService.js`: Manages scheduled tasks (e.g., periodic stock sync) using `node-cron`.
-   `src/routes/apiRoutes.js`: Defines the public REST API endpoints for frontend consumption.
-   `src/routes/webhookRoutes.js`: Defines the endpoint for receiving webhooks from Dolibarr.
-   `src/controllers/*.js`: Contain the handler logic for API routes.
-   `src/utils/logger.js`: Shared Pino logger instance.
-   `migrations/*.sql`: SQL files for database schema setup and updates.
-   `Dockerfile` & `docker-compose.yml`: For building and running the application with Docker.
-   `.env.example`: Template for required environment variables.
-   `vitest.config.js` & `src/**/__tests__/*.test.js`: Testing configuration and test files.

## 5. Setup and Installation

**Prerequisites:**
-   Node.js (v18+ recommended)
-   npm (or yarn/pnpm)
-   Docker & Docker Compose
-   Access to a running Dolibarr instance with API enabled.
-   Web server / CDN hosting (e.g., OVH) for images, accessible via a public URL.
-   An external script on your CDN server to manage image file synchronization from Dolibarr to your CDN's public directory.

**Steps:**

1.  **Clone the Repository** (if not already done).
2.  **Navigate to Project Directory:**
    ```bash
    cd dolibarr-middleware
    ```
3.  **Configure Environment Variables:**
    *   Copy `.env.example` to a new file named `.env`:
        ```bash
        cp .env.example .env
        ```
    *   Edit the `.env` file and provide all necessary values, especially:
        *   `DOLIBARR_API_URL`, `DOLIBARR_API_KEY`
        *   `DOLIBARR_WEBHOOK_SECRET` (a strong, unique secret)
        *   `CDN_BASE_URL` (pointing to your OVH image hosting path, ending with a `/`)
        *   Database credentials (`DB_USER`, `DB_PASSWORD`, `DB_NAME`). For Docker Compose development, `DB_HOST` should be `db`.
        *   `POLLING_ENABLED=true` if you wish to use the polling service.
4.  **Install Dependencies:**
    ```bash
    npm install
    ```

## 6. Running the Application

### A. Local Development (using Docker Compose - Recommended)

1.  Ensure Docker and Docker Compose are installed and running.
2.  From the `dolibarr-middleware` directory, build and start the services:
    ```bash
    docker-compose up --build
    ```
    (Use `docker-compose up -d` to run in detached mode).
3.  The middleware application will be available at `http://localhost:PORT` (e.g., `http://localhost:3000` if `PORT=3000`).
4.  The API documentation (Swagger UI) will be at `http://localhost:PORT/documentation`.
5.  The PostgreSQL database (started by Docker Compose) will be accessible from your host machine on the port defined by `DB_EXTERNAL_PORT` in your `.env` file (defaults to `5433`), connecting to the container's port `5432`.

### B. Applying Database Migrations

This step is crucial after starting the database container for the first time or when new migrations are added.
1.  Connect to the PostgreSQL database (e.g., using `psql` CLI, pgAdmin, DBeaver, or your IDE's database tools).
    *   Host: `localhost`
    *   Port: `5433` (or your `DB_EXTERNAL_PORT`)
    *   User/Password/Database: As configured in your `.env` file.
2.  Execute the SQL migration files from the `migrations/` directory in order:
    *   `migrations/001_initial_schema.sql`
    *   `migrations/002_update_product_images_for_ovh_cdn.sql`
    *   *(And any subsequent migration files)*
    *Example using `psql` (if installed locally):*
    ```bash
    psql -h localhost -p 5433 -U YOUR_DB_USER -d YOUR_DB_NAME -f migrations/001_initial_schema.sql
    psql -h localhost -p 5433 -U YOUR_DB_USER -d YOUR_DB_NAME -f migrations/002_update_product_images_for_ovh_cdn.sql
    ```
*(**Note:** A proper database migration tool like `node-pg-migrate` or `Knex.js` should be integrated for more robust migration management in the future. This would allow commands like `npm run db:migrate`.)*

### C. Triggering Initial Data Sync

The initial synchronization of data from Dolibarr to the middleware's database is currently a manual process.
1.  **Recommended Method (CLI command):**
    *   Add the following script to your `dolibarr-middleware/package.json` if not already present:
        ```json
        "scripts": {
          // ... other scripts ...
          "sync:initial": "node -e \"import('./src/services/syncService.js').then(s => s.default.runInitialSync()).catch(e => { console.error('Initial Sync Failed:', e); process.exit(1); })\""
        }
        ```
    *   Ensure the application container is running (`docker-compose up`).
    *   Execute the sync from your host machine's terminal:
        ```bash
        docker-compose exec app npm run sync:initial
        ```
2.  Monitor the logs of the `app` container for progress and errors:
    ```bash
    docker-compose logs -f app
    ```
**Important:** During the first sync, you will likely encounter issues if the field names in the `transform*` functions within `src/services/syncService.js` or the API endpoints in `src/services/dolibarrApiService.js` do not perfectly match your Dolibarr instance's API responses. You will need to debug these by inspecting logs and Dolibarr API output, then adjust the code.

### D. Setting up Dolibarr Webhooks

Refer to the "Webhook Setup in Dolibarr" section in the previous `README.md` content (or I can regenerate that part if needed). Key aspects:
-   Target URL: `YOUR_MIDDLEWARE_URL/webhooks/dolibarr`
-   Secret Key: Match `DOLIBARR_WEBHOOK_SECRET` in `.env`.
-   **Payload Adaptation:** The logic in `src/routes/webhookRoutes.js` to parse `entity`, `action`, and `entityId` **must** be adapted to the actual structure of webhooks sent by your Dolibarr.

## 7. Running Tests

-   Run all tests once:
    ```bash
    npm test
    ```
-   Run tests in watch mode:
    ```bash
    npm run test:watch
    ```
-   Generate coverage report (output in `./coverage/`):
    ```bash
    npm run coverage
    ```

## 8. Known Limitations & Technical Debt

-   **Dolibarr API Specificity:** Many parts of `dolibarrApiService.js` and `syncService.js` (especially transform functions and API endpoint paths for variants, images, stock) use placeholders or common assumptions. These **must be verified and adapted** to the specific version and module configuration of the target Dolibarr instance.
-   **Webhook Payload Parsing:** The webhook handler in `webhookRoutes.js` has placeholder logic for parsing event type and entity ID. This **requires significant adaptation** based on actual Dolibarr webhook payloads.
-   **Image File Synchronization:** This middleware only handles image *metadata* and URL construction for an OVH-based CDN. The actual placement of image files onto the CDN server relies on an **external script (not included in this project)** that needs to be developed and managed separately on the OVH server.
-   **Database Migrations:** Currently manual (running `.sql` files). A proper migration tool (`node-pg-migrate`, `Knex.js`, etc.) should be integrated for schema versioning and easier management.
-   **Error Handling & Retries:** While basic error logging is in place, more sophisticated error handling, retry mechanisms (especially for API calls and sync operations), and potentially dead-letter queueing for failed webhook events are needed for production robustness.
-   **Test Coverage:** Unit tests cover data transformation functions. Integration tests for full sync flows, API endpoints (with a test DB), and webhook handlers are needed for comprehensive coverage.
-   **Performance at Scale:** For very large Dolibarr datasets, the current initial sync process (fetching all data in loops) might be slow or memory-intensive. Optimizations like streaming, batch processing, or background job queues (e.g., BullMQ, Redis) could be necessary.
-   **Security:**
    -   The webhook secret provides basic protection. More advanced measures (IP whitelisting, request signing if Dolibarr supports it) could be added.
    -   API endpoints are currently public. If any require protection, an authentication/authorization layer (e.g., JWT, API keys for frontend clients) needs to be implemented.
    -   Rate limiting for public API endpoints is not yet implemented.
-   **Configuration for Specific Dolibarr Entities:** The sync service currently focuses on products, categories, variants, images, and stock. Syncing other Dolibarr entities (e.g., customers, orders for certain analytics) would require extending the schema, API client, and sync logic.
-   **Dolibarr API Versioning/Changes:** The middleware's stability depends on the stability of the Dolibarr API it consumes. Changes in the Dolibarr API might require updates to this middleware.

## 9. Roadmap & Next Steps (Pending Tasks)

1.  **CRITICAL: Dolibarr API Adaptation & Testing:**
    *   Verify and adapt all Dolibarr API endpoint paths in `dolibarrApiService.js`.
    *   Verify and adapt all field mappings in `transform*` functions within `syncService.js` by inspecting actual Dolibarr API responses.
    *   Thoroughly test the `runInitialSync` process with a real or staging Dolibarr instance. Debug and fix data mapping issues.
2.  **CRITICAL: Webhook Implementation & Testing:**
    *   Configure webhooks in Dolibarr.
    *   Inspect the exact JSON payload structure for each relevant event.
    *   Rewrite the payload parsing logic in `src/routes/webhookRoutes.js` to correctly identify entities, actions, and IDs.
    *   Implement the `TODO` sections in `webhookRoutes.js` for actually processing product, category, and stock updates based on webhook data (fetching details and upserting to the local DB).
    *   Test webhook flows thoroughly.
3.  **Develop External Image Sync Script for OVH:** Design and implement the PHP (or other language) script that will run on your OVH server to pull images from Dolibarr and place them in the correct CDN directory, using information like `original_dolibarr_filename` or `original_dolibarr_path` stored by this middleware.
4.  **Integrate a Database Migration Tool:** Implement `node-pg-migrate` or `Knex.js` to manage database schema changes programmatically. Convert existing `.sql` files into migration scripts.
5.  **Enhance Test Coverage:**
    *   Write integration tests for all main `syncService.js` functions (mocking API/DB).
    *   Write integration tests for all API endpoints using a test database.
    *   Write integration tests for the webhook handler.
6.  **Refine API Features:**
    *   Add more advanced filtering, sorting, and search capabilities to product listing endpoints.
    *   Add detailed response schemas to all API routes in `apiRoutes.js` for improved Swagger documentation.
7.  **CLI for Operations:**
    *   Create robust CLI commands (e.g., using `commander.js` or by adding more `npm run` scripts) for:
        *   Triggering initial full sync (`runInitialSync`).
        *   Triggering sync for specific entities (e.g., `npm run sync:products`).
        *   Running database migrations.
8.  **Security Enhancements:**
    *   Implement rate limiting for public API endpoints.
    *   Review and configure Content Security Policy (CSP) via Helmet more specifically if needed.
    *   If parts of the API need to be secured, implement an authentication mechanism.
9.  **Production Hardening:**
    *   Set up robust monitoring and alerting.
    *   Optimize performance based on load testing (database queries, API response times).
10. **Image Variant Handling:** Extend `syncProductImageMetadata` and webhook logic to associate images with specific product variants if Dolibarr supports this and it's required. The `product_images` table has a `variant_id` for this.

## 10. How to Contribute (for future contributors/AI)

1.  **Understand the Architecture:** Review this README, particularly the "Architectural Choices" and "Project Structure" sections.
2.  **Set up Development Environment:** Follow the "Setup and Installation" and "Running the Application (Development)" sections.
3.  **Environment Variables:** Ensure your local `.env` file is correctly configured.
4.  **Coding Standards:** Adhere to the existing ESLint and Prettier configurations. Run `npm run lint` and `npm run format` before committing.
5.  **Testing:** Write relevant unit and integration tests for any new features or bug fixes. Ensure `npm test` passes.
6.  **Focus Areas for Dolibarr Interaction:**
    *   `src/services/dolibarrApiService.js`: For any new Dolibarr API calls.
    *   `src/services/syncService.js`: For changes to data synchronization logic or transformations.
    *   `src/routes/webhookRoutes.js`: For changes to how Dolibarr webhooks are processed.
    *   `migrations/`: For any database schema changes (ideally using a migration tool once integrated).
7.  **API Development:**
    *   `src/routes/apiRoutes.js`: For defining new API endpoints.
    *   `src/controllers/`: For implementing the logic behind new endpoints.
    *   Remember to add schema definitions to routes for validation and Swagger documentation.

---

This document aims to provide a comprehensive overview. For specific implementation details, please refer to the source code and inline comments.
