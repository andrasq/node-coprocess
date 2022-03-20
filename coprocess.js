var cp = require('child_process');
var fs = require('fs');

var qibl = require('qibl');
var qbson = require('qbson');

module.exports.WorkerProcess = WorkerProcess;

var setImmediate = eval('global.setImmediate || function(fn, a, b) { process.nextTick(function() { fn(a, b) }) }')

function WorkerProcess( ) {
    var self = this;

    this.nextId = 1;
    this.calls = [];
    this.callbacks = [];
    this.child = null;
    this.runCall = null;

    this.fork = function fork( script ) {
        // if the script is not found node-v0.10 emits a 'channel closed' error, but node-v4 and up
        // throw an un-catchable error from another context instead
        fs.closeSync(fs.openSync(script, 0));
        this.child = cp.fork(script);
        self.child.on('message', function onMessagen(msg) {
            msg && self.invokeCallback(msg.id, msg.err, msg.value) });
        this.child.on('disconnect', function onDisconnect() {
            var err = new Error('disconnected');
            setImmediate(function() { for (var id in self.callbacks) self.invokeCallback(id, err) }) });
        return this;
    }
    this.call = function call( name, arg, callback ) {
        if (!callback) { callback = arg; arg = undefined }
        if (typeof callback !== 'function') throw new Error('callback required');
        var id = self.nextId++;
        self.callbacks[id] = callback;
        this._sendTo(this.child, { id: id, name: name, value: arg });
    }
    this.invokeCallback = function invokeCallback( id, err, ret ) {
        var cb = self.callbacks[id];
        delete self.callbacks[id]; // TODO: self.callbacks[msg.id] = undefined; ... and later qibl.omitUndefined()
        cb && cb(err ? qibl.objectToError(err) : err, ret);
    }
    this.close = function close( ) {
        if (this.child) this.child.connected && this.child.disconnect();
        else process.disconnect && (process.disconnect(), process.removeListener('message', this.runCall));
    }

    this.process = function process_( calls ) {
        if (!calls || !(calls instanceof Object)) throw new Error('calls must be a hash');
        for (var name in calls) this.calls[name] = calls[name];
        process.on('message', this.runCall = this.runCall || function runCall(msg) {
            msg && self.calls[msg.name] && self.calls[msg.name](msg.value, function(err, res) {
                // TODO: return non-object errors as-is
               self._sendTo(process, { id: msg.id, name: msg.name, value: res, error: err && qibl.errorToObject(err) });
            })
        })
    }

    this._sendTo = function _sendTo( target, msg ) {
        // EPIPE is returned to the send() callback, but ERR_IPC_CHANNEL_CLOSED always throws
        // some node versions delay the 'disconnect' event, be sure to call back just once
        try { target.send(msg, null, _onSendError) } catch (err) { _onSendError(err) }
        function _onSendError(err) {
            if (!err) return;
            err = (!target) ? new Error('not forked yet')
                : (!target.send && !target.connected) ? new Error('not connected') : err;
            if (self.callbacks[msg.id]) self.invokeCallback(msg.id, err);
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
    function whenDone(err, ret) {
        ndone += 1;
        if (ndone >= ncalls) {
            console.log("AR: %dk concurrent calls in", ncalls/1000, Date.now() - t1, "ms");
            wp.close();
        }
    }
    var t1 = Date.now();;
    for (var i=0; i<ncalls; i++) {
        wp.call('echo', 123, whenDone);
    }
    // up to 234k/s concurrent calls
}
else {
    console.log("AR: worker");
}

/**/
