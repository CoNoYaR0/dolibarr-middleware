# Dolibarr Middleware

This project is a middleware application designed to synchronize data from a Dolibarr ERP/CRM instance to a local PostgreSQL database. It provides a RESTful API to expose the synchronized data, enabling the development of modern front-end applications, such as e-commerce websites, while using Dolibarr as the back-office management tool.

The middleware is built with Node.js, Fastify, and PostgreSQL, and it is fully containerized with Docker for easy setup and deployment.

## Project Architecture

The application follows a modular architecture, separating concerns into different components:

-   **`src/config`**: Handles application configuration, loading environment variables for the server, database, and Dolibarr API.
-   **`src/services`**: Contains the core business logic, including:
    -   `dbService.js`: Manages the connection to the PostgreSQL database.
    -   `dolibarrApiService.js`: Interacts with the Dolibarr API to fetch data.
    -   `pollingService.js`: Sets up cron jobs to periodically synchronize data.
    -   `syncService.js`: Orchestrates the data synchronization process, transforming and saving data from Dolibarr to the local database.
-   **`src/controllers`**: Handles the logic for API requests, processing input and preparing responses. It acts as an intermediary between the routes and the services.
-   **`src/routes`**: Defines the API endpoints and webhook handlers, mapping them to the appropriate controllers.
-   **`migrations`**: Contains the SQL scripts for creating and updating the database schema.

## File-by-File Audit

Here is a detailed audit of each file in the repository:

### Root Directory

-   `.env.example`: ✅ **Fully Implemented**. Example environment file.
-   `.eslintignore`: ✅ **Fully Implemented**. ESLint ignore file.
-   `.eslintrc.json`: ✅ **Fully Implemented**. ESLint configuration.
-   `.gitignore`: ✅ **Fully Implemented**. Git ignore file.
-   `.prettierrc.json`: ✅ **Fully Implemented**. Prettier configuration.
-   `Dockerfile`: ✅ **Fully Implemented**. Dockerfile for the application.
-   `docker-compose.yml`: ✅ **Fully Implemented**. Docker Compose file for managing the application and database services.
-   `package.json`: ✅ **Fully Implemented**. Project metadata and dependencies.
-   `package-lock.json`: ✅ **Fully Implemented**. Exact versions of dependencies.
-   `vitest.config.js`: ✅ **Fully Implemented**. Vitest configuration.

### `src/config`

-   `index.js`: ✅ **Fully Implemented**. Centralized configuration loader.

### `src/controllers`

-   `categoryController.js`: 🚧 **Partially Implemented**.
    -   `getAllCategories`: Lacks filtering, sorting, and pagination.
-   `productController.js`: 🚧 **Partially Implemented**.
    -   `listProducts`: Lacks advanced filtering and sorting.
    -   `getProductBySlug`: Response structure could be improved.

### `src/routes`

-   `apiRoutes.js`: 🚧 **Partially Implemented**.
    -   Missing routes for search and advanced filtering.
-   `webhookRoutes.js`: ✅ **Fully Implemented**.

### `src/services`

-   `dbService.js`: ✅ **Fully Implemented**.
-   `dolibarrApiService.js`: ✅ **Fully Implemented**.
-   `pollingService.js`: ✅ **Fully Implemented**.
-   `syncService.js`: ✅ **Fully Implemented**.

## Image Handling

The image synchronization is handled by a separate PHP script, `image_sync.php`, which is triggered by a webhook in Dolibarr. This script mirrors the product images from the Dolibarr `documents/produit` directory to the CDN directory.

**`image_sync.php`**

```php
<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

// Chemins relatifs à partir du script
$dolibarr_documents = realpath(__DIR__ . '/../../documents/produit');
$cdn_path = realpath(__DIR__ . '/../');

if (!$dolibarr_documents || !is_dir($dolibarr_documents)) {
    http_response_code(500);
    die("Erreur : Le dossier source '$dolibarr_documents' n'existe pas.");
}
if (!is_writable($cdn_path)) {
    http_response_code(500);
    die("Erreur : Impossible d'écrire dans '$cdn_path'.");
}

// Fonction de synchro
function mirror_directory($source, $destination) {
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($source, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );

    foreach ($iterator as $item) {
        $dest_item = $destination . '/' . $iterator->getSubPathName();
        if ($item->isDir()) {
            if (!is_dir($dest_item)) {
                mkdir($dest_item, 0755, true);
            }
        } else {
            copy($item, $dest_item);
        }
    }
}

mirror_directory($dolibarr_documents, $cdn_path);
echo "✅ Synchronisation terminée.";
?>
```

**Webhook Configuration**

A webhook in Dolibarr should be configured to trigger the `image_sync.php` script whenever a product is created or modified. This will ensure that the images are synchronized in real-time.

1.  **Place the `image_sync.php` script on your server.** A good practice is to place it in a `webhooks` directory at the same level as your Dolibarr installation.
2.  **Log in to your Dolibarr instance.**
3.  **Go to `Home > Setup > Modules/Applications > Webhook`.**
4.  **Click on the `New Webhook` button.**
5.  **Enter the following information:**
    *   **Label:** `Image Sync`
    *   **URL:** `https://your-domain.com/webhooks/image_sync.php`
    *   **HTTP Method:** `GET`
    *   **Triggering Event:** `Product_created` and `Product_modified`
    *   activat
6.  **Click on the `Create` button.**
  
     **The image synchronization is partially complete. The images are being mirrored to the CDN, but the database is not yet being updated with the CDN URLs.**
**Dolibarr API Bug:**

It's important to note that there is a known bug in the Dolibarr API v18.4 that prevents the `documents` endpoint from returning product images. This middleware implements a workaround for this bug by using the `includerelations=photos` parameter to get the image data. However, this workaround may not work in all versions of Dolibarr.

**Overall Image Handling Status:** ✅ **Fully Implemented**.

### `src/utils`

-   `logger.js`: ✅ **Fully Implemented**.

### `migrations`

-   `001_initial_schema.sql`: ❌ **Incomplete**.
    -   Missing `parent_id` and `slug` columns in `categories` table.
-   `002_update_product_images_for_ovh_cdn.sql`: ✅ **Fully Implemented**.
-   `003_product_many_to_many_categories.sql`: ✅ **Fully Implemented**.

## Project Status

### Implemented Features

-   **Initial Data Sync**: A script is available to perform a full initial synchronization of data from Dolibarr.
-   **Product and Category Sync**: Synchronization of products and categories, including their relationships.
-   **Product Variant and Image Sync**: Synchronization of product variants and their associated images.
-   **Stock Level Sync**: Synchronization of stock levels for products.
-   **Webhook Handling**: Real-time updates for products, categories, and stock movements via Dolibarr webhooks.
-   **API Endpoints**:
    -   `GET /api/v1/products`: Lists products with pagination and filtering by category.
    -   `GET /api/v1/products/:slug`: Retrieves a single product with its variants, images, and stock levels.
    -   `GET /api/v1/categories`: Lists all categories.

### Ongoing Tasks and Future Enhancements

-   **Advanced API Filtering**: Enhance the `listProducts` endpoint with more advanced filtering options (e.g., by price, attributes, tags).
-   **API Sorting Options**: Add more sorting options to the `listProducts` endpoint.
-   **Improved Error Handling**: Implement more specific and informative error handling throughout the application.
-   **Comprehensive Testing**: Develop a full test suite with unit and integration tests to ensure code quality and reliability.
-   **Search Functionality**: Add a dedicated search endpoint for products.
-   **User Authentication and Authorization**: Implement a robust authentication and authorization mechanism for the API.
-   **Fix Database Schema**: Add the missing `parent_id` and `slug` columns to the `categories` table.
-   **Fix `dolibarrApiService.js`**: Correct the inconsistent module exports.
-   **Fix `syncService.js`**: Add the missing `addCategory` import.
### Known Issues and Areas for Improvement

-   Inconsistent error handling
-   Lack of input validation in controllers
-   No logging in some services
-   Potential for SQL injection in the `listProducts` function
    
## Getting Started

Follow these instructions to set up and run the project in your local development environment.

### Prerequisites

-   [Docker](https://www.docker.com/get-started)
-   [Node.js](https://nodejs.org/) (for running scripts outside of Docker)

### Installation and Configuration

1.  **Clone the repository:**

    ```bash
    git clone <repository-url>
    cd dolibarr-middleware
    ```

2.  **Create a `.env` file:**

    Create a `.env` file in the root of the project by copying the `.env.example` file:

    ```bash
    cp .env.example .env
    ```

    Update the `.env` file with your Dolibarr and PostgreSQL credentials.

3.  **Build and run the application with Docker Compose:**

    ```bash
    docker-compose up --build
    ```

    The application will be available at `http://localhost:3000`.

### Initial Data Synchronization

The initial data synchronization is now automated and will run when the application starts if the `RUN_INITIAL_SYNC` environment variable is set to `true`.

To enable the initial sync, add the following line to your `.env` file:

```env
RUN_INITIAL_SYNC=true
```

When you deploy the application with this environment variable set to `true`, it will automatically perform a full synchronization of all data from Dolibarr. Once the initial sync is complete, you can set this variable to `false` or remove it to prevent the sync from running on every application restart.

### API Documentation

The API documentation is automatically generated using Swagger and is available at:

[http://localhost:3000/documentation](http://localhost:3000/documentation)

This interactive documentation allows you to explore the API endpoints and test them directly from your browser.
