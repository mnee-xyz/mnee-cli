import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { URL } from 'url';
import open from 'open';

export interface CliConfig {
  token?: string;
  environment?: 'sandbox' | 'production';
  email?: string;
  defaultAddress?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.mnee');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export async function ensureConfigDir(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (error) {
    // Directory already exists
  }
}

export async function loadConfig(): Promise<CliConfig> {
  try {
    await ensureConfigDir();
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

export async function saveConfig(config: CliConfig): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function clearConfig(): Promise<void> {
  try {
    await fs.unlink(CONFIG_FILE);
  } catch (error) {
    // File doesn't exist
  }
}

export interface AuthResult {
  token: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  user: {
    email: string;
    name?: string;
  };
}

export async function startAuthFlow(apiUrl: string): Promise<AuthResult> {
  return new Promise((resolve, reject) => {
    let server: http.Server | null = null;
    
    // Find an available port
    const tryPort = async (port: number): Promise<number> => {
      return new Promise((resolve, reject) => {
        const testServer = http.createServer();
        testServer.listen(port, '127.0.0.1', () => {
          testServer.close(() => resolve(port));
        });
        testServer.on('error', () => {
          // Port is in use, try next one
          resolve(tryPort(port + 1));
        });
      });
    };
    
    (async () => {
      try {
        const port = await tryPort(8900);
        const redirectUri = `http://localhost:${port}/callback`;
        
        // Start local server to receive callback
        server = http.createServer((req, res) => {
          const url = new URL(req.url || '', `http://localhost:${port}`);
          
          if (url.pathname === '/callback') {
            const error = url.searchParams.get('error');
            
            if (error) {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
                    <div style="text-align: center;">
                      <h1 style="color: #dc2626;">Authentication Failed</h1>
                      <p>${error === 'access_denied' ? 'Access was denied' : 'An error occurred during authentication'}</p>
                      <p style="color: #666;">You can close this window and return to your terminal.</p>
                    </div>
                  </body>
                </html>
              `);
              server?.close();
              reject(new Error(error));
              return;
            }
            
            // Success page
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
                  <div style="text-align: center;">
                    <h1 style="color: #16a34a;">Authentication Successful!</h1>
                    <p>You can close this window and return to your terminal.</p>
                  </div>
                </body>
              </html>
            `);
          }
        });
        
        server.listen(port, '127.0.0.1');
        
        // Initialize auth session
        const initResponse = await fetch(`${apiUrl}/cli/auth/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ redirectUri }),
        });
        
        if (!initResponse.ok) {
          throw new Error('Failed to initialize authentication session');
        }
        
        const initData = await initResponse.json() as { state: string; authUrl: string };
        
        console.log(`\nOpening browser for authentication...`);
        console.log(`If the browser doesn't open, visit: ${initData.authUrl}\n`);
        
        // Open browser
        await open(initData.authUrl);
        
        // Poll for completion
        let attempts = 0;
        const maxAttempts = 120; // 10 minutes (5 second intervals)
        
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
          
          const statusResponse = await fetch(`${apiUrl}/cli/auth/status/${initData.state}`);
          if (!statusResponse.ok) {
            attempts++;
            continue;
          }
          
          const status = await statusResponse.json() as any;
          
          if (status.status === 'completed') {
            server?.close();
            resolve(status as AuthResult);
            return;
          } else if (status.status === 'error') {
            throw new Error(status.message || 'Authentication failed');
          }
          
          attempts++;
        }
        
        throw new Error('Authentication timeout');
      } catch (error) {
        server?.close();
        reject(error);
      }
    })();
  });
}

export async function validateToken(apiUrl: string, token: string): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}/cli/auth/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    return response.ok;
  } catch (error) {
    return false;
  }
}

export async function getProfile(apiUrl: string, token: string): Promise<any> {
  const response = await fetch(`${apiUrl}/cli/auth/profile`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to get profile');
  }
  
  return response.json();
}

export async function logout(apiUrl: string, token: string): Promise<void> {
  try {
    await fetch(`${apiUrl}/cli/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  } catch (error) {
    // Ignore errors during logout
  }
}