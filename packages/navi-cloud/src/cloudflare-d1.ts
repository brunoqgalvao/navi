/**
 * Cloudflare D1 API client
 *
 * Handles creating and managing D1 databases programmatically.
 * Reference: https://developers.cloudflare.com/api/resources/d1/
 */

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

interface D1Database {
  uuid: string;
  name: string;
  version: string;
  created_at: string;
}

export class CloudflareD1 {
  constructor(
    private apiToken: string,
    private accountId: string
  ) {}

  private headers(): HeadersInit {
    return {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Create a new D1 database
   */
  async createDatabase(name: string, locationHint?: string): Promise<D1Database> {
    const body: any = { name };

    if (locationHint) {
      body.primary_location_hint = locationHint;
    }

    const response = await fetch(
      `${CF_API_BASE}/accounts/${this.accountId}/d1/database`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      }
    );

    const data = await response.json() as { success: boolean; errors: any[]; result: D1Database };

    if (!data.success) {
      throw new Error(`Failed to create database: ${JSON.stringify(data.errors)}`);
    }

    return data.result;
  }

  /**
   * Delete a D1 database
   */
  async deleteDatabase(databaseId: string): Promise<void> {
    const response = await fetch(
      `${CF_API_BASE}/accounts/${this.accountId}/d1/database/${databaseId}`,
      {
        method: 'DELETE',
        headers: this.headers(),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to delete database ${databaseId}:`, error);
      // Don't throw - database might already be deleted
    }
  }

  /**
   * Execute SQL on a D1 database
   */
  async executeSQL(databaseId: string, sql: string, params?: any[]): Promise<any> {
    const response = await fetch(
      `${CF_API_BASE}/accounts/${this.accountId}/d1/database/${databaseId}/query`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          sql,
          params: params || [],
        }),
      }
    );

    const data = await response.json() as { success: boolean; errors: any[]; result: any[] };

    if (!data.success) {
      throw new Error(`SQL execution failed: ${JSON.stringify(data.errors)}`);
    }

    return data.result;
  }

  /**
   * Get database info
   */
  async getDatabase(databaseId: string): Promise<D1Database | null> {
    const response = await fetch(
      `${CF_API_BASE}/accounts/${this.accountId}/d1/database/${databaseId}`,
      {
        method: 'GET',
        headers: this.headers(),
      }
    );

    const data = await response.json() as { success: boolean; result: D1Database };

    if (!data.success) {
      return null;
    }

    return data.result;
  }

  /**
   * List all D1 databases
   */
  async listDatabases(): Promise<D1Database[]> {
    const response = await fetch(
      `${CF_API_BASE}/accounts/${this.accountId}/d1/database`,
      {
        method: 'GET',
        headers: this.headers(),
      }
    );

    const data = await response.json() as { success: boolean; result: D1Database[] };

    if (!data.success) {
      return [];
    }

    return data.result;
  }
}
