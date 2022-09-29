// Flags: --expose-internals

'use strict';
const { expectsError, mustCall } = require('../common');
const assert = require('assert');
const { createServer, maxHeaderSize, get } = require('http');
const { createConnection } = require('net');

const { getOptionValue } = require('internal/options');

const CRLF = '\r\n';
const DUMMY_HEADER_NAME = 'Cookie: ';
const DUMMY_HEADER_VALUE = 'a'.repeat(
  // Plus one is to make it 1 byte too big
  maxHeaderSize - DUMMY_HEADER_NAME.length - (2 * CRLF.length) + 1
);
const PAYLOAD_GET = 'GET /blah HTTP/1.1';
const PAYLOAD = PAYLOAD_GET + CRLF +
  DUMMY_HEADER_NAME + DUMMY_HEADER_VALUE + CRLF.repeat(2);

const server = createServer();

server.on('request', mustCall((_, res) => { // reply to normal requests
  res.statusCode = 200;
  res.end();
}));

server.on('connection', mustCall(socket => {
  // Legacy parser gives sligthly different response.
  // This discripancy is not fixed on purpose.
  const legacy = getOptionValue('--http-parser') === 'legacy';
  socket.on('error', expectsError({
    name: 'Error',
    message: 'Parse Error: Header overflow',
    code: 'HPE_HEADER_OVERFLOW',
    bytesParsed: maxHeaderSize + PAYLOAD_GET.length - (legacy ? -1 : 0),
    rawPacket: Buffer.from(PAYLOAD)
  }));
}, 2));

server.listen(0, mustCall(async () => {
  await sendReqWithLargeHeader(await makeConn());

  // send a HTTP request with a large header to a socket
  // on which a HTTP transaction has finished
  await sendReqWithLargeHeader(await makeConnAndSendNormalReq());

  server.close();
}));

/**
 * 
 * @param {import("net").Socket} c 
 */
function sendReqWithLargeHeader(c) {
  return new Promise(resolve => {
    let received = '';
  
    c.write(PAYLOAD);
    c.on('data', mustCall((data) => {
      received += data.toString();
    }));
    c.on('end', mustCall(() => {
      assert.strictEqual(
        received,
        'HTTP/1.1 431 Request Header Fields Too Large\r\n' +
        'Connection: close\r\n\r\n'
      );
      c.end();
    }));
    c.on('close', mustCall(resolve));
  })
}

/**
 * 
 * @returns {Promise<import("net").Socket>}
 */
 function makeConn() {
  return new Promise(resolve => {
    const c = createConnection(server.address().port);
    c.on('connect', mustCall(() => { resolve(c) }));
  });
}

/**
 * 
 * @returns {Promise<import("net").Socket>}
 */
function makeConnAndSendNormalReq() {
  return new Promise(resolve => {
    const req = get(`http://127.0.0.1:${server.address().port}`, 
      mustCall(res => {
        assert.strictEqual(res.statusCode, 200);
        res.on('data', ()=>{});
        res.on('end', mustCall(() => {
          resolve(req.socket);
        }));
      }),
    );
  });
}
