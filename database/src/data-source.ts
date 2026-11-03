// 서버 실행용 DataSource: 읽기·쓰기만 가능한 app_user로 접속
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { baseOptions } from './db-options';

export const AppDataSource = new DataSource({
  ...baseOptions,
  username: process.env.DB_USER ?? 'app_user',
  password: process.env.DB_PASSWORD ?? '',
});
