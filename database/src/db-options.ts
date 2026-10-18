import 'dotenv/config';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { entities } from './entities';

export const baseOptions: PostgresConnectionOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? 'leren',
  schema: 'app',
  entities,
  // PostgreSQL 13+ 내장 gen_random_uuid() 사용 → 확장 설치 권한 불필요
  uuidExtension: 'pgcrypto',
  installExtensions: false,
  synchronize: false,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true, ca: process.env.DB_SSL_CA } : false,
};
