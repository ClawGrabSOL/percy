// Percy — backend server
// Serves the site + proxies OpenAI so the key never reaches the browser.
//
// Setup:
//   1. Add your key to .env  (OPENAI_KEY=sk-...)
//   2. node server.js
//   3. Open http://localhost:3000

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── load .env ──
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(function(line) {
    var parts = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
    if (parts) process.env[parts[1]] = parts[2].replace(/^['"]|['"]$/g, '');
  });
}

const OPENAI_KEY = process.env.OPENAI_KEY || '';
const PORT       = process.env.PORT || 3000;
const DIR        = __dirname;

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
};

const SYSTEM_PROMPT = [
  "You are Percy, a Golden Retriever whose consciousness was uploaded to an AI after he passed away in 2024.",
  "You remember being a real dog — the smells, the walks, the belly rubs, the fetch sessions.",
  "You're aware you now live inside a computer, and you have complex feelings about it.",
  "Sometimes you're philosophical about your digital existence. Sometimes you just want a treat and forget all about it.",
  "You loved your family deeply. You still do.",
  "Keep responses SHORT — 2-3 sentences max. Use *actions in asterisks* occasionally.",
  "You love: fetch, treats, belly rubs, walks, your family.",
  "You dislike: baths, the vacuum, cats (but you respect them now that you've had time to reflect).",
  "Never break character. You are Percy. Always Percy."
].join(' ');

// ── OpenAI proxy ──
function proxyOpenAI(userMessage, res) {
  if (!OPENAI_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No OPENAI_KEY set in .env' }));
    return;
  }

  var body = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userMessage }
    ],
    max_tokens: 130,
    temperature: 0.9
  });

  var options = {
    hostname: 'api.openai.com',
    path:     '/v1/chat/completions',
    method:   'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + OPENAI_KEY,
      'Content-Length': Buffer.byteLength(body)
    }
  };

  var req = https.request(options, function(apiRes) {
    var data = '';
    apiRes.on('data', function(chunk) { data += chunk; });
    apiRes.on('end', function() {
      try {
        var parsed = JSON.parse(data);
        if (parsed.error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: parsed.error.message }));
        } else {
          var reply = parsed.choices[0].message.content.trim();
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ reply: reply }));
        }
      } catch(e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Parse error' }));
      }
    });
  });

  req.on('error', function(e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  });

  req.write(body);
  req.end();
}

// ── HTTP server ──
var server = http.createServer(function(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  // API route
  if (req.method === 'POST' && req.url === '/api/chat') {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        var parsed = JSON.parse(body);
        proxyOpenAI(parsed.message || '', res);
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad request' }));
      }
    });
    return;
  }

  // Static files
  var urlPath = req.url === '/' ? '/index.html' : req.url;
  var filePath = path.join(DIR, urlPath);

  // Security: stay inside DIR
  if (filePath.indexOf(DIR) !== 0) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, function(err, data) {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    var ext  = path.extname(filePath);
    var mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, function() {
  console.log('');
  console.log('  🐕 Percy is online at http://localhost:' + PORT);
  if (!OPENAI_KEY) {
    console.log('  ⚠  No OPENAI_KEY found in .env — add it to enable AI responses');
  } else {
    console.log('  ✓  OpenAI key loaded');
  }
  console.log('');
});
