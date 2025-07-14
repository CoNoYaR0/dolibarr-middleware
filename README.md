# Dolibarr Integration Middleware

## 1. Introduction

**Purpose:** This project, "Dolibarr Integration Middleware," is a standalone Node.js application built with Fastify and PostgreSQL. Its primary function is to act as an intermediary between a Dolibarr ERP instance and frontend applications or other services. It synchronizes key data (products, categories, variants, image metadata, stock levels) from Dolibarr into its own optimized PostgreSQL database. This data is then exposed via a RESTful API. Products can be associated with multiple categories.

**Deployment:** This application is deployed on Render, with the PostgreSQL database hosted on Supabase.

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
    -   Endpoint `POST /webhooks/webhook/:secret` to receive and process webhooks from Dolibarr.
    -   Security is enforced by validating the `:secret` parameter in the URL against the `DOLIBARR_WEBHOOK_SECRET` environment variable. This method is used to accommodate Dolibarr v18's lack of support for custom headers in webhooks.
    -   Supported events: `PRODUCT_CREATE`, `PRODUCT_MODIFY`, `PRODUCT_DELETE`, `CATEGORY_CREATE`, `CATEGORY_MODIFY`, `CATEGORY_DELETE`, `STOCK_MOVEMENT`.
    -   Asynchronous processing of webhooks to ensure a quick response to Dolibarr.
-   **Polling Service (`pollingService.js`):**
    -   Cron-based polling for periodic data synchronization, which can complement webhooks or act as a fallback.
-   **RESTful API (`apiRoutes.js`, Controllers):**
    -   `GET /api/v1/categories`: List all categories.
    -   `GET /api/v1/products`: List products with pagination, sorting, and filtering by `category_id`.
    -   `GET /api/v1/products/:slug`: Get a single product with its variants, images, stock levels, and associated categories.
-   **API Documentation (`server.js`, Swagger):**
    -   Automatic OpenAPI (Swagger) specification generation and UI.
-   **Database (`dbService.js`, `migrations/`):**
    -   PostgreSQL schema with a `product_categories_map` junction table for many-to-many relationships.
    -   Database migrations for schema setup and updates.
-   **Configuration (`config/index.js`, `.env`):**
    -   Centralized, environment-aware configuration.
-   **Logging & Error Handling (`logger.js`, `server.js`):**
    -   Structured logging (Pino) and centralized error handling.
-   **Testing (`vitest`):**
    -   Unit and integration tests are set up with `vitest`. Tests for key components like webhook security are implemented.
-   **Deployment (`Dockerfile`):**
    -   Containerized for deployment on services like Render.

## 3. Next Steps & Recommendations

Based on the current state of the project, the following tasks are recommended:

1.  **Enhance Test Coverage:** While a testing framework is in place, coverage should be expanded. Key areas for new tests include:
    -   **`syncService.js`:** Unit tests for each data transformation function to ensure Dolibarr data is correctly mapped to the database schema.
    -   **`apiRoutes.js`:** Integration tests for the public API endpoints (`/api/v1/products`, `/api/v1/categories`, etc.) to validate responses, pagination, and filtering.
    -   **Error Handling:** Tests to confirm that the application responds gracefully to common errors, such as invalid payloads or failed API calls to Dolibarr.

2.  **Refine Logging:** The existing logging is good, but it could be more consistent. A full review should be conducted to ensure that all critical operations, errors, and decisions are logged with a consistent format and level of detail.

3.  **Schema and Migration Review:** Review the database schema and migrations for any potential improvements or optimizations. For example, ensure all foreign key relationships have appropriate indexes for performance.

## 4. Setup and Installation

1.  **Clone the repository.**
2.  **Install dependencies:** `npm install`
3.  **Configure Environment Variables:**
    -   Create a `.env` file in the root of the project by copying `.env.example`.
    -   **For Render/Supabase Deployment:** The most reliable way to configure the database is to use a connection string from your database provider's connection pooler.
        -   In your Render service, create an environment variable named `DATABASE_URL`.
        -   Set its value to the connection string provided by Supabase (or another provider). This will override the other `DB_*` variables.
    -   **For Local Development:** Fill in the `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` variables to connect to your local PostgreSQL instance.
4.  **Deploy to Render** or run locally.

## 5. Running the Application Locally (for development)

1.  **Install Docker and Docker Compose.**
2.  **Run `docker-compose up --build`** to start the application and a local PostgreSQL database.
3.  **Apply database migrations:**
    ```bash
    docker-compose exec app npm run migrate:latest
    ```
4.  **Trigger initial data sync:**
    ```bash
    docker-compose exec app npm run sync:initial
    ```
5.  **Access the application** at `http://localhost:3000`.
6.  **Access the API documentation** at `http://localhost:3000/documentation`.
