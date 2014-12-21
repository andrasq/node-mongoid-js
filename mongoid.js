/**
 * Generate unique ids in the style of mongodb.
 * Ids are a hex number built out of the timestamp, a per-server unique id,
 * the process id and a sequence number.
 *
 * Copyright (C) 2014 Andras Radics
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

var globalSingleton = null;

function mongoid( ) {
    if (globalSingleton) {
        return globalSingleton.fetch();
    }
    else {
        globalSingleton = new MongoId();
        return globalSingleton.fetch();
    }
}

function MongoId( machineId ) {
    // if called as a function, return an id from the singleton
    if (this === global || !this) return mongoid();

    // if no machine id specified, use a 3-byte random number
    if (!machineId) machineId = Math.floor(Math.random() * 0x1000000);
    else if (machineId < 0 || machineId > 0x1000000)
        throw new Error("machine id out of range 0.." + parseInt(0x1000000));

    this.processIdStr = this.hexFormat(machineId, 6) + this.hexFormat(process.pid, 4);
    this.sequenceId = 0;
    this.id = null;
    this.sequenceStartTimestamp = this._getTimestamp();
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
            _timestampStr = hexFormat(Math.floor(_timestamp/1000), 8);
            setTimeout(function(){ _timestamp = null; }, 10);
        }
        return _timestampStr;
    }
    return [getTimestamp, getTimestampStr];
})();
MongoId.prototype._getTimestamp = timestampCache[0];
MongoId.prototype._getTimestampStr = timestampCache[1];

MongoId.prototype.fetch = function() {
    if (this.sequenceId >= 0x1000000) {
        var _timestamp = this._getTimestamp();
        if (_timestamp === this.sequenceStartTimestamp) {
            throw new Error("mongoid sequence overflow: more than 16 million ids generated in 1 second");
        }
        this.sequenceId = 0;
        this.sequenceStartTimestamp = _timestamp;
    }

    this.sequenceId++;
    return this._getTimestampStr() + this.processIdStr + this.hexFormat(this.sequenceId, 6);
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
MongoId.prototype.getTimestamp = function( idstring ) {
    return MongoId.getTimestamp(this.toString());
};

