let n = 0;
let i = 0;

if (process.execArgv.includes('--cpu-prof')) { // --cpu-prof-name
  const nIdx = process.argv.indexOf('-n')
  if (nIdx >= 0)
    n = Number(process.argv[nIdx+1]);
  else
    setTimeout(printAndExit, 30_000);
}

function printAndExit() {
  if (process.writevGenericTime) {
    console.log('writevGenericTime(ns)', process.writevGenericTime.toString())
    console.log('writeGenericTime(ns)', process.writeGenericTime.toString())
  }

  process.exit()
}

const http = require('http');

const globalAgent = new http.Agent({
  keepAlive: true,
  maxFreeSockets: 1024,
  maxSockets: 80,
});

const proxy = http.createServer((req, res) => {
  const srvReq = http.request({
    host: '127.0.0.1',
    port: 8090,
    path: req.url,
    method: req.method,
    headers: req.headers,
    agent: globalAgent,
  }, (srvRes) => {
    // assert(srvRes.headers.connection === req.headers.connection === 'keep-alive');
    res.writeHead(srvRes.statusCode, srvRes.statusMessage, srvRes.headers);
    srvRes.pipe(res);

    i ++; i === n && process.nextTick(printAndExit);
  });

  req.pipe(srvReq/** use default option, i.e. End the writer(srvReq) when the reader(req) ends */);
});

proxy.listen(80);