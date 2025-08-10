const http = require('http');
const fs = require('fs');
const path = require('path');

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

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      const ext = path.extname(filePath);
      const contentType = ext === '.html' ? 'text/html' : 
                         ext === '.png' ? 'image/png' : 
                         'application/octet-stream';
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Chart server running at http://localhost:${PORT}/`);
  console.log(`Serving files from: ${CHARTS_DIR}`);
});