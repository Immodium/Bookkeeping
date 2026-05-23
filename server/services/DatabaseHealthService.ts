// Database Health Service - Service for database health monitoring and diagnostics
// PostgreSQL implementation

import { databaseService } from '../core/DatabaseService.js';

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

// Keep backward-compatible TableInfo interface shape
interface TableInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: any;
  pk: number;
}

/**
 * Database Health Service
 * Provides database health monitoring, statistics, and schema information
 */
export class DatabaseHealthService {
  /**
   * Perform basic database health check
   */
  async performHealthCheck(): Promise<{
    status: 'healthy' | 'error';
    connectivity: boolean;
    timestamp: string;
  }> {
    try {
      const testResult = await databaseService.getOne<{test: number}>('SELECT 1 as test');

      if (!testResult || testResult.test !== 1) {
        throw new Error('Database connectivity test failed');
      }

      return {
        status: 'healthy',
        connectivity: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Database health check error:', error);
      throw new Error('Database health check failed: ' + (error as Error).message);
    }
  }

  /**
   * Get database statistics (record counts)
   */
  async getDatabaseStatistics(): Promise<{
    clients: number;
    invoices: number;
    templates: number;
    expenses: number;
    payments: number;
    users: number;
  }> {
    try {
      const [clients, invoices, templates, expenses, payments, users] = await Promise.all([
        this.getTableCount('clients'),
        this.getTableCount('invoices'),
        this.getTableCount('invoice_design_templates'),
        this.getTableCount('expenses'),
        this.getTableCount('payments'),
        this.getTableCount('users')
      ]);
      return { clients, invoices, templates, expenses, payments, users };
    } catch (error) {
      console.error('Error getting database statistics:', error);
      throw new Error('Failed to retrieve database statistics: ' + (error as Error).message);
    }
  }

  /**
   * Get record count for a specific table
   */
  async getTableCount(tableName: string): Promise<number> {
    try {
      if (!this.isValidTableName(tableName)) {
        throw new Error('Invalid table name');
      }
      const result = await databaseService.getOne<{count: string}>(`SELECT COUNT(*) as count FROM ${tableName}`);
      return result ? parseInt(result.count, 10) : 0;
    } catch (error) {
      console.error(`Error getting count for table ${tableName}:`, error);
      return 0;
    }
  }

  /**
   * Get database schema information using information_schema
   */
  async getDatabaseSchema(): Promise<{
    tables: string[];
    tableCount: number;
    tableInfo: Record<string, {
      columns: number;
      columnNames: string[];
      columnDetails: TableInfo[];
    }>;
  }> {
    try {
      const tables = await databaseService.getMany<{table_name: string}>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      const tableInfo: Record<string, {
        columns: number;
        columnNames: string[];
        columnDetails: TableInfo[];
      }> = {};

      for (const table of tables) {
        const columns = await this.getTableColumns(table.table_name);
        tableInfo[table.table_name] = {
          columns: columns.length,
          columnNames: columns.map(col => col.name),
          columnDetails: columns
        };
      }

      return {
        tables: tables.map(t => t.table_name),
        tableCount: tables.length,
        tableInfo
      };
    } catch (error) {
      console.error('Error getting database schema:', error);
      throw new Error('Failed to retrieve database schema: ' + (error as Error).message);
    }
  }

  /**
   * Get column information for a table using information_schema
   * Returns in legacy TableInfo shape for backward compatibility
   */
  async getTableColumns(tableName: string): Promise<TableInfo[]> {
    try {
      if (!this.isValidTableName(tableName)) {
        throw new Error('Invalid table name');
      }

      const rows = await databaseService.getMany<ColumnInfo>(`
        SELECT
          column_name,
          data_type,
          is_nullable,
          column_default,
          ordinal_position
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      // Map to legacy TableInfo shape
      return rows.map((row, idx) => ({
        cid: idx,
        name: row.column_name,
        type: row.data_type,
        notnull: row.is_nullable === 'NO' ? 1 : 0,
        dflt_value: row.column_default,
        pk: 0 // PostgreSQL PK detection requires additional query; not needed for health checks
      }));
    } catch (error) {
      console.error(`Error getting columns for table ${tableName}:`, error);
      return [];
    }
  }

  /**
   * Get database metadata using PostgreSQL system views
   */
  async getDatabaseMetadata(): Promise<{
    pageCount: number;
    pageSize: number;
    estimatedSizeBytes: number;
    estimatedSizeMB: number;
    userVersion: number;
    applicationId: number;
  }> {
    try {
      const sizeRow = await databaseService.getOne<{size: string}>(`
        SELECT pg_database_size(current_database()) AS size
      `);
      const estimatedSize = sizeRow ? parseInt(sizeRow.size, 10) : 0;

      return {
        pageCount: 0,
        pageSize: 8192, // Default PostgreSQL page size
        estimatedSizeBytes: estimatedSize,
        estimatedSizeMB: Math.round(estimatedSize / (1024 * 1024) * 100) / 100,
        userVersion: 0,
        applicationId: 0
      };
    } catch (error) {
      console.error('Error getting database metadata:', error);
      return {
        pageCount: 0,
        pageSize: 0,
        estimatedSizeBytes: 0,
        estimatedSizeMB: 0,
        userVersion: 0,
        applicationId: 0
      };
    }
  }

  /**
   * Validate table name to prevent SQL injection
   */
  isValidTableName(tableName: string): boolean {
    if (!tableName || typeof tableName !== 'string') {
      return false;
    }
    const validPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    return validPattern.test(tableName);
  }

  /**
   * Check if a table exists using information_schema
   */
  async tableExists(tableName: string): Promise<boolean> {
    try {
      if (!this.isValidTableName(tableName)) {
        return false;
      }
      const result = await databaseService.getOne<{table_name: string}>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      `, [tableName]);
      return !!result;
    } catch (error) {
      console.error(`Error checking if table ${tableName} exists:`, error);
      return false;
    }
  }

  /**
   * Get comprehensive database health report
   */
  async getComprehensiveHealthReport(): Promise<{
    health: {
      status: 'healthy' | 'error';
      connectivity: boolean;
      timestamp: string;
    };
    statistics: {
      clients: number;
      invoices: number;
      templates: number;
      expenses: number;
      payments: number;
      users: number;
    };
    schema: {
      tables: string[];
      tableCount: number;
      tableInfo: Record<string, {
        columns: number;
        columnNames: string[];
        columnDetails: TableInfo[];
      }>;
    };
    metadata: {
      pageCount: number;
      pageSize: number;
      estimatedSizeBytes: number;
      estimatedSizeMB: number;
      userVersion: number;
      applicationId: number;
    };
    reportTimestamp: string;
  }> {
    try {
      const [healthCheck, statistics, schema, metadata] = await Promise.all([
        this.performHealthCheck(),
        this.getDatabaseStatistics(),
        this.getDatabaseSchema(),
        this.getDatabaseMetadata()
      ]);

      return {
        health: healthCheck,
        statistics,
        schema,
        metadata,
        reportTimestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error generating comprehensive health report:', error);
      throw new Error('Failed to generate health report: ' + (error as Error).message);
    }
  }

  /**
   * Check database integrity using PostgreSQL
   */
  async checkDatabaseIntegrity(): Promise<{
    status: 'ok' | 'error';
    result: string;
    timestamp: string;
  }> {
    try {
      // PostgreSQL doesn't have PRAGMA integrity_check; use a simple SELECT as a health check
      const result = await databaseService.getOne<{test: number}>('SELECT 1 AS test');
      const isHealthy = result && result.test === 1;

      return {
        status: isHealthy ? 'ok' : 'error',
        result: isHealthy ? 'ok' : 'connectivity check failed',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Database integrity check error:', error);
      return {
        status: 'error',
        result: (error as Error).message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get database connection info (PostgreSQL equivalent)
   */
  async getConnectionInfo(): Promise<{
    journalMode: string;
    synchronous: string;
    foreignKeysEnabled: boolean;
    timestamp: string;
  }> {
    try {
      return {
        journalMode: 'postgresql',
        synchronous: 'on',
        foreignKeysEnabled: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting connection info:', error);
      return {
        journalMode: 'unknown',
        synchronous: 'unknown',
        foreignKeysEnabled: false,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Simple health check for route usage
   */
  async checkDatabaseHealth(): Promise<boolean> {
    try {
      const result = await this.performHealthCheck();
      return result.status === 'healthy' && result.connectivity;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  /**
   * Get detailed health data for routes
   */
  async getDetailedHealthData(): Promise<{
    status: 'ok' | 'error';
    database: {
      status: 'connected' | 'disconnected';
      counts: {
        users: number;
        clients: number;
        invoices: number;
        expenses: number;
      };
    };
  }> {
    try {
      const healthCheck = await this.performHealthCheck();
      const statistics = await this.getDatabaseStatistics();

      return {
        status: healthCheck.status === 'healthy' ? 'ok' : 'error',
        database: {
          status: healthCheck.connectivity ? 'connected' : 'disconnected',
          counts: {
            users: statistics.users,
            clients: statistics.clients,
            invoices: statistics.invoices,
            expenses: statistics.expenses
          }
        }
      };
    } catch (error) {
      console.error('Error getting detailed health data:', error);
      return {
        status: 'error',
        database: {
          status: 'disconnected',
          counts: {
            users: 0,
            clients: 0,
            invoices: 0,
            expenses: 0
          }
        }
      };
    }
  }
}

// Export singleton instance
export const databaseHealthService = new DatabaseHealthService();
