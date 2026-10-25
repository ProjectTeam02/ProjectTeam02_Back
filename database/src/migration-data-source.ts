// 마이그레이션 전용 DataSource: 스키마 변경 권한이 있는 migrator로 접속 (TypeORM CLI용, export 1개만)
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { baseOptions } from './db-options';

export default new DataSource({
  ...baseOptions,
  username: process.env.DB_MIGRATION_USER ?? 'migrator',
  password: process.env.DB_MIGRATION_PASSWORD ?? '',
  migrations: [__dirname + '/migrations/*.js'],
  migrationsTableName: 'migrations',
});
