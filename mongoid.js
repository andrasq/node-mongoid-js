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

module.exports = mongoid;
module.exports.mongoid = MongoId;
module.exports.MongoId = MongoId;

var globalSingleton = null;

function mongoid( ) {
    if (!globalSingleton) globalSingleton = new MongoId();
    return globalSingleton.fetch();
}

function MongoId( machineId ) {
    // if called as a function, return an id from the singleton
    if (this === global || !this) return mongoid();

    // if no machine id specified, use a 3-byte random number
    if (!machineId) machineId = Math.floor(Math.random() * 0x1000000);
    else if (machineId < 0 || machineId > 0x1000000)
        throw new Error("machine id out of range 0.." + parseInt(0x1000000));

    this.machineIdStr = hexFormat(machineId, 6);
    this.pidStr = hexFormat(process.pid, 4);
    this.lastTimestamp = null;
    this.sequenceId = 0;
    this.id = null;
}

MongoId.prototype.fetch = function() {
    var id;
    var timestamp = Math.floor(Date.now()/1000);

    // soft-init on first call and on every new second
    if (timestamp !== this.lastTimestamp) {
        this.lastTimestamp = timestamp;
        this.timestampStr = hexFormat(timestamp, 8);
        if (!this.sequenceId) this.sequenceStartTimestamp = timestamp;
    }

    // sequence wrapping and overflow check
    if (this.sequenceId >= 0x1000000) {
        if (timestamp === this.sequenceStartTimestamp) {
            throw new Error("mongoid sequence overflow: more than 16 million ids generated in 1 second");
        }
        this.sequenceId = 0;
        this.sequenceStartTimestamp = timestamp;
    }

    id = this.timestampStr + this.machineIdStr + this.pidStr + hexFormat(++this.sequenceId, 6);
    return id;
};

function hexFormat(n, width) {
    var s = n.toString(16);
    while (s.length + 2 < width) s = "00" + s;
    while (s.length < width) s = "0" + s;
    return s;
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

