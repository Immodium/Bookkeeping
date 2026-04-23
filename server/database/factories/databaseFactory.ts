import { databaseConfig } from '../../config/index.js';
import type { DatabaseConfig, IDatabase } from '../../types/database.types.js';
import { PostgresDatabase } from '../PostgresDatabase.js';
import { SQLiteDatabase, database as sqliteDatabase } from '../SQLiteDatabase.js';
import { getSQLiteDatabaseConfig } from '../config/sqlite.config.js';

export const createConfiguredDatabase = (): IDatabase => {
  if (databaseConfig.engine === 'postgres') {
    return new PostgresDatabase();
  }
  return sqliteDatabase;
};

export const createDatabaseInstance = (engine: 'sqlite' | 'postgres'): IDatabase => {
  if (engine === 'postgres') {
    return new PostgresDatabase();
  }
  return new SQLiteDatabase();
};

export const getRuntimeDatabaseConfig = (): DatabaseConfig => {
  if (databaseConfig.engine === 'postgres') {
    return {
      path: databaseConfig.dbPath,
      engine: 'postgres',
      postgres: {
        connectionString: databaseConfig.postgres.connectionString || '',
        ssl: databaseConfig.postgres.ssl
      }
    };
  }

  return {
    ...getSQLiteDatabaseConfig(),
    engine: 'sqlite'
  };
};
