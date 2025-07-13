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
    -   Endpoint `POST /webhooks/webhook` to receive and process webhooks from Dolibarr.
    -   Security is currently disabled for testing purposes, as Dolibarr v18 does not support sending custom headers for webhooks. A warning is logged if a webhook is received without the `x-dolibarr-webhook-secret` header.
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
-   **Deployment (`Dockerfile`, `render.yaml`):**
    -   `Dockerfile` for containerization and `render.yaml` for deployment to Render.

## 3. Known Issues and Recommendations

-   **Webhook Security:** Webhook security is enforced by including a secret in the URL. For this to work, you must set the `DOLIBARR_WEBHOOK_SECRET` environment variable. The webhook URL in Dolibarr should then be configured as `https://<your-app-url>/webhooks/webhook/<your-secret-here>`.
-   **Payload Parsing:** The application's payload parsing for Dolibarr webhooks should be monitored to ensure it robustly handles all expected data formats and edge cases.
-   **Logger:** The logger implementation should be reviewed to ensure consistent and comprehensive logging across all services and functions.

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
