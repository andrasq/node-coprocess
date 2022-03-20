var cp = require('child_process');
var fs = require('fs');

var qibl = require('qibl');
//var qbson = require('qbson');

module.exports.WorkerProcess = WorkerProcess;

var setImmediate = eval('global.setImmediate || function(fn, a, b) { process.nextTick(function() { fn(a, b) }) }')

var Coprocess = WorkerProcess;
function WorkerProcess( ) {
    this.nextId = 1;
    this.calls = [];
    this.callbacks = [];
    this.child = null;

    var self = this;
    this.fork = function fork( script ) {
        fs.closeSync(fs.openSync(script, 0)); // probe the script to avoid a node >= v4 uncatchable error
        this.child = cp.fork(script, null, { env: process.env }); // node-v0.6 did not inherit process.env yet
        this.child.on('message', function onMessagen(msg) {
            msg && self._invokeCallback(msg) });
        this.child.on('disconnect', function onDisconnect() {
            var err = new Error('disconnected'), callbacks = self.callbacks;
            setImmediate(function() { for (var id in callbacks) self._invokeCallback({ id: id, err: err }) }) });
        return this;
    }
    this.call = function call( name, arg, callback ) {
        callback = callback || arg;
        if (typeof callback !== 'function') throw new Error('callback required');
        var id = this.nextId++;
        this.callbacks[id] = callback;
        this._sendTo(this.child, { id: id, name: name, value: arg });
    }
    this.process = function process_( calls ) {
        if (!calls || !(calls instanceof Object)) throw new Error('calls must be a hash');
        for (var name in calls) this.calls[name] = calls[name];
        process.on('message', this._handleCall);
    }
    this.close = function close( ) {
        if (this.child) this.child.connected && this.child.disconnect();
        else process.disconnect && (process.disconnect(), process.removeListener('message', this._handleCall));
    }

    this.callbackCount = 0;
    this._invokeCallback = function _invokeCallback( msg ) {
        var id = msg.id, cb = this.callbacks[id];
        this.callbacks[id] = undefined;
        if (++this.callbackCount & 0xFFF === 0) this.callbacks = qibl.omitUndefined(this.callbacks);
        cb && cb(msg.err ? qibl.objectToError(msg.err) : msg.err, msg.value);
    }
    this._handleCall = function _handleCall( msg ) {
        var socket = msg === 'socket' && arguments[1], func = self.calls[msg.name];
        func && func(msg.value, runCallback);
        // func && (msg.argv ? (msg.argv.push(runCallback), qibl.invoke(func, msg.argv)) : func(msg.value, runCallback));
        function runCallback(err, res) {
            self._sendTo(process,
                err ? { id: msg.id, err: qibl.errorToObject(err) } : { id: msg.id, value: res });
            // self._sendTo(process, { id: msg.id, value: res, err: err && qibl.errorToObject(err) });
        }
    }
    this._sendTo = function _sendTo( target, msg ) {
        // EPIPE is returned to the send() callback, but ERR_IPC_CHANNEL_CLOSED always throws
        // some node versions delay the 'disconnect' event, be sure to call back just once
        try { target.send(msg, null, this._onSendError) } catch (err) { this._onSendError(err) }
    }
    this._onSendError = function _onSendError(err) {
        if (err) { err = (/ 'send' of /.test(err.message)) ? new Error('not forked yet')
            : (!process.send && !process.connected) ? new Error('not connected') : err;
            self._invokeCallback({ id: msg.id, err: err });
        }
    }
}


// /** quicktest:

var wp = new WorkerProcess();
if (process.env.NODE_MASTER !== 'true') {
console.log("AR: master");
    process.env.NODE_MASTER = true;
    wp.fork(require.resolve('./wp-worker'));
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
            if (err) console.log(err.message);
            ndone += 1;
            if (ndone >= count) {
                console.log("AR: %d %s calls in", count, type, Date.now() - t1, "ms");
                done();
            }
        }
    }
    //testConcurrent();
    //testSeries();

    qibl.runSteps([
        function(next) {
            t1 = Date.now();
            ndone = 0;
            next();
        },
        function testConcurrent(next) {
            console.log("AR: concurrent:");
            var whenDone = waitForResponses(ncalls, 'concurrent', next);
            qibl.repeatFor(
                ncalls,
                function(cb, i) { wp.call('echo', 123, whenDone); (i & 0xFFF) ? cb(): setImmediate(cb) },
                function(){}
            )
            // up to 270k/s concurrent calls
        },
        function(next) {
            t1 = Date.now();
            ndone = 0;
            next();
        },
        function testSeries(next) {
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
            // up to 89k/s back-to-back calls
        },
    ],
    function(err) {
        console.log("AR: Done.");
        // FIXME: node-v0.6 does not terminate the child process on disconnect
        wp.close();
    })
}
else {
    console.log("AR: worker");
}

/**/
