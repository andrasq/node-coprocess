// 'use strict';

var cp = require('child_process');
var fs = require('fs');

var qibl = require('qibl');
//var qbson = require('qbson');

module.exports.Coprocess = Coprocess;
module.exports.WorkerProcess = Coprocess;

var setImmediate = eval('global.setImmediate || function(fn, a, b) { process.nextTick(function() { fn(a, b) }) }')

function Coprocess( ) {
    this.nextId = 1;
    this.calls = {};            // worker functions indexed by callName
    this.callbacks = {};        // caller call callbacks indexed by callbackId
    this.listeners = {};        // caller listeners functions indexed by event
    this.child = null;          // worker process

    var self = this;
    this.fork = function fork( code ) {
// TODO: optional fork timeout
        var script = code;
        if (typeof code === 'function') {
            var src = ';(' + script.toString() + ')();';
            script = qibl.tmpfile({ dir: '.', name: 'node-coprocess-', ext: '.js' });
            fs.writeFileSync(script, src);
            // TODO: remove the source file when no longer needed
        }
        fs.closeSync(fs.openSync(script, 0)); // probe the script to avoid a node >= v4 uncatchable error
        this.child = cp.fork(script, null, { env: process.env }); // node-v0.6 did not inherit process.env yet
        this.child.on('message', self._handleMessage);
        function onDisconnect() {
            var err = new Error('disconnected'), callbacks = self.callbacks;
            setImmediate(function() { for (var id in callbacks) self._handleMessage({ id: id, err: err }) }) }
        this.child.on('disconnect', onDisconnect);
        this.child.on('exit', onDisconnect);
// FIXME: if child unable to send it emits an error that must be listened for, else is uncaught exception!
        // this.child.on('error', function(err) { this.emit('error', err) });
        this.child.on('error', function(err) {});
        return this;
    }
    this.call = function call( name, arg, /* ...VARARGS, */ cb ) {
// TODO: optional call timeout
        var callback = arguments[arguments.length - 1];
        if (typeof callback !== 'function') throw new Error('callback required');
        var id = '' + this.nextId++;
        this.callbacks[id] = callback;
        if (arguments.length > 3) {
            var argv = new Array();
            for (var i = 1; i < arguments.length - 1; i++) argv.push(arguments[i]);
            this._sendTo(this.child, { id: id, name: name, argv: argv, arg: 0 });
        } else this._sendTo(this.child, { id: id, name: name, argv: 0, arg: arg }); // arg: Function sent as undefined
    }
    this.listen = function listen( event, listener ) {
        if (event && typeof event === 'object' && !listener) {
            var calls = event;
            for (var name in calls) this.calls[name] = calls[name];
            process.removeListener('message', this._handleMessage);
            process.on('message', this._handleMessage);
        } else {
            if (typeof listener !== 'function') throw new Error('function required');
            this.listeners[String(event)] = listener;
        }
    }
    this.unlisten = function unlisten( event, listener ) {
        this.listeners[event] === listener && delete this.listeners[event];
    }

    this.emit = function emit( event, value ) {
        this._sendTo(this.child || process, { name: event, result: value });
    }
    this.close = function close( ) {
        if (this.child) this.child.disconnect ? (this.child.connected && this.child.disconnect())
            : process.kill(this.child.pid, 'SIGTERM'); // node-v0.6 cannot disconnect
        process.disconnect && (process.disconnect(), process.removeListener('message', self._handleMessage));
    }

    this.callbackCount = 0;
    this._handleMessage = function _handleMessage( msg ) {
        if (!msg) return;
        if (!msg.id) {
            var cb = self.listeners[msg.name];
            cb && cb(msg.result);
        } else if (self.calls[msg.name]) {
            self._handleCall(msg);
        } else {
            if (self.calls[msg.name]) return 
            var cb = self.callbacks[msg.id];
            self.callbacks[msg.id] = undefined;
            if (++self.callbackCount >= 100000) self.gc();
            cb && cb(msg.err && !(msg.err instanceof Error) ? qibl.objectToError(msg.err) : msg.err, msg.result);
        }
    }
    this.gc = function gc() {
        self.callbacks = qibl.omitUndefined(self.callbacks);
        self.callbackCount = 0;
    }
    this._handleCall = function _handleCall( msg ) {
        var socket = arguments.length > 1 && arguments[1], func = self.calls[msg.name];
        func && (msg.argv ? (msg.argv.push(runCallback), qibl.invoke(func, msg.argv)) : func(msg.arg, runCallback));
        function runCallback(err, res) {
            err === null || err === undefined ? self._sendTo(process, { id: msg.id, result: res })
                : self._sendTo(process, { id: msg.id, err: qibl.errorToObject(err), result: res });
        }
    }
    this._sendTo = function _sendTo( target, msg ) {
        // EPIPE is returned to the send() callback, but ERR_IPC_CHANNEL_CLOSED always throws
        // some node versions delay the 'disconnect' event, be sure to call back just once
        try { target.send(msg, null, self._onSendError) } catch (err) { self._onSendError(err) }
// TODO: emit errors instead of global notifier
        function _onSendError(err) {
            if (err) { err = (/ 'send' of /.test(err.message)) ? new Error('not forked yet')
                : (!process.send && !process.connected) ? new Error('not connected') : err;
                self._handleMessage({ id: msg.id, err: err, result: msg.result });
            }
        }
    }
}


// /** quicktest:

var wp = new Coprocess();
if (process.env.NODE_MASTER !== 'true') {
console.log("AR: master");
    process.env.NODE_MASTER = true;
    wp.fork(function() {
        var Coprocess = require('./wp').Coprocess;
        var wp = new Coprocess();
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
    function whenDone(err, ret) {
        ndone += 1;
        if (ndone >= ncalls) {
            console.log("AR: %dk calls in", ncalls/1000, Date.now() - t1, "ms");
            whenFinished();
        }
    }
    function waitForResponses(count, type, done) {
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
                    function(cb, i) { wp.call('echo', 123, whenDone); (i & 0xFFF) ? cb(): setImmediate(cb) },
                    function(){}
                )
                // up to 270k/s concurrent calls
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
