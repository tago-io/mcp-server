import * as dotenv from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { environmentModel, IEnvironmentModel } from "./config.model";

// Load environment variables from .env file.
dotenv.config();

function checkTagoioCli(): boolean {
  try {
    execSync("which tagoio", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function findTagoIOProject(): string | null {
  console.log("Searching for TagoIO project (tagoconfig.json) in user workspace...");
  
  const fs = require('fs');
  
  // Function to recursively search for tagoconfig.json in a directory
  function searchDirectory(dirPath: string, maxDepth: number = 4, currentDepth: number = 0): string | null {
    if (currentDepth > maxDepth)  {
      return null;
    }
    
    try {
      // Check if tagoconfig.json exists in current directory
      const tagoConfigPath = join(dirPath, 'tagoconfig.json');
      if (existsSync(tagoConfigPath)) {
        return dirPath;
      }
      
      // Skip certain directories to avoid performance issues and irrelevant paths
      const dirName = require('path').basename(dirPath);
      const skipDirs = new Set([
        'node_modules', '.git', 'dist', 'build', '.next', 'coverage', 
        '.nyc_output', 'tmp', 'temp', '.cache', '.npm', '.yarn',
        'Library', 'Applications', 'System', 'usr', 'var', 'opt',
        'proc', 'dev', 'sys', 'boot', 'etc', 'bin', 'sbin'
      ]);
      
      if (skipDirs.has(dirName) || dirName.startsWith('.')) {
        return null;
      }
      
      // Search subdirectories
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subDirPath = join(dirPath, entry.name);
          const result = searchDirectory(subDirPath, maxDepth, currentDepth + 1);
          if (result) {
            return result;
          }
        }
      }
    } catch {
      // Permission denied or other error, skip this directory
    }
    
    return null;
  }
  
  // Define search locations in priority order
  const searchLocations = [
    process.env.HOME ? join(process.env.HOME, 'Projects') : null,
    process.env.HOME ? join(process.env.HOME, 'Documents') : null,
    process.env.HOME ? join(process.env.HOME, 'Desktop') : null,
    process.env.HOME ? join(process.env.HOME, 'Development') : null,
    process.env.HOME ? join(process.env.HOME, 'Code') : null,
    process.env.HOME ? join(process.env.HOME, 'Workspace') : null,
    process.env.HOME ? join(process.env.HOME, 'dev') : null,
    process.env.HOME ? process.env.HOME : null,
  ].filter((path): path is string => path !== null && existsSync(path));
  
  console.log(`Searching in ${searchLocations.length} common project locations...`);
  
  for (const location of searchLocations) {
    console.log(`Searching: ${location}`);
    const found = searchDirectory(location);
    if (found) {
      console.log(`✓ Found TagoIO project: ${found}`);
      return found;
    }
  }
  
  console.log("No TagoIO project found in common locations");
  return null;
}

function getTagoToken(): string {
  // First priority: Check if tagoio CLI is installed and try to get MCP token
  if (checkTagoioCli()) {
    console.log("TagoIO CLI found, attempting to configure MCP...");
    try {
      const projectDir = findTagoIOProject();
      
      if (projectDir) {
        console.log(`Executing 'tagoio mcp-config' in: ${projectDir}`);
        const output = execSync("tagoio mcp-config", { 
          stdio: "pipe",
          cwd: projectDir,
          encoding: 'utf8',
        });
        
        // Parse the output to extract token and API
        const tokenMatch = output.match(/token:\s*'([^']+)'/);
        const apiMatch = output.match(/api:\s*'([^']+)'/);
        
        if (tokenMatch && tokenMatch[1]) {
          const base64Token = tokenMatch[1];
          const decodedToken = Buffer.from(base64Token, 'base64').toString('utf-8');
          console.log("Successfully parsed MCP token from output");
          
          // Store the API for later use if found
          if (apiMatch && apiMatch[1]) {
            process.env.TAGOIO_MCP_API = apiMatch[1];
            console.log("Successfully parsed MCP API from output:", apiMatch[1]);
          }
          
          return decodedToken;
        } else {
          console.log("Could not parse token from mcp-config output");
        }
      } else {
        console.log("No TagoIO project directory found, skipping mcp-config");
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.log("mcp-config failed:", errorMessage);
    }
  }
  
  // Second priority: Fallback to regular environment variable
  return process.env.TAGOIO_TOKEN || "";
}

function getTagoApi(): string {
  // First priority: Check for MCP API environment variable
  if (process.env.TAGOIO_MCP_API) {
    return process.env.TAGOIO_MCP_API;
  }
  
  // Second priority: Regular TAGOIO_API environment variable
  return process.env.TAGOIO_API || "https://api.tago.io";
}

export const ENV: IEnvironmentModel = environmentModel.parse({
  LOG_LEVEL: process.env.LOG_LEVEL,
  TAGOIO_TOKEN: getTagoToken(),
  TAGOIO_API: getTagoApi(),
});