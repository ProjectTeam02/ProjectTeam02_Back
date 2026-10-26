import { resolve } from 'path';
import { config } from 'dotenv';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { entities } from './entities';

// 환경변수: database/.env → 레포 루트 .env 순서로 읽음 (이미 설정된 값이 있으면 그 값 우선, 운영은 Parameter Store 주입)
config({ path: [resolve(__dirname, '../.env'), resolve(__dirname, '../../.env')] });

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
