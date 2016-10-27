'use stricf';

var mongoid = require('../mongoid');
var MongoId = require('../mongoid').MongoId;

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
            var mongoid = require('../mongoid');
            test.ok(mongoid.mongoid);
            var id = mongoid();
            test.equal(id.length, 24);
            test.done();
        },

        testShouldExportMongoIdClass: function(test) {
            var MongoId = require('../mongoid');
            test.ok(MongoId.MongoId);
            test.done();
        },

        testShouldBeUsableAsFunction: function(test) {
            var mongoid = require('../mongoid');
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

    'should throw Error if wrapped in same second': function(t) {
        factory = new MongoId(0x111111);
        factory.sequenceId = 0xffffff;
        factory.sequencePrefix = "fffff";
        // note: race condition: this test will fail if the seconds increase before the fetch
        t.throws(function(){ factory.fetch() }, 'should throw');
        t.done();
    },

    'should wrap at max id': function(t) {
        factory = new MongoId(0x222222);
        factory.sequenceId = 0xfffffe;
        factory.sequencePrefix = "fffff";
        factory.sequenceStartTimestamp -= 1000;
        t.equal(factory.fetch().slice(-6), 'ffffff');
        t.equal(factory.fetch().slice(-6), '000000');
        t.equal(factory.fetch().slice(-6), '000001');
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
        var id = new MongoId().toString();
        t.ok(id.indexOf(process.pid.toString(16)) == 14);
        t.done();
    },

    'id should include a random pid if process.pid is not set': function(t) {
        var processPid = process.pid;
        delete process.pid;
        var id = new MongoId().toString();
        var pid = parseInt(id.slice(14, 18), 16);
        t.ok(pid >= 10000 && pid <= 32767);
        process.pid = processPid;
        t.done();
    },

    'it should reject a machine id out of range': function(t) {
        t.throws(function(){ new MongoId(-1) });
        t.throws(function(){ new MongoId(0xffffff + 1) });
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

    testShouldParseId: function(test) {
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
}
