/*
 * Copyright 2022 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var qibl = require('qibl');
var coprocess = require('./');
var Coprocess = coprocess.Coprocess;
var WorkerProcess = coprocess.WorkerProcess;

module.exports = {
    before: function(done) {
        this.coproc = new Coprocess().fork('./test-script.js').fork('./test-script.js', done);
    },

    after: function(done) {
        this.coproc.close(done);
    },


    'fork': {
        'can fork and close a function': function(t) {
            var coproc = new Coprocess().fork(function() {}, function(child) {
                coproc.close(function() {
                    try { process.kill(coproc.child.pid, 0) } catch (err) {
                        t.equal(err.code, 'ESRCH');
                        t.done();
                    }
                })
            })
            t.ok(coproc.child.pid > 0);
        },

        'can fork a file': function(t) {
            var coproc = new Coprocess().fork('./test-script.js', function(err, child) {
                t.ok(child.pid > 0)
                t.done();
            });
        },

        'can fork directly': function(t) {
            var coproc = coprocess.fork('./test-script.js', function(err, child) {
                t.ifError(err);
                t.ok(child.pid > 0);
                t.done();
            })
        },

        // fork errors
        // require errors
    },

    'close': {
        'parent is notified when worker exits': function(t) {
            // NOTE: delay the exit so node-v0.8 'exit' event is received by parent.
            // node-v0.9 and up do not require the timeout.
            var coproc = coprocess.fork(function() { setTimeout(process.exit, 1) });
            coproc.call('fails', function(err) {
                t.ok(err);
                t.equal(err.message, 'disconnected');
                coproc.close();
                t.done();
            })
        },

        'will kill if unable to disconnect': function(t) {
            var coproc = coprocess.fork(function() {});
            var disconnect = coproc.child.disconnect;
            // node internally will want to run child.disconnect, so save/restore the method
            coproc.child.disconnect = undefined;
            var spy = t.spyOnce(process, 'kill');
            coproc.close(function() {
                t.ok(spy.called);
                t.deepEqual(spy.args[0], [coproc.child.pid, 'SIGTERM']);
                t.done();
            })
            coproc.child.disconnect = disconnect;
        },
    },

    'call': {
        'can call a worker method': function(t) {
            this.coproc.call('echo', 123, function(err, x) {
                t.ifError(err);
                t.equal(x, 123);
                t.done();
            })
        },

        'can call with multiple arguments': function(t) {
            this.coproc.call('add', 1, 2, function(err, c) {
                t.ifError(err);
                t.equal(c, 3);
                t.done();
            })
        },

        'returns error if method not found': function(t) {
            this.coproc.call('nonesuch', function(err) {
                t.ok(err);
                t.equal(err.message, 'nonesuch: method not found');
                t.done();
            })
        },

        'returns error if not forked yet': function(t) {
            var coproc = new Coprocess();
            coproc.call('echo', 1, function(err) {
                t.ok(err);
                t.equal(err.message, 'not forked yet');
                t.done();
            })
        },

        'returns error if disconnected': function(t) {
            var coproc = coprocess.fork(function() {}, function() {
                coproc.close(function() {
                    coproc.call('echo', 1, function(err) {
                        t.ok(err);
                        t.equal(err.message, 'not connected');
                        t.done();
                    })
                })
            })
        },

        'returns send errors': function(t) {
            var coproc = coprocess.fork(function() {}, function() {
                var spy = t.stub(coproc.child, 'send').yields(new Error('mock error'));
                coproc.call('echo', 1, function(err) {
                    spy.restore();
                    t.equal(err.message, 'mock error');
                    coproc.close(t.done);
                })
            })
        },

        // requires last arg to be a callback
    },

    'emit': {
        'can emit events': function(t) {
            this.coproc.emit('count', 1);
            this.coproc.emit('count', 2, 3);
            this.coproc.call('getCount', function(err, count) {
                t.ifError(err);
                t.equal(count, 6);
                t.done();
            })
        },
    },
}
