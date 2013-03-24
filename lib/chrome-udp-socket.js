var util   = require('util');
var events = require('events');
var Buffer = require('buffer').Buffer;

var api = chrome.socket || chrome.experimental.socket;

function Socket(type, listener, options) {
  events.EventEmitter.call(this);

  //init state variables
  this._listening = false;
  this._binding   = false;
  this._creating  = false;

  this._socketId  = null;

  //type of socket 'udp4', 'udp6', 'unix_socket'
  this.type = type || 'udp4';

  //listener
  if (typeof listener === 'function')
    this.on('message', listener);

  //args swap
  if(typeof listener === 'object') {
    options = listener;
  }

  this.options = options || {};

  //'Buffer' or 'ArrayBuffer'
  this.options.output = this.options.output || 'Buffer';
}

util.inherits(Socket, events.EventEmitter);

exports.Socket = Socket;
exports.createSocket = function(type, listener) {
  return new Socket(type, listener);
};

Socket.prototype._create = function() {
  var self = this;

  if(this._creating)
    throw new Error('Already creating');

  this._creating = true;

  api.create('udp', function(socketInfo) {
    var socketId = socketInfo.socketId;

    if(socketId < 0) {
      self.emit('error', new Error("Error during socket creation", socketId));
      return;
    }

    self._creating = false;
    self._socketId = socketId;

    self.emit('created', socketInfo);
  });

};

Socket.prototype.bind = function(port, address) {
  var self = this;

  //wait for socket creation before binding
  if(!this._socketId) {

    //call again bind when socket created
    var _args = arguments;
    this.once('created', function() {
      self.bind.apply(self, _args);
    });

    //start creating if not alreaduy the case
    if(!this._creating) {
      self._create();
    }

    return;
  }

  if(this._listening)
    throw new Error('already listening');

  if(this._binding)
    throw new Error('already binding');

  this._binding = true;

  //default
  address = address || 'localhost';
  port = port || 0;

  //localhost is not an accpetable address
  if(address === 'localhost') {
    address = "0.0.0.0";
  }

  api.bind(this._socketId, address, port, function(s) {
    if(s < 0) {
      this.emit('error', new Error("Error during binding", s));
      return;
    }

    api.getInfo(self._socketId, function(info) {

      self._binding = false;

      //set address
      self._address = {
        address: info.localAddress,
        port: info.localPort,
        family: info.socketType
      };

      var read = function() {
        api.recvFrom(self._socketId, function(rcvFromInfo) {
          if(rcvFromInfo.resultCode < 0) {
            self.emit("error", new Error("Error during recvFrom", rcvFromInfo.resultCode));
            return;
          }

          //rebind immediately
          read();

          //transoform into buffer if needed
          if(self.options.output === "Buffer") {
            rcvFromInfo.data = toBuffer(rcvFromInfo.data);
          }

          self.emit("message", rcvFromInfo.data, {
            address : rcvFromInfo.address,
            port: rcvFromInfo.port
          });

        });
      };

      read();
      self._listening = true;
      self.emit('listening');

    });
  });

  return this;
};

Socket.prototype.send = function(buffer, offset, length, port, address, callback) {
  var self = this;

  //we are not listening : bind and then send when listening
  if(!this._listening) {
    if(!this._binding)
      this.bind();

    var _args = arguments;
    this.once('listening', function() {
      self.send.apply(self, _args);
    });
    return;
  }

  //transform buffer into array buffers
  if(Buffer.isBuffer(buffer)) {
    buffer = toArrayBuffer(buffer);
  }

  //emit directly exception if any
  if (offset >= buffer.length)
    throw new Error('Offset into buffer too large');
  if (offset + length > buffer.length)
    throw new Error('Offset + length beyond buffer length');

  //send it on wire
  api.sendTo(
    this._socketId,
    buffer.slice(offset, length+offset),
    address, port,
    function(sendResult) {
      if(callback)
        callback.call(null, sendResult);

    });
};


Socket.prototype.close = function() {
  api.destroy(this._socketId);
  this.emit('close');
  this.removeAllListeners();
};


Socket.prototype.address = function() {
  if(! this._address)
    throw new Error('not binded');

  return this._address;
};


// not implemented methods

Socket.prototype.setBroadcast = function(arg) {
  throw new Error('not implemented');
};

Socket.prototype.setTTL = function(arg) {
  throw new Error('not implemented');
};

Socket.prototype.setMulticastTTL = function(arg) {
  throw new Error('not implemented');
};

Socket.prototype.setMulticastLoopback = function(arg) {
  throw new Error('not implemented');
};

Socket.prototype.addMembership = function(multicastAddress, nterfaceAddress) {
  throw new Error('not implemented');
};

Socket.prototype.dropMembership = function(multicastAddress, interfaceAddress) {
  throw new Error('not implemented');
};

//utils

function toArrayBuffer(buffer) {
    var ab = new ArrayBuffer(buffer.length);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buffer.length; ++i) {
        view[i] = buffer.readUInt8(i);
    }
    return ab;
}

function toBuffer(ab) {
    var buffer = new Buffer(ab.byteLength);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buffer.length; ++i) {
        buffer.writeUInt8(view[i], i);
    }
    return buffer;
}