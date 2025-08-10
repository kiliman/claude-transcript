import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 8080;
const CHARTS_DIR = path.join(__dirname, 'charts');

const server = http.createServer((req, res) => {
  let filePath = path.join(CHARTS_DIR, req.url === '/' ? 'index.html' : req.url);
  
  // Security: prevent directory traversal
  if (!filePath.startsWith(CHARTS_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
