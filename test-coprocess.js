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
        this.coproc = new Coprocess().fork(function() {
            var Coprocess = require('./').Coprocess;
            var count = 0;
            var coproc = new Coprocess().listen({
                echo: function(x, cb) { cb(null, x) },
                add: function(a, b, cb) { cb(null, a + b) },
                getCount: function(cb) { cb(null, count) },
                badSend: function(cb) { process.send(); cb() },
                ping: function(x, cb) { coproc.call('pong', x, cb) }, // ping returns the parent pong value
            });
            coproc.listen('count', function(n) { for (var i = 0; i < arguments.length; i++) count += arguments[i] });

        }, done);
    },

    after: function(done) {
        this.coproc.close(done);
    },

    'fork': {
        'can fork and close a function from instance': function(t) {
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

        'can fork a file from instance': function(t) {
            var coproc = new Coprocess().fork('/dev/null', function(err, child) {
                t.ok(child.pid > 0)
                t.done();
            });
        },

        'can fork a file directly from package': function(t) {
            var coproc = coprocess.fork('/dev/null', function(err, child) {
                t.ifError(err);
                t.ok(child.pid > 0);
                t.done();
            })
            t.ok(coproc instanceof Coprocess);
        },

        'errors': {
            'throws if already forked': function(t) {
                var coproc = new Coprocess();
                coproc.child = {};
                t.throws(function() { coproc.fork(function(){}, t.done) }, /already forked/);
                t.done();
            },
            'returns error if unable to load source': function(t) {
                t.skip();
                var coproc = new Coprocess().fork('./nonesuch', function(err) {
                })
            },
            'suppresses child errors': function(t) {
                this.coproc.child.emit('error', new Error('test error'));
                setTimeout(t.done, 2);
            },
        }
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

        'if no child disconnects self from parent and stops listening to messages': function(t) {
            var spy = t.stubOnce(process, 'disconnect');
            var coproc = new Coprocess();
            coproc.listen({ foo: function(cb) { cb() } });
            t.contains(process.listeners('message'), coproc._handleMessage);
            coproc.close();
            t.notContains(process.listeners('message'), coproc._handleMessage);
            t.done();
        },

        'errors': {
            'returns error from kill': function(t) {
                var coproc = new Coprocess();
                coproc.child = { pid: 1, once: function(){}, exited: true }; // no perms to kill
                coproc.close(function(err) {
                    t.ok(err);
                    t.equal(err.code, 'EPERM');
                    t.done();
                })
            }
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

        'pairing is bidirectionally symmetric': function(t) {
            var pingValue = -1;
            var pongValue = 123;
            // ping causes the child to call our pong:
            this.coproc.listen({ pong: function(x, cb) { pingValue = x; cb(null, pongValue) } });
            this.coproc.call('ping', 12, function(err, returnValue) {
                t.ifError(err);
                t.equal(pingValue, 12);
                t.equal(returnValue, pongValue);
                t.done();
            })
        },

        'errors': {
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
                            t.ok(/not connected|disconnected/.test(err.message));
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

            'returns error if no callbck': function(t) {
                var coproc = this.coproc;
                t.throws(function() { coproc.call('echo') }, /callback required/);
                t.throws(function() { coproc.call('echo', 1) }, /callback required/);
                t.throws(function() { coproc.call('echo', 1, 2) }, /callback required/);
                t.throws(function() { coproc.call('echo', 1, 2, 3) }, /callback required/);
                t.done();
            }
        }
    },

    'emit': {
        'can emit events': function(t) {
            this.coproc.emit('count');
            this.coproc.emit('count', 1);
            this.coproc.emit('count', 2, 3);
            this.coproc.call('getCount', function(err, count) {
                t.ifError(err);
                t.equal(count, 6);
                t.done();
            })
        },
    },

    'listen': {
        'adds event listener': function(t) {
            var coproc = new Coprocess();
            var f1 = function(){};
            var f2 = function(){};
            coproc.listen('foo', f1);
            t.deepEqual(coproc.listeners, {foo: f1});
            coproc.listen('bar', f2);
            t.deepEqual(coproc.listeners, {foo: f1, bar: f2});
            t.done();
        },

        'errors': {
            'returns error if no listener function': function(t) {
                var coproc = this.coproc;
                t.throws(function() { coproc.listen('echo') }, /function required/);
                t.throws(function() { coproc.listen('echo', 1, 2) }, /function required/);
                t.done();
            },
        },
    },

    'unlisten': {
        'removes event listener': function(t) {
            var coproc = new Coprocess();
            var f1 = function(){};
            coproc.listen('foo', f1);
            t.deepEqual(coproc.listeners, {foo: f1});
            coproc.unlisten('foo', f1);
            t.deepEqual(coproc.listeners, {});
            t.done();
        },
    },

    'helpers': {
        '_handleMessage': {
            'tolerates bogus messages': function(t) {
                this.coproc._handleMessage();
                this.coproc._handleMessage(0);
                this.coproc._handleMessage(null);
                this.coproc._handleMessage({});
                setTimeout(t.done, 2);
            },
            'invokes gc after gcThreshold calls': function(t) {
                var coproc = this.coproc;
                coproc.callbacks.foobar = undefined;
                t.contains(Object.keys(coproc.callbacks), 'foobar');
                coproc.gcThreshold = 3;
                qibl.runSteps([
                    function(next) { coproc.call('echo', 1, next) },
                    function(next) { coproc.call('echo', 2, next) },
                    function(next) { coproc.call('echo', 3, next) },
                ], function(err) {
                    t.notContains(Object.keys(coproc.callbacks), 'foobar');
                    t.done();
                })
            },
        },

        '_sendTo': {
            'returns send errors': function(t) {
                var coproc = this.coproc;
                qibl.runSteps([
                    function(next) {
                        t.stubOnce(coproc.child, 'send').throws(new Error('mock error'));
                        coproc.call('echo', 1, function(err) { t.ok(/mock error/.test(err.message)); next() });
                    },
                    function(next) {
                        t.stubOnce(coproc.child, 'send').throws(new Error(" no method 'send' of child"));
                        coproc.call('echo', 1, function(err) { t.ok(/not forked yet/.test(err.message)); next() });
                    },
                    function(next) {
                        t.stubOnce(coproc.child, 'send').throws(new Error(" error reading 'send' "));
                        coproc.call('echo', 1, function(err) { t.ok(/not forked yet/.test(err.message)); next() });
                    },
                    function(next) {
                        t.stubOnce(coproc.child, 'send').throws(new Error("Channel closed"));
                        coproc.call('echo', 1, function(err) { t.ok(/not connected/.test(err.message)); next() });
                    },
                    function(next) {
                        t.stubOnce(coproc.child, 'send').throws(new Error("channel closed"));
                        coproc.call('echo', 1, function(err) { t.ok(/not connected/.test(err.message)); next() });
                    },
                ], t.done);
            },
        },

        'gc': {
            'deletes undefined callbacks': function(t) {
                var coproc = new Coprocess();
                coproc.callbacks.foo = undefined
                coproc.callbacks.bar = function(){};
                coproc.callbacks.bat = undefined
                t.deepEqual(Object.keys(coproc.callbacks), ['foo', 'bar', 'bat']);
                coproc.gc();
                t.deepEqual(Object.keys(coproc.callbacks), ['bar']);
                t.done();
            },
        },
    },
}
