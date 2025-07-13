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
    -   `Dockerfile` for containerization and `render.yaml` for deployment to Render (a sample file is provided).

## 3. Known Issues and Bugs

-   **Database Connectivity:** The application intermittently fails to connect to the Supabase database, resulting in `ENETUNREACH` errors. This is likely due to an IPv6 issue. The connection configuration now no longer forces IPv4 and should work with Supabase hosts that resolve to IPv6 or IPv4.
-   **Webhook Security:** The webhook secret check is currently disabled for testing purposes. This should be enabled in a production environment.
-   **Payload Parsing:** The application has had issues parsing payloads from Dolibarr webhooks. The current implementation should be monitored to ensure it is working correctly.
-   **Logger:** The logger has had issues with being passed correctly to all functions. This should be monitored to ensure that all errors are being logged correctly.

## 4. Setup and Installation

1.  **Clone the repository.**
2.  **Install dependencies:** `npm install`
3.  **Create a `.env` file** in the root of the project and copy the content from `.env.example`.
4.  **Fill in the environment variables** in the `.env` file with your specific configuration.
5.  **Ensure `DB_PORT` is set to your Supabase port (usually 6543).**
6.  **Create an environment group** on Render with the variables from `.env.example` and reference it in `render.yaml`.
7.  **Deploy to Render.**

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
