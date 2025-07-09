import pg from 'pg';
import config from '../config/index.js';
import logger from '../utils/logger.js'; // Import shared logger

const { Pool } = pg;

const dbServiceConfig = {
  user: config.db.user,
  host: config.db.host,
  database: config.db.database,
  password: config.db.password,
  port: config.db.port,
};

// SSL configuration based on centralized config
if (config.db.sslMode && ['require', 'prefer', 'allow', 'verify-ca', 'verify-full'].includes(config.db.sslMode)) {
  dbServiceConfig.ssl = { rejectUnauthorized: false }; // Default for simplicity
  if (config.env !== 'development' && (config.db.sslMode === 'verify-ca' || config.db.sslMode === 'verify-full')) {
    // In production/staging with verify-ca or verify-full, you should ensure proper CA certs are handled
    // For example, by reading a CA file path from config.db.sslCaPath
    // This example keeps rejectUnauthorized: false for broader compatibility without full cert setup.
    // For true security, set rejectUnauthorized: true and provide the CA.
    logger.warn(
      `DB_SSL_MODE is '${config.db.sslMode}'. For production with CA verification, ensure proper CA certs are configured and consider 'rejectUnauthorized: true'.`
    );
    // Example for stricter SSL:
    // if (config.db.sslCaPath) {
    //   dbServiceConfig.ssl = {
    //     rejectUnauthorized: true,
    //     ca: fs.readFileSync(config.db.sslCaPath).toString(),
    //   };
    // } else {
    //   console.error('DB_SSL_MODE requires CA verification, but DB_SSL_CA_PATH is not set.');
    //   process.exit(1); // Or handle error appropriately
    // }
  }
}


let pool;
try {
  pool = new Pool(dbConfig);

  pool.on('connect', () => {
    logger.info('PostgreSQL connected successfully.');
  });

  pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
    // Optionally, you might want to attempt to reconnect or exit
    // process.exit(-1);
  });

} catch (error) {
  logger.error({ err: error }, 'Failed to create PostgreSQL pool');
  // If the pool cannot be created, the application likely cannot function.
  process.exit(1);
}


/**
 * Executes a SQL query using the connection pool.
 * @param {string} text - The SQL query string (can include placeholders like $1, $2).
 * @param {Array<any>} [params] - An array of parameters to substitute into the query.
 * @returns {Promise<pg.QueryResult<any>>} A promise that resolves with the query result.
 * @throws {Error} If the query fails.
 */
const query = async (text, params) => {
  if (!pool) {
    throw new Error('Database pool is not initialized. Check DB connection.');
  }
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug({ text, duration, rowCount: res.rowCount }, 'Executed query');
    return res;
  } catch (err) {
    logger.error({ text, params, err }, 'Error executing query');
    throw err; // Re-throw to be handled by calling function or global error handler
  }
};

// Optional: A simple function to test the connection
const testConnection = async () => {
  try {
    await pool.query('SELECT NOW()');
    logger.info('Database connection test successful.');
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Database connection test failed');
    return false;
  }
};

export default {
  query,
  testConnection,
  // Expose the pool directly if needed for transactions or specific pg features
  // getPool: () => pool
};
