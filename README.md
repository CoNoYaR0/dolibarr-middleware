# Dolibarr Middleware

This project is a middleware application designed to synchronize data from a Dolibarr ERP/CRM instance to a local PostgreSQL database. It provides a RESTful API to expose the synchronized data, enabling the development of modern front-end applications, such as e-commerce websites, while using Dolibarr as the back-office management tool.

The middleware is built with Node.js, Fastify, and PostgreSQL, and it is fully containerized with Docker for easy setup and deployment.

## Key Features

- **Data Synchronization**: Synchronizes products, categories, product variants, images, and stock levels from Dolibarr.
- **RESTful API**: Exposes the synchronized data through a well-defined API with support for pagination and basic filtering.
- **Webhook Integration**: Listens to Dolibarr webhooks for real-time updates of products, categories, and stock movements.
- **Extensible Architecture**: The modular design allows for easy extension to support additional Dolibarr modules.
- **Containerized**: Uses Docker and Docker Compose for a consistent and isolated development environment.

## Project Status

This project is under active development. The core functionalities are in place, but some features are still being improved or are yet to be implemented.

### Implemented Features

- **Initial Data Sync**: A script is available to perform a full initial synchronization of data from Dolibarr.
- **Product and Category Sync**: Synchronization of products and categories, including their relationships.
- **Product Variant and Image Sync**: Synchronization of product variants and their associated images.
- **Stock Level Sync**: Synchronization of stock levels for products.
- **Webhook Handling**: Real-time updates for products, categories, and stock movements via Dolibarr webhooks.
- **API Endpoints**:
  - `GET /api/v1/products`: Lists products with pagination and filtering by category.
  - `GET /api/v1/products/:slug`: Retrieves a single product with its variants, images, and stock levels.
  - `GET /api/v1/categories`: Lists all categories.

### Ongoing Tasks and Future Enhancements

- **Advanced API Filtering**: Enhance the `listProducts` endpoint with more advanced filtering options (e.g., by price, attributes, tags).
- **API Sorting Options**: Add more sorting options to the `listProducts` endpoint.
- **Improved Error Handling**: Implement more specific and informative error handling throughout the application.
- **Comprehensive Testing**: Develop a full test suite with unit and integration tests to ensure code quality and reliability.
- **Search Functionality**: Add a dedicated search endpoint for products.
- **User Authentication and Authorization**: Implement a robust authentication and authorization mechanism for the API.

## Getting Started

Follow these instructions to set up and run the project in your local development environment.

### Prerequisites

- [Docker](https://www.docker.com/get-started)
- [Node.js](https://nodejs.org/) (for running scripts outside of Docker)

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

    Update the `.env` file with your Dolibarr and PostgreSQL credentials:

    ```env
    # Application Configuration
    NODE_ENV=development
    PORT=3000
    LOG_LEVEL=debug

    # Database Configuration
    DB_USER=myuser
    DB_PASSWORD=mypassword
    DB_NAME=myapp_dev
    DB_HOST=db
    DB_PORT=5432

    # Dolibarr API Configuration
    DOLIBARR_API_URL=https://your-dolibarr-instance.com/api/index.php
    DOLIBARR_API_KEY=your_dolibarr_api_key
    DOLIBARR_WEBHOOK_SECRET=your_webhook_secret
    ```

3.  **Build and run the application with Docker Compose:**

    ```bash
    docker-compose up --build
    ```

    This command will build the Docker image for the application and start the `app` and `db` services. The application will be available at `http://localhost:3000`.

### Initial Data Synchronization

After the application is running, you need to perform an initial data synchronization to populate the local database with data from your Dolibarr instance.

To run the initial sync, execute the following command in a separate terminal:

```bash
docker-compose exec app npm run sync:initial
```

This script will fetch all products, categories, variants, images, and stock levels from Dolibarr and save them to the PostgreSQL database.

### API Documentation

The API documentation is automatically generated using Swagger and is available at:

[http://localhost:3000/documentation](http://localhost:3000/documentation)

This interactive documentation allows you to explore the API endpoints and test them directly from your browser.

## License

This project is licensed under the ISC License. See the [LICENSE](LICENSE) file for more details.
