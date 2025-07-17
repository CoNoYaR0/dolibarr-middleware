import dotenv from 'dotenv';
import { resolve } from 'path';
import pg from 'pg';
import { parse } from 'pg-connection-string';

const { Client } = pg;

const envPath = resolve(process.cwd(), '.env.example');
dotenv.config({ path: envPath });

const connectionString = process.env.DB_HOST;
const config = parse(connectionString);

const client = new Client({
  host: config.host,
  port: config.port,
  user: config.user,
  password: config.password,
  database: config.database,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function checkDb() {
  try {
    await client.connect();
    console.log('Connected to the database');

    const res = await client.query('SELECT * FROM products');
    console.log('Products:', res.rows);

    await client.end();
  } catch (err) {
    console.error('Error connecting to the database', err);
  }
}

checkDb();
