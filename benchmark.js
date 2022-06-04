/*
 * coprocess -- inter-process rpc wrapped in oo syntax
 *
 * Copyright 2021-2022 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var Coprocess = require('./').Coprocess;
var qibl = require('qibl');

var setImmediate = global.setImmediate || function(fn, a, b) { process.nextTick(fn, a, b) };

// /** quicktest:

var wp = new Coprocess();
if (process.env.NODE_MASTER !== 'true') {
console.log("AR: master");
    process.env.NODE_MASTER = true;
    wp.fork(function() {
        var WorkerProcess = require('./').WorkerProcess;
        var wp = new WorkerProcess();
        wp.listen({
            echo: function(x, cb) { cb = arguments[arguments.length - 1]; cb(null, x) },
            emit100k: function(arg, cb) {
                setTimeout(function() {
                    for (var i=0; i<arg.count; i++) wp.emit(arg.event, arg.value);
                    cb();
                }, 2);
            }
        });
    });
    var ncalls = 100000, ndone = 0;
    var t1 = Date.now();

    var whenFinished = null;
    var whenDone = function(err, ret) {
        ndone += 1;
        if (ndone >= ncalls) {
            console.log("AR: %dk calls in", ncalls/1000, Date.now() - t1, "ms");
            whenFinished();
        }
    }
    var waitForResponses = function (count, type, done) {
        var ndone = 0;
        return function(err, ret) {
            if (err) console.log("error response:", err.message);
            ndone += 1;
            if (ndone >= count) {
                console.log("AR: %d %s calls in", count, type, Date.now() - t1, "ms");
                done();
            }
        }
    }

    qibl.runSteps([
        function testListen(next) {
            qibl.repeatFor(5, function(next) {
                t1 = Date.now();
                ndone = 0;
                wp.listen('test100k', function(value) {
                    ndone += 1;
                    if (ndone === ncalls) {
                        console.log("AR: %dk received events in", ndone/1000, Date.now() - t1, "ms");
                        next();
                    }
                })
                wp.call('emit100k', { event: 'test100k', value: 1, count: ncalls }, function(){});
                // up to 877k/s messages received
            }, next);
        },
        function(next) { setTimeout(next, 2) },
        function testEmit(next) {
            qibl.repeatFor(5, function(next) {
                t1 = Date.now();
                for (var i = 0; i < ncalls; i++) {
                    wp.emit('someEvent', 'someValue');
                }
                console.log("AR: %dk emitted events in", ncalls/1000, Date.now() - t1, "ms");
                next();
                // up to 1030k/s messages sent
            }, next);
        },
        function(next) { setTimeout(next, 2) },
        function testConcurrent(next) {
            qibl.repeatFor(5, function(next) {
                t1 = Date.now();
                ndone = 0;
                console.log("AR: concurrent:");
                var whenDone = waitForResponses(ncalls, 'concurrent', next);
                qibl.repeatFor(
                    ncalls,
                    function(cb, i) { wp.call('echo', 123, whenDone); (i & 0xFF) ? cb(): setImmediate(cb) },
                    function(){}
                )
                // up to 270k/s concurrent calls
                // (...more recently 220k/s vs 245k/s with 3 args ??)
            }, next);
        },
        function(next) { setTimeout(next, 2) },
        function testConcurrent3(next) {
            qibl.repeatFor(5, function(next) {
                t1 = Date.now();
                ndone = 0;
                console.log("AR: concurrent 3 args:");
                var whenDone = waitForResponses(ncalls, 'concurrent3', next);
                qibl.repeatFor(
                    ncalls,
                    function(cb, i) { wp.call('echo', 1, 2, 3, whenDone); (i & 0xFFF) ? cb(): setImmediate(cb) },
                    function(){}
                )
                // up to 266k/s concurrent calls with 3 args (138k/s with 2)
            }, next);
        },
// /**
        function(next) { setTimeout(next, 2) },
        function testSeries(next) {
            qibl.repeatFor(3, function(next) {
                t1 = Date.now();
                ndone = 0;
                whenFinished = next;
                console.log("AR: series:");
                qibl.repeatFor(
                    ncalls,
                    function(cb, i) { wp.call('echo', 123, (i & 0xFFF) ? cb : function(){ setImmediate(cb) }) },
                    function(){
                        console.log("AR: %dk series calls in", ncalls/1000, Date.now() - t1, "ms");
                        next();
                    }
                )
                // up to 80k/s back-to-back calls
            }, next);
        },
/**/
    ],
    function(err) {
        console.log("AR: Done.");
        wp.close();
    })
}
else {
    console.log("AR: worker");
}

/**/
