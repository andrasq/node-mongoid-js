'use stricf';

var mongoid = require('../');
var MongoId = require('../').MongoId;

function uniqid() {
    return Math.floor(Math.random() * 0x1000000);
}

function testUnique( test, a ) {
    var ids = {}
    for (var i in a) {
        var v = a[i];
        if (ids[v] !== undefined) test.fail("index " + i + ": duplicate id " + v + ", seen at index " + ids[v]);
        ids[v] = i;
    }
}

module.exports.require = {
    setUp: function(cb) {
        cb();
    },

    tearDown: function(cb) {
        cb();
    },

    tests: {
        testShouldNotBreakOnPackageJson: function(test) {
            var json = require('../package.json');
            test.done();
        },

        testShouldExportMongoidFunction: function(test) {
            var mongoid = require('../');
            test.equal(typeof mongoid.mongoid, 'function');
            var id = mongoid();
            test.equal(typeof id, 'string');
            test.equal(id.length, 24);
            var id2 = mongoid.mongoid();
            test.equal(id2.length, 24);
            test.done();
        },

        testShouldExportFetchShortFunction: function(test) {
            var mongoid = require('../');
            test.equal(typeof mongoid.fetchShort, 'function');
            test.equal(typeof mongoid.fetchShort(), 'string');
            test.equal(mongoid.fetchShort().length, 16);
            test.done();
        },

        testShouldExportMongoIdClass: function(test) {
            var MongoId = require('../');
            test.ok(MongoId.MongoId);
            test.done();
        },

        testShouldBeUsableAsFunction: function(test) {
            var mongoid = require('../');
            test.ok(typeof mongoid === 'function');
            test.ok(typeof mongoid() === 'string');
            test.done();
        },
    },
};

module.exports.mongoid_function = {
    testShouldReturn24CharHexString: function(test) {
        var id = mongoid();
        test.ok(id.match(/^[0-9a-fA-F]{24}$/), "should return a 24-char id string");
        test.done();
    },

    testShouldReturnUniqueIds: function(test) {
        var ids = [];
        for (var i=0; i<20000; i++) ids.push(mongoid());
        testUnique(test, ids);
        test.done();
    },

    testMongoidSpeed: function(test) {
        var t1 = Date.now();
        for (var i=0; i<10000; i++) mongoid();
        var t2 = Date.now();
        //console.log("mongoid(): 10k in " + (t2-t1) + " ms");
        test.ok(t2-t1 < 100, "should generate > 100k ids / sec");
        test.done();
    },

    'it should use the global singleton': function(t) {
        mongoid();
        var called = false;
        var actualFetch = mongoid._singleton.fetch;
        mongoid._singleton.fetch = function(){
            called = true;
            return actualFetch.call(mongoid._singleton)
        };
        mongoid();
        mongoid._singleton.fetch = actualFetch;
        t.equal(called, true);
        t.done();
    },
};

module.exports.MongoId_class = {
    setUp: function(done) {
        // process.pid is write-protected by default, make it writable
        this._processPid = process.pid;
        delete process.pid;
        process.pid = this._processPid;
        done();
    },

    tearDown: function(done) {
        process.pid = this._processPid;
        done();
    },

    testShouldReturnObject: function(test) {
        var obj = new MongoId(0x123);
        test.ok(typeof obj == 'object');
        test.done();
    },

    testShouldHaveHexFormatMethod: function(test) {
        test.ok(typeof (new MongoId()).hexFormat == 'function');
        test.done();
    },

    testSameObjectShouldReturnSameIdString: function(test) {
        var obj = new MongoId(0x1234);
        var id1 = "" + obj;
        var id2 = "" + obj;
        test.equal(id1, id2);
        test.done();
    },

    testShouldUseConstructorMachineId: function(test) {
        var hexFormat = MongoId.prototype.hexFormat;
        var machineid = uniqid();
        var obj = new MongoId(machineid);
        var id = obj.fetch();
        test.equal(id.slice(8, 8+6), hexFormat(machineid, 6), "id " + id + " should contain machineid " + machineid.toString(16));
        test.done();
    },

    'should block until next second if wrapped in same second': function(t) {
        factory = new MongoId(0x111111);
        factory.sequenceId = 0xfffffe;
        factory.sequencePrefix = "fffff";
        var id1 = factory.fetch();
        // note: race condition: this test will fail if the seconds increase before the fetch
        //t.throws(function(){ factory.fetch() }, 'should throw');
        var id2 = factory.fetch();
        t.equal(MongoId.parse(id2).timestamp, MongoId.parse(id1).timestamp + 1);
        t.equal(MongoId.parse(id1).sequence, 0xffffff);
        t.equal(MongoId.parse(id2).sequence, 0);
        t.done();
    },

    'should wrap at max id': function(t) {
        factory = new MongoId(0x222222);
        // fetch an id to initialize internal state variables
        factory.fetch();
        factory.sequenceId = 0xfffffe;
        factory.sequencePrefix = "fffff";
        // manually move back the clock in the object, so it thinks is safe to wrap the sequence
        t.equal(factory.fetch().slice(-6), 'ffffff');
        factory.sequenceStartTimestamp -= 1000;
        t.equal(factory.fetch().slice(-6), '000000');
        t.equal(factory.fetch().slice(-6), '000001');
        t.done();
    },

    'should corretly handle sequenceId lsb carry-out': function(t) {
        factory = new MongoId(1);
        factory.sequenceId = 0x12345e;
        factory.sequencePrefix = '12345';
        var id1 = factory.fetch();
        var id2 = factory.fetch();
        t.equal(factory.sequenceId, 0x123460);
        t.equal(factory.sequencePrefix, '12346');
        t.done();
    },

    'id should include timestamp': function(t) {
        var t1 = Date.now();
        var id = new MongoId().toString();
        var timestamp = MongoId.getTimestamp(id);
        t.ok(t1 - t1 % 1000 <= timestamp && timestamp <= Date.now());
        t.done();
    },

    'id should include pid': function(t) {
        process.pid = 0x1234;
        var id = new MongoId().toString();
        mongoid.pid = null;
        t.ok(id.indexOf("1234", 14) === 14);
        t.done();
    },

    'id should use 16 low bits of pid': function(t) {
        process.pid = 0x12345;
        // specify a system id that will not have a trailing hex "1"
        var id = new MongoId(0xF00000).toString();
        t.ok(id.indexOf("12345", 13) < 0);
        t.ok(id.indexOf("2345", 14) === 14);
        t.done();
    },

    'id should use low 16 bits of pid even if zeroes': function(t) {
        process.pid = 0x120000;
        var id = new MongoId(0xffffff).fetch();
        t.equal(id.slice(8, 14), 'ffffff');
        t.equal(id.slice(14, 18), '0000');
        t.done();
    },

    'id should include a random pid if process.pid is not set': function(t) {
        delete process.pid;
        var id = new MongoId().toString();
        var pid = parseInt(id.slice(14, 18), 16);
        t.ok(pid >= 10000 && pid <= 32767);
        t.done();
    },

    'it should reject a machine id out of range': function(t) {
        t.throws(function(){ new MongoId(-1) }, /out of range/);
        t.throws(function(){ new MongoId(0xffffff + 1) }, /out of range/);
        t.done();
    },

    '_getTimestamp should return second precision timestamps 100ms apart': function(t) {
        var factory = new MongoId();
        var t1 = factory._getTimestamp();
        setTimeout(function(){
            var t2 = factory._getTimestamp();
            t.equal(t1 % 1000, 0);
            t.equal(t2 % 1000, 0);
            t.ok(t2 >= t1);
            t.done();
        }, 100 + 5);
    },

    testFactoryShouldParseId: function(t) {
        var ids = new MongoId();
        var id1 = ids.fetch();
        var id = ids.toString();                        // id of the ids object, the factory id
        var id3 = ids.fetch();
        t.equal(ids.toString(), id);                    // same each time
        t.deepEqual(ids.parse(), ids.parse(id));        // parse own id by default
        t.ok(id1 < id);                                 // own id not first
        t.ok(id < id3);                                 // own id not next
        t.done();
    },

    testShouldParseId: function(test) {
        process.pid = 0x4567;
        var timestamp = Math.floor(Date.now()/1000);
        var obj = new MongoId(0x123456);
        var hash = obj.parse(obj.toString());
        test.equal(hash.machineid, 0x123456);
        test.equal(hash.sequence, 1);
        test.ok(hash.timestamp === timestamp || hash.timestamp === timestamp+1);
        test.equal(hash.pid, process.pid);
        test.done();
    },

    testShouldParseNonString: function(t) {
        // TODO: should throw, not coerce (but is a breaking change)
        var hash = MongoId.parse(0x12345678);
        t.equal(hash.timestamp, parseInt(("" + 0x12345678).slice(0, 8), 16));
        t.done();
    },

    testIdShouldContainParsedParts: function(test) {
        var obj = new MongoId();
        var hexFormat = obj.hexFormat;
        var id = obj.toString();
        var hash = obj.parse(id);
        var id2 = hexFormat(hash.timestamp, 8) +
                  hexFormat(hash.machineid, 6) +
                  hexFormat(hash.pid, 4) +
                  hexFormat(hash.sequence, 6);
        test.equal(id, id2);
        test.done();
    },

    testShouldGetTimestamp: function(test) {
        var obj = new MongoId();
        var id = mongoid();
        var parts = obj.parse(id);
        var timestamp = obj.getTimestamp(id);
        test.equal(timestamp, parts.timestamp * 1000);
        test.done();
    },

    testUniqueObjectsShouldReturnUniqueIds: function(test) {
        var ids = [];
        for (var i=0; i<20000; i++) ids.push((new MongoId(i)).toString());
        testUnique(test, ids);
        test.done();
    },

    testUniqueObjectsShouldReturnUniqueIds: function(test) {
        var ids = [];
        var obj = new MongoId(0x12345);
        for (var i=0; i<20000; i++) ids.push(obj.fetch());
        testUnique(test, ids);
        test.done();
    },

    'should shorten ids': function(t) {
        t.equal(MongoId.shorten("000000000000000000000000"), '----------------');
        t.equal(MongoId.shorten("111111111111111111111111"), '3G3G3G3G3G3G3G3G');
        t.equal(MongoId.shorten("222222222222222222222222"), '7X7X7X7X7X7X7X7X');
        t.equal(MongoId.shorten("444444444444444444444444"), 'G3G3G3G3G3G3G3G3');
        t.equal(MongoId.shorten("888888888888888888888888"), 'X7X7X7X7X7X7X7X7');
        t.equal(MongoId.shorten("aaaaaaaaaaaaAAAAAAAAAAAA"), 'eeeeeeeeeeeeeeee');
        t.equal(MongoId.shorten("cccccccccccccccccccccccc"), 'nBnBnBnBnBnBnBnB');
        t.equal(MongoId.shorten("ffffffffffffFFFFFFFFFFFF"), 'zzzzzzzzzzzzzzzz');
        t.done();
    },

    'shortened ids should be in increasing alpha sort order': function(t) {
        var ids = [], ids2 = [];
        last = '';
        for (var i=0; i<100000; i++) {
            var id = MongoId.shorten(MongoId());
            t.ok(id > last, "out of order");
            last = id;
        }
        t.done();
    },


    'unshorten should undo shorten': function(t) {
        for (var i=0; i<100000; i++) {
            var id = MongoId();
            var short = MongoId.shorten(id);
            t.equal(MongoId.unshorten(short), id);
        }
        t.done();
    },

    'should fetchShort': function(t) {
        var ids = new MongoId();
        var id1 = ids.fetch();
        var id2 = ids.fetchShort();
        var id3 = ids.fetch();
        t.equal(id1.length, 24);
        t.equal(id2.length, 16);
        t.ok(id1 < MongoId.unshorten(id2));
        t.ok(MongoId.unshorten(id2) < id3);
        t.done();
    },

    'short ids should be ascending': function(t) {
        var ids = new MongoId();
        var id = ids.fetchShort();
        for (var i=0; i<1000000; i++) {
            var id2 = ids.fetchShort();
            t.ok(id < id2);
            id = id2;
        }
        t.done();
    },

    'when short ids wrap should wait for unused timestamp to issue next id': function(t) {
        var ids = new MongoId();
        if (process.env.NODE_COVERAGE === 'Y') t.skip();
        // generate many ids to be fetching when the second rolls over, else skip
        var id = ids.fetchShort();
        var wrapped = false;
        for (var i=0; i<20000000; i++) {
            var id2 = ids.fetchShort();
            t.ok(id < id2, id + ' vs ' + id2);
            if (id2.slice(-4) < id.slice(-4)) {
                wrapped = true;
                t.ok(id2.slice(0, 8) > id.slice(0, 8));
            }
            id = id2;
        }
        t.ok(wrapped, "sequence did not wrap");
        t.done();
    },

    'should set charset': function(t) {
        t.throws(function() { MongoId.setShortCharset('abc') }, /64/);
        t.throws(function() { MongoId.setShortCharset('a\u1234cdefghefghefghaxcdefghefghefghaxcdefghefghefghaxcdefghefghefgh') }, /ascii/i);

        var base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        MongoId.setShortCharset(base64chars);
        t.equal(MongoId.shortCharset, base64chars);

        var buf = new Buffer(12);
        for (var i=0; i<100000; i++) {
            var id = MongoId();
            buf.write(id, 'hex');
            t.equal(MongoId.shorten(id), buf.toString('base64'));
            t.equal(MongoId.unshorten(MongoId.shorten(id)), id);
        }

        t.done();
    },
}
