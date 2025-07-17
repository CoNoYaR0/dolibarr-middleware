import { config } from 'dotenv';
import { resolve } from 'path';
import { fork } from 'child_process';

const envPath = resolve(process.cwd(), '.env');
config({ path: envPath });

const checkDbPath = resolve(process.cwd(), 'check-db.js');

fork(checkDbPath, [], {
  env: process.env,
});
