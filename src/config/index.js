import dotenv from 'dotenv';

// Ensure dotenv is loaded. If server.js already does this, it's fine.
// It's good practice for the config module to be self-sufficient in loading.
dotenv.config();

const requiredEnvVars = [
  'DOLIBARR_API_URL',
  'DOLIBARR_API_KEY',
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0 && process.env.NODE_ENV !== 'test') { // Don't throw for tests, they might mock this
  // In a real app, you might want to avoid starting if critical configs are missing,
  // unless they have very specific fallbacks or are only needed for certain features.
  // For now, we'll log a stern warning. For production, throwing an error is better.
  console.warn(
    `Warning: The following critical environment variables are missing: ${missingEnvVars.join(', ')}. Application might not function correctly.`
  );
  // throw new Error(
  //   `Missing critical environment variables: ${missingEnvVars.join(', ')}`
  // );
}


const config = {
  env: process.env.NODE_ENV || 'development',
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    host: process.env.HOST || '0.0.0.0',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  db: {
    connectionString: process.env.DATABASE_URL,
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT, 10),
    sslMode: process.env.DB_SSL_MODE, // e.g., 'require', 'verify-full'
    // sslCaPath: process.env.DB_SSL_CA_PATH, // Example for more specific SSL needs
  },
  dolibarr: {
    apiUrl: process.env.DOLIBARR_API_URL,
    apiKey: process.env.DOLIBARR_API_KEY,
    timeout: parseInt(process.env.DOLIBARR_API_TIMEOUT_MS, 10) || 10000, // Default 10s timeout
    webhookSecret: process.env.DOLIBARR_WEBHOOK_SECRET, // Added for webhook validation
  },
  cdn: {
    baseUrl: process.env.CDN_BASE_URL || 'https://cdn.stainedglass.tn/stainedglass-img-cache/', // Example
  },
  // aws: { // AWS configuration removed as per new strategy
  //   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  //   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  //   s3BucketName: process.env.AWS_S3_BUCKET_NAME,
  //   region: process.env.AWS_REGION || 'us-east-1',
  //   cloudfrontDistributionId: process.env.AWS_CLOUDFRONT_DISTRIBUTION_ID,
  // },
  polling: {
    enabled: process.env.POLLING_ENABLED === 'true' || false, // Default to false unless explicitly true
    stockSyncInterval: process.env.POLLING_STOCK_SYNC_INTERVAL || '0 */1 * * *', // Default: every hour for stock
    // productSyncInterval: process.env.POLLING_PRODUCT_SYNC_INTERVAL || '0 2 * * *', // Default: daily at 2 AM for full product sync
  },
  // Add other configurations as needed
  // e.g., webhookSecret: process.env.DOLIBARR_WEBHOOK_SECRET already added
};

// Make the config object immutable
// Adding a check for CDN_BASE_URL trailing slash
if (config.cdn.baseUrl && !config.cdn.baseUrl.endsWith('/')) {
  config.cdn.baseUrl += '/';
}
export default Object.freeze(config);
