(function() {
  var ChromeUDPSocket = require('./chrome-udp-socket.js');

  //add Buffer
  ChromeUDPSocket.Buffer = require('buffer').Buffer;

  if (typeof define == 'function')
    define(ChromeUDPSocket);
  else
    global.ChromeUDPSocket = ChromeUDPSocket;
})();