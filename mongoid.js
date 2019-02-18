/**
 * Generate unique string ids in the style of mongodb.
 * Ids are a hex number built out of the timestamp, a per-server unique id,
 * the process id and a sequence number.
 *
 * Copyright (C) 2014-2019 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * MongoDB object ids are 12 bytes (24 hexadecimal chars), composed out of
 * a Unix timestamp (seconds since the epoch), a system id, the process id,
 * and a monotonically increasing sequence number.
 * The Unix epoch is 1970-01-01 00:00:00 GMT.
 *
 *      timestamp       4B (8 hex digits)
 *      machine id      3B (6 digits)
 *      process id      2B (4 digits)
 *      sequence        3B (6 digits)
 */


'use strict';


var globalSingleton = null;

var _getTimestamp = null;
var _getTimestampStr = null;

var _hexCharset = '0123456789abcdef';
var _hexCharvals = new Array(128);
var _hexDigits = new Array(16);
setCharset('0123456789abcdef', 16, _hexCharvals, _hexDigits);

// candidates for shortchars were: *,.-/^_|~  We use - and _ like base64url, but not in base64 order.
var _shortCharset = MongoId.shortCharset = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
var _shortCharvals = new Array(128);
var _shortDigits = new Array(64);
setCharset('-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz', 64, _shortCharvals, _shortDigits);


function MongoId( machineId ) {
    // TODO: if (typeof machineId === 'object') ... machineId || sysid, processId || pid

    // if called as a function, return an id from the singleton
    if (!(this instanceof MongoId)) return globalSingleton.fetch();

    // if no machine id specified, use a 3-byte random number
    if (!machineId) machineId = Math.floor(Math.random() * 0x1000000);
    else if (machineId < 0 || machineId >= 0x1000000)
        throw new Error("machine id out of range 0.." + parseInt(0x1000000));
    this.machineId = machineId;

    // if process.pid not available, use a random 2-byte number between 10k and 30k
    // suggestions for better browserify support from @cordovapolymer at github
    var processId = (process.pid && process.pid & 0xFFFF) || 10000 + Math.floor(Math.random() * 20000);
    this.processId = processId;

    this.processIdStr = _hexFormat6(machineId) + _hexFormat4(processId);
    this.sequenceId = 0;
    this.sequencePrefix = "00000";
    this.sequencePrefixShort = "---";
    this.idPrefixHex = null;
    this.idPrefixShort = null;
    this.shortTimestamp = null;
    this.hexTimestamp = null;
    this.id = null;
    this.sequenceStartTimestamp = _getTimestamp();
}

/**
// timebase adapted from qlogger: added isValid, changed to seconds
function Timebase( ) {
    var self = this;
    reset();

    // cache values until timestamp changes
    this._cache = {};
    this.set = function set(key, value) { this._cache[key] = value };
    this.get = function get(key) { return this._cache[key] };

    this.isValid = function isValid() {
        var sec = this.seconds;
        return sec !== null && (--this.reuseLimit >= 0 || this.refresh() === sec);
    };
    this.getSeconds = function getSeconds() {
        return (this.seconds && --this.reuseLimit >= 0) ? this.seconds : this.refresh();
    }
    this.refresh = function refresh() {
        var sec = this.seconds;
        var now = new Date().getTime();
        this.timeoutTimer = this.timeoutTimer || setTimeout(reset, (100 - now % 100));
        this.seconds = (now / 1000) >>> 0;
        if (this.seconds !== sec) this._cache = {};
        this.reuseLimit = 100;
        return this.seconds;
    }

    function reset() {
        clearTimeout(self.timeoutTimer);
        self.timeoutTimer = null;
        self.seconds = null;
        self.reuseLimit = 100;
        self._cache = {};
    }
}
**/

// TODO: make this closure into a singleton
// TODO: deprecate timestampStr
var timestampCache = (function() {
    var _timestamp;
    var _timestampStr;
    var _ncalls = 0;
    var _timeout = null;
    function expireTimestamp() {
        _timeout = _timestamp = null;
    }
    function getTimestamp( ) {
        if (!_timestamp || ++_ncalls > 1000) getTimestampStr();
        return _timestamp;
    }
    function getTimestampStr( ) {
        if (!_timestamp || ++_ncalls > 1000) {
            _ncalls = 0;
            _timestamp = Date.now();
            var msToNextTimestamp = 1000 - _timestamp % 1000;
            if (_timeout) { clearTimeout(_timeout); _timeout = null }
            // reuse the timestamp for up to 100 ms, then get a new one
            _timeout = setTimeout(expireTimestamp, Math.min(msToNextTimestamp - 1, 100));
            _timestamp -= _timestamp % 1000;
            _timestampStr = _hexFormat8(_timestamp/1000);
        }
        return _timestampStr;
    }
    return [getTimestamp, getTimestampStr];
})();
_getTimestamp = MongoId.prototype._getTimestamp = timestampCache[0];
_getTimestampStr = MongoId.prototype._getTimestampStr = timestampCache[1];

// return the next sequence id
MongoId.prototype._getNextSequenceId = function _getNextSequenceId( ) {
    this.sequenceId += 1;
    if (this.sequenceId >= 0x1000000) {
        // sequence wrapped, we can make an id only if the timestamp advanced
        // Busy-wait until the next second so we can restart the sequence.
        do {
            // TODO: emit or log a warning so can adjust generator
            var _timestamp = this._getTimestamp();
        } while (_timestamp === this.sequenceStartTimestamp);
        this.sequenceId = 0;
        this.sequenceStartTimestamp = _timestamp;
    }
    if ((this.sequenceId & 0xF) === 0) {
        // TODO: this.sequencePrefix = null;
        this.sequencePrefix = _hexFormat4(this.sequenceId >>> 8) + _hexDigits[(this.sequenceId >>> 4) & 0xF];
        if ((this.sequenceId & 0x3F) === 0) this.sequencePrefixShort = null;
    }
    return this.sequenceId;
}

MongoId.prototype.fetch = function fetch( ) {
    // fetch sequenceId first, it waits if necessary
    var sequenceId = this._getNextSequenceId();
/**
    var lastTimestamp = this.hexTimestamp;
    var timestamp = this._getTimestamp();
    if (timestamp !== lastTimestamp) {
        var sec = timestamp / 1000;
        this.hexTimestamp = timestamp;
        this.idPrefixHex =
            _hexFormat8(sec) +
            _hexFormat6(this.machineId) +
            _hexFormat4(this.processId);
    }
**/
    if (!this.sequencePrefix) this.sequencePrefix = _hexFormat4(sequenceId >>> 8) + _hexDigits[(sequenceId >>> 4) & 0xF];
    //return this.idPrefixHex + this.sequencePrefix + _hexDigits[sequenceId % 16];
    return this._getTimestampStr() + this.processIdStr + this.sequencePrefix + _hexDigits[sequenceId % 16];
};
MongoId.prototype.mongoid = MongoId.prototype.fetch;

// fetchShort: 93m/s if timestamp never expires, 82m/s with 100 reuses.
MongoId.prototype.fetchShort = function fetchShort( ) {
    var sequenceId = this._getNextSequenceId();
    var lastTimestamp = this.shortTimestamp;
    var timestamp = this._getTimestamp();
    if (timestamp !== lastTimestamp) {
        var sec = timestamp / 1000;
        this.shortTimestamp = timestamp;
        this.idPrefixShort =
            _shortFormat4(sec >>> 8) +
            _shortFormat4(sec << 16 | this.machineId >>> 8) +
            _shortFormat4(this.machineId << 16 | this.processId);
    }
    if (!this.sequencePrefixShort) this.sequencePrefixShort = _shortFormat3(sequenceId >>> 6);
    return this.idPrefixShort + this.sequencePrefixShort + _shortDigits[sequenceId & 0x3F];
}

// typeset the 8, 6 and 4 least significant hex digits from the number
function _hexFormat8( n ) {
    return _hexDigits[(n >>> 28) & 0xF] + _hexDigits[(n >>> 24) & 0xF] + _hexFormat6(n);
}
function _hexFormat6( n ) {
    return _hexDigits[(n >>> 20) & 0xF] + _hexDigits[(n >>> 16) & 0xF] + _hexFormat4(n);
}
function _hexFormat4( n ) {
    return _hexDigits[(n >>> 12) & 0xF] + _hexDigits[(n >>>  8) & 0xF] +
           _hexDigits[(n >>>  4) & 0xF] + _hexDigits[(n       ) & 0xF];
}

// legacy hexFormat, not used but part of the prototype
var _zeroPadding = ["", "0", "00", "000", "0000", "00000", "000000", "0000000"];
function hexFormat( n, width ) {
    var s = n.toString(16);
    return _zeroPadding[width - s.length] + s;
}
MongoId.prototype.hexFormat = hexFormat;

// each MongoId object also evaluates to a per-object id string
MongoId.prototype.toString = function toString( ) {
    return this.id ? this.id : this.id = this.fetch();
};

MongoId.parse = function parse( idstring ) {
    // TODO: should throw an Error not coerce, but is a breaking change
    if (typeof idstring !== 'string') idstring = "" + idstring;
    return {
        timestamp: parseInt(idstring.slice( 0,  0+8), 16),
        machineid: parseInt(idstring.slice( 8,  8+6), 16),
        pid:       parseInt(idstring.slice(14, 14+4), 16),
        sequence:  parseInt(idstring.slice(18, 18+6), 16)
    };
};
// make the class method available as an instance method too
MongoId.prototype.parse = function parse( hexid ) {
    // TODO: parse(hexid || this.toString());
    return MongoId.parse(this.toString());
};

// return the javascript timestamp (milliseconds) embedded in the id.
// Note that the ids embed unix timestamps (seconds precision).
MongoId.getTimestamp = function getTimestamp( idstring ) {
    return parseInt(idstring.slice(0, 8), 16) * 1000;
};
MongoId.prototype.getTimestamp = function getTimestamp( hexid ) {
    // TODO: unit tests assume: getTimestamp( hexid || this.toString() )
    return MongoId.getTimestamp(this.toString());
};

function setCharset( chars, len, charvals, digits ) {
    if (chars.length !== len) throw new Error('id charset must have ' + len + ' characters');
    for (var i=0; i<len; i++) if (chars.charCodeAt(i) > 127) throw new Error('id charset must be 7-bit ASCII');

    if (len === 16) {
        _hexCharset = chars;
        for (var i=0; i<16; i++) digits[i] = chars[i];
        for (var i=0; i<10; i++) charvals[chars.charCodeAt(i)] = i;
        for (var i=10; i<16; i++) charvals[chars.charCodeAt(i)] = i;
        for (var i=10; i<16; i++) charvals[chars.charCodeAt(i) ^ 0x20] = i;
    }
    else /*if (len === 64)*/ {
        _shortCharset = chars;
        for (var i=0; i<64; i++) charvals[chars.charCodeAt(i)] = i;
        for (var i=0; i<64; i++) digits[i] = chars[i];
    }
}

// typeset the 4 and 3 least significant base64url digits
function _shortFormat4( n ) {
    return _shortFormat3(n >>> 6) + _shortDigits[n & 0x3F];
}
function _shortFormat3( n ) {
    return _shortDigits[(n >>> 12) & 0x3F] +
           _shortDigits[(n >>>  6) & 0x3F] +
           _shortDigits[(n       ) & 0x3F];
    // node-v6 is 125% faster using an array of digit strings, node-v8 is 15% faster with the charset string,
    // node-v9 is 10% faster using digits, node-v11 is 30% faster using digits
}

// convert length digits of hexid string to shortid
function _shorten( mongoid, length ) {
    var bits, shortid = '';
    var chars = new Array();
    for (var ix=0; ix<length; ix+=6) {
        bits =
            // offset into string faster than lookup
            (_hexCharvals[mongoid.charCodeAt(ix + 0)] << 20) | (_hexCharvals[mongoid.charCodeAt(ix + 1)] << 16) |
            (_hexCharvals[mongoid.charCodeAt(ix + 2)] << 12) | (_hexCharvals[mongoid.charCodeAt(ix + 3)] <<  8) |
            (_hexCharvals[mongoid.charCodeAt(ix + 4)] <<  4) | (_hexCharvals[mongoid.charCodeAt(ix + 5)] <<  0);
        shortid += _shortFormat4(bits);
    }
    return shortid;
}

// convert shortid string to hex
function _unshorten( shortid ) {
    var bits, hexid = '';
    for (var ix=0; ix<16; ix+=4) {
        var bits =
            (_shortCharvals[shortid.charCodeAt(ix + 0)] << 18) |
            (_shortCharvals[shortid.charCodeAt(ix + 1)] << 12) |
            (_shortCharvals[shortid.charCodeAt(ix + 2)] <<  6) |
            (_shortCharvals[shortid.charCodeAt(ix + 3)] <<  0);
        hexid += _hexFormat6(bits);
    }
    return hexid;
}

MongoId.setShortCharset = function setShortCharset(chars) { setCharset(chars, 64, _shortCharvals, _shortDigits); MongoId.shortCharset = chars; };
MongoId.shorten = function shorten( mongoid ) { return _shorten(mongoid, 24); };
MongoId.unshorten = function unshorten( shortid ) { return _unshorten(shortid); };

// accelerate method access
MongoId.prototype = toStruct(MongoId.prototype);
function toStruct(hash) { return toStruct.prototype = hash }


var globalSingleton = new MongoId();
module.exports = MongoId;
module.exports.MongoId = MongoId;

module.exports._singleton = globalSingleton;
module.exports.mongoid = function() { return module.exports._singleton.fetch() };
module.exports.fetchShort = function() { return module.exports._singleton.fetchShort() };
