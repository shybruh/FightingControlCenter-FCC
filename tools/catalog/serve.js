// minimal static server for the measurement page
const http = require('http'), fs = require('fs'), path = require('path')
const types = { '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.js': 'text/javascript' }
http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => { fs.writeFileSync(path.join(__dirname, 'measured.json'), body); res.end('saved ' + body.length) })
    return
  }
  const file = path.join(__dirname, decodeURIComponent(req.url.split('?')[0]))
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' })
    res.end(data)
  })
}).listen(5199, () => console.log('listening'))
