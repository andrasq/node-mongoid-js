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
        test.ok(id.match(/[0-9a-fA-F]{24}/), "should return a 24-char id string");
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
