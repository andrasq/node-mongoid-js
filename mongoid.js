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

module.exports = MongoId;
module.exports.mongoid = mongoid;
module.exports.MongoId = MongoId;
module.exports._singleton = globalSingleton;

var globalSingleton = null;

function mongoid( ) {
    if (globalSingleton) {
        return globalSingleton.fetch();
    }
    else {
        globalSingleton = new MongoId();
        module.exports._singleton = globalSingleton;
        return globalSingleton.fetch();
    }
}

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
    // if called as a function, return an id from the singleton
    if (this === global || !this) return mongoid();

    // if no machine id specified, use a 3-byte random number
    if (!machineId) machineId = Math.floor(Math.random() * 0x1000000);
    else if (machineId < 0 || machineId >= 0x1000000)
        throw new Error("machine id out of range 0.." + parseInt(0x1000000));

    // if process.pid not available, use a random 2-byte number between 10k and 30k
    // suggestions for better browserify support from @cordovapolymer at github
    var processId = (process.pid && process.pid & 0xFFFF) || 10000 + Math.floor(Math.random() * 20000);

    this.processIdStr = hexFormat(machineId, 6) + hexFormat(processId, 4);
    this.sequenceId = 0;
    this.sequencePrefix = "00000";
    this.id = null;
    this.sequenceStartTimestamp = _getTimestamp();
}

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
            _timestampStr = hexFormat(_timestamp/1000, 8);
        }
        return _timestampStr;
    }
    return [getTimestamp, getTimestampStr];
})();
_getTimestamp = MongoId.prototype._getTimestamp = timestampCache[0];
_getTimestampStr = MongoId.prototype._getTimestampStr = timestampCache[1];

MongoId.prototype.fetch = function fetch() {
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
        this.sequencePrefix = hexFormat((this.sequenceId >>> 4).toString(16), 5);
    }
    return this._getTimestampStr() + this.processIdStr + this.sequencePrefix + _hexDigits[this.sequenceId % 16];
};
MongoId.prototype.mongoid = MongoId.prototype.fetch;

var _zeroPadding = ["", "0", "00", "000", "0000", "00000", "000000", "0000000"];
function hexFormat(n, width) {
    var s = n.toString(16);
    return s.length >= width ? s : _zeroPadding[width - s.length] + s;
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
MongoId.prototype.parse = function parse( idstring ) {
    return MongoId.parse(this.toString());
};

// return the javascript timestamp (milliseconds) embedded in the id.
// Note that the ids embed unix timestamps (seconds precision).
MongoId.getTimestamp = function getTimestamp( idstring ) {
    return parseInt(idstring.slice(0, 8), 16) * 1000;
};
MongoId.prototype.getTimestamp = function getTimestamp( ) {
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
        shortid +=
            _shortDigits[(bits >>> 18) & 0x3F] +
            _shortDigits[(bits >>> 12) & 0x3F] +
            _shortDigits[(bits >>>  6) & 0x3F] +
            _shortDigits[(bits >>>  0) & 0x3F];
            // node-v6 is 125% faster using an array of digit strings, node-v8 is 15% faster with the charset string,
            // node-v9 is 10% faster using digits, node-v11 is 30% faster using digits
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
        hexid +=
            // custom hex formatting is 3x faster than hexFormat()
            _hexCharset[(bits >>> 20) & 0xF] + _hexCharset[(bits >>> 16) & 0xF] +
            _hexCharset[(bits >>> 12) & 0xF] + _hexCharset[(bits >>>  8) & 0xF] +
            _hexCharset[(bits >>>  4) & 0xF] + _hexCharset[(bits >>>  0) & 0xF];
    }
    return hexid;
}

MongoId.setShortCharset = function setShortCharset(chars) { setCharset(chars, 64, _shortCharvals, _shortDigits); MongoId.shortCharset = chars; };
MongoId.shorten = function shorten( mongoid ) { return _shorten(mongoid, 24); };
MongoId.unshorten = function unshorten( shortid ) { return _unshorten(shortid); };

// accelerate method access
MongoId.prototype = toStruct(MongoId.prototype);
function toStruct(hash) { return toStruct.prototype = hash }
