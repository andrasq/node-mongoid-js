mongoid-js
==========
[![Build status](https://travis-ci.org/andrasq/node-mongoid-js.svg?branch=master)](https://travis-ci.org/andrasq/node-mongoid-js?branch=master)
[![Coverage Status](https://coveralls.io/repos/github/andrasq/node-mongoid-js/badge.svg?branch=master)](https://coveralls.io/github/andrasq/node-mongoid-js?branch=master)

very very fast MongoID compatible unique id generator

Generates unique id strings.  The ids are constructed like MongoDB document ids,
built out of a timestamp, system id, process id and sequence number.  Similar
to `BSON.ObjectID()`, but at 12 million ids / sec, 35 x faster.

The ids are guaranteed unique on any one server, and can be configured
to be unique across a cluster of up to 16 million (2^24) servers.
Uniqueness is guaranteed by unique {server, process} id pairs.

The ids returned by an id factory are always in strictly ascending order;
an id string will compare as `<` less than any id string generated after it.

The uniqueness guarantee requires that process ids be no more than 16 bits
(`kernel.pid_max` must be configured to 65535 or less on linux).

The 24-char id string is constructed by concatenating the big-endian hex values of
- 32 bit count of seconds elapsed since 1970-01-01 00:00:00 GMT
- 24 bit caller provided system id, else a 24-bit random value
- 16 bits of the process id (high bits above 16 are ignored)
- 24 bit monotonically increasing sequence number


## Summary

    var mongoid = require('mongoid-js');
    var id = mongoid();                 // => "543f376340e2816497000001"
    var id2 = mongoid();                // => "543f376340e2816497000002"

    var MongoId = require('mongoid-js').MongoId;
    var idFactory = new MongoId(/*systemId:*/ 0x123);
    var id = idFactory.fetch();         // => "543f3789001230649f000001"


## Functions

### mongoid( )

generates ids that are unique to this server.  The ids are generated by a
`new MongoId` singleton initialized with a random machine id.  All subsequent calls
to `mongoid()` in this process will fetch ids from this singleton.

    // ids with a randomly chosen system id (here 0x40e281)
    var mongoid = require('mongoid-js');
    var id1 = mongoid();                // => "543f376340e2816497000001"
    var id2 = mongoid();                // => "543f376340e2816497000002"

### new MongoId( [systemId] )

Create an id factory that embeds the given system id in each generated unique id.
By a systematic assignment of system ids to servers, this approach can guarantee
globally unique ids (ie, globally for an installation).

The systemId must be an integer between 0 and 16777215 (0xFFFFFF), inclusive.
If no system id is specified, a random 24-bit integer is used.

    // ids with a unique system id (here 0xbaabaa)
    var MongoId = require('mongoid-js').MongoId;
    var systemId = 0xBaaBaa;
    var idFactory = new MongoId(systemId);
    idFactory.fetch();                  // => "59cd11d3baabaa05ce000001"

## Instance Methods

MongoId objects can act as id factories.  Each factory can also assign itself an id.
Id factories should all have unique system ids, else they may not generate unique ids.

    var MongoId = require('mongoid-js').MongoId;
    var systemId = 0x123456;
    var ids = new MongoId(systemId);

#### ids.fetch( )

generate and return the next id in the sequence.  Up to 16 million distinct
ids (16777216) can be fetched during the same wallclock second; trying to
fetch more blocks until the next second.  The second starts when the clock reads _*000_
milliseconds, not when the first id is fetched.  The second ends 1000
milliseconds after the start, when the clock next reads _*000_ milliseconds.

    var ids = new MongoId();
    var id1 = ids.fetch();              // => "543f3789001230649f000001"
    var id2 = ids.fetch();              // => "543f3789001230649f000002"


#### ids.parse( [idString] )

With no `idString`, parse the factory's (id object's) built-in id.  If the factory does not
yet have an id string, assign one.  Same as `MongoId.parse(id.toString())`, see below.  If
`idString` is provided, parse it just like `MongoId.parse`.

#### ids.getTimestamp( )

Get the timestamp from the factory id string.  Assign a new id string to the factory if it
does not yet have one.  Same as `MongoId.getTimestamp(id.getTimestamp())`, see below.

#### ids.toString( )

Return the factory id string.  If the factory does not yet have an id string,
assign one.  The assigned id is reused the next time it a factory id is needed.

    var ids = new MongoId();
    var id1 = ids.fetch();              // => "59cd101bd5057e7ec1000001"
    ids.toString();                     // => "59cd101bd5057e7ec1000002"


## Class Methods

### MongoId.parse( idString )

Decompose the id string into its parts -- unix timestamp, machine id,
process id and sequence number.  Unix timestamps are seconds since the
start of the epoch (1970-01-01 GMT).  Note that `parse()` returns seconds,
while `getTimestamp()` returns milliseconds.

    var parts = MongoId.parse("543f376340e2816497000013");
    // => { timestamp: 1413429091,      // 0x543f3763
    //      machineid: 4252289,         // 0x40e281
    //      pid: 25751,                 // 0x6497
    //      sequence: 19 }              // 0x000013

### MongoId.getTimestamp( idString )

Return just the javascript timestamp part of the id.  Javascript timestamps
are milliseconds since the start of the epoch.  Each mongoid embeds a seconds
precision unix timestamp; getTimestamp() returns that multiplied by 1000.

    MongoId.getTimestamp("543f376340e2816497000013");
    // => 1413429091000

### MongoId.shorten( idString )

Convert the hexadecimal mongoid to a more compact string.  The conversion is lossless.
The converted strings sort into the same respective alpha order as in hexadecimal form, and
are safe to use in URLs.

### MongoId.unshorten( shortIdString )

Convert the shortened mongoid string back to its hexadecimal form.

    MongoId.shorten("543f376340e2816497000013");
    // => "K2wrNo2XVLHM---I"

    MongoId.unshorten("K2wrNo2XVLHM---I");
    // => "543f376340e2816497000013"

### MongoId.setShortCharset( charset )

Redefine the shortid character set.  `charset` is expected to be a string of 64 7-bit ASCII characters.
The default character set is `-`, `0-9`, `A-Z`, `_`, and `a-z`, in that order (ASCII order).
The character set `'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'` would
produce base64 shortids (which wouldn't sort into timestamp and sequence order, but would be
base64).  Note that this changes the shortid charset globally, for all MongoId instances.


## Change Log

- 1.2.0 - new static methods `shorten` and `unshorten`, block until next second if out of ids (do not throw),
          optional idString to id.parse(), 30% faster `fetch()`
- 1.1.3 - only include the low 16 bits of the process id to not overflow 24 chars,
  change unit tests to work on systems with longer than 16 bit process ids
- 1.1.2 - put under travis ci tests, add coverage,  move `qnit` dev dependency into .travis.yml
- 1.1.1 - fix test with qnit, fix unit test pid < 0x1000, add .travis.yml
- 1.1.0 - tentative `browserify` support: use a random pid if process.pid is not set, avoid object methods in constructor, 100% unit test coverage
- 1.0.7 - fix getTimestamp and quantize correctly, deprecate index.js, test with qnit, fix sequence wrapping
- 1.0.6 - doc edits
- 1.0.5 - stable, fast version
