import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDatabaseOptions } from './config/database.config';

dotenv.config({ quiet: true });

export const AppDataSource = new DataSource(buildDatabaseOptions());
