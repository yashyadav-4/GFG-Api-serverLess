//test file for local development

require('dotenv').config();
process.env.RELAY_SECRET = process.env.RELAY_SECRET;
const PORT = process.env.PORT || 6001;

const http = require('http');
const url = require('url');
const handler = require('./api/gfg.js');

const server = http.createServer((req, res)=>{
  const parsedUrl = url.parse(req.url, true);
  req.query = parsedUrl.query;

  res.status = function(code){
    res.statusCode = code;
    return res;
  };
  res.json = function(data){
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
    return res;
  };

  if(parsedUrl.pathname === '/api/gfg'){
    handler(req, res);
  }else{
    res.status(404).json({ error: 'NOT_FOUND', path: parsedUrl.pathname });
  }
});

server.listen(PORT, ()=>{
  console.log(`[GFG Relay Dev Server] running at http://localhost:${PORT}`);
});
