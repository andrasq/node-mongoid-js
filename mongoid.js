/**
 * Generate unique ids in the style of mongodb.
 * Ids are a hex number built out of the timestamp, a per-server unique id,
 * the process id and a sequence number.
 *
 * Copyright (C) 2014,2016 Andras Radics
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

function MongoId( machineId ) {
    // if called as a function, return an id from the singleton
    if (this === global || !this) return mongoid();

    // if no machine id specified, use a 3-byte random number
    if (!machineId) machineId = Math.floor(Math.random() * 0x1000000);
    else if (machineId < 0 || machineId >= 0x1000000)
        throw new Error("machine id out of range 0.." + parseInt(0x1000000));

    // if process.pid not available, use a random 2-byte number between 10k and 30k
    // suggestions for better browserify support from @cordovapolymer at github
    var processId = process.pid || 10000 + Math.floor(Math.random() * 20000);

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
    function getTimestamp( ) {
        if (!_timestamp) getTimestampStr();
        return _timestamp;
    }
    function getTimestampStr( ) {
        if (!_timestamp || ++_ncalls > 1000) {
            _ncalls = 0;
            _timestamp = Date.now();
            var msToNextTimestamp = 1000 - _timestamp % 1000;
            setTimeout(function(){ _timestamp = null; }, Math.min(msToNextTimestamp - 1, 100));
            _timestamp -= _timestamp % 1000;
            _timestampStr = hexFormat(_timestamp/1000, 8);
        }
        return _timestampStr;
    }
    return [getTimestamp, getTimestampStr];
})();
_getTimestamp = MongoId.prototype._getTimestamp = timestampCache[0];
_getTimestampStr = MongoId.prototype._getTimestampStr = timestampCache[1];

var _hexDigits = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'];
MongoId.prototype.fetch = function() {
    this.sequenceId += 1;
    if (this.sequenceId >= 0x1000000) {
        // sequence wrapped, we can make an id only if the timestamp advanced
        var _timestamp = this._getTimestamp();
        if (_timestamp === this.sequenceStartTimestamp) {
            // TODO: find a more elegant way to deal with overflow
            throw new Error("mongoid sequence overflow: more than 16 million ids generated in 1 second");
        }
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
    return _zeroPadding[width - s.length] + s;
}
MongoId.prototype.hexFormat = hexFormat;

// each MongoId object also evaluates to a per-object id string
MongoId.prototype.toString = function( ) {
    return this.id ? this.id : this.id = this.fetch();
};

MongoId.parse = function( idstring ) {
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
MongoId.prototype.parse = function( idstring ) {
    return MongoId.parse(this.toString());
};

// return the javascript timestamp (milliseconds) embedded in the id.
// Note that the ids embed unix timestamps (seconds precision).
MongoId.getTimestamp = function( idstring ) {
    return parseInt(idstring.slice(0, 8), 16) * 1000;
};
MongoId.prototype.getTimestamp = function( ) {
    return MongoId.getTimestamp(this.toString());
};

