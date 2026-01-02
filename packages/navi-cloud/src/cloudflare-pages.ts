/**
 * Cloudflare Pages API client
 *
 * Handles creating projects and deploying files via the REST API.
 * Reference: https://developers.cloudflare.com/pages/get-started/direct-upload/
 */

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

interface FileEntry {
  path: string;
  content: string; // base64 encoded
}

interface DeploymentResult {
  id: string;
  url: string;
  environment: string;
}

export class CloudflarePages {
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
   * Create a new Pages project
   */
  async createProject(name: string): Promise<{ name: string; subdomain: string }> {
    const response = await fetch(
      `${CF_API_BASE}/accounts/${this.accountId}/pages/projects`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          name,
          production_branch: 'main',
        }),
      }
    );

    const data = await response.json() as { success: boolean; errors: any[]; result: any };

    if (!data.success) {
      throw new Error(`Failed to create project: ${JSON.stringify(data.errors)}`);
    }

    return {
      name: data.result.name,
      subdomain: data.result.subdomain,
    };
  }

  /**
   * Deploy files to a Pages project using Direct Upload
   *
   * This uses the undocumented but stable upload API that wrangler uses.
   */
  async deploy(projectName: string, files: FileEntry[]): Promise<DeploymentResult> {
    // Step 1: Create a new deployment
    const createResponse = await fetch(
      `${CF_API_BASE}/accounts/${this.accountId}/pages/projects/${projectName}/deployments`,
      {
        method: 'POST',
        headers: this.headers(),
      }
    );

    const createData = await createResponse.json() as { success: boolean; errors: any[]; result: any };

    if (!createData.success) {
      throw new Error(`Failed to create deployment: ${JSON.stringify(createData.errors)}`);
    }

    const deploymentId = createData.result.id;

    // Step 2: Upload files as a form/multipart
    // The Pages API expects files in a specific format
    const formData = new FormData();

    for (const file of files) {
      // Decode base64 content
      const content = Uint8Array.from(atob(file.content), c => c.charCodeAt(0));
      const blob = new Blob([content]);
      formData.append(file.path, blob, file.path);
    }

    // Add manifest
    const manifest: Record<string, string> = {};
    for (const file of files) {
      manifest[file.path] = file.path;
    }
    formData.append('manifest', JSON.stringify(manifest));

    const uploadResponse = await fetch(
      `${CF_API_BASE}/accounts/${this.accountId}/pages/projects/${projectName}/deployments/${deploymentId}/files`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          // Don't set Content-Type - let FormData set it with boundary
        },
        body: formData,
      }
    );

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      throw new Error(`Failed to upload files: ${error}`);
    }

    // Step 3: Finalize deployment
    const finalizeResponse = await fetch(
      `${CF_API_BASE}/accounts/${this.accountId}/pages/projects/${projectName}/deployments/${deploymentId}`,
      {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify({ status: 'active' }),
      }
    );

    const finalData = await finalizeResponse.json() as { success: boolean; result: any };

    return {
      id: deploymentId,
      url: `https://${deploymentId}.${projectName}.pages.dev`,
      environment: 'production',
    };
  }

  /**
   * Delete a Pages project
   */
  async deleteProject(projectName: string): Promise<void> {
    const response = await fetch(
      `${CF_API_BASE}/accounts/${this.accountId}/pages/projects/${projectName}`,
      {
        method: 'DELETE',
        headers: this.headers(),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to delete project ${projectName}:`, error);
      // Don't throw - project might already be deleted
    }
  }

  /**
   * Get project details
   */
  async getProject(projectName: string): Promise<any> {
    const response = await fetch(
      `${CF_API_BASE}/accounts/${this.accountId}/pages/projects/${projectName}`,
      {
        method: 'GET',
        headers: this.headers(),
      }
    );

    const data = await response.json() as { success: boolean; result: any };

    if (!data.success) {
      return null;
    }

    return data.result;
  }

  /**
   * List recent deployments
   */
  async listDeployments(projectName: string, limit = 10): Promise<any[]> {
    const response = await fetch(
      `${CF_API_BASE}/accounts/${this.accountId}/pages/projects/${projectName}/deployments?per_page=${limit}`,
      {
        method: 'GET',
        headers: this.headers(),
      }
    );

    const data = await response.json() as { success: boolean; result: any[] };

    if (!data.success) {
      return [];
    }

    return data.result;
  }
}
