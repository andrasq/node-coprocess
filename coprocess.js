/*
 * coprocess -- inter-process rpc wrapped in oo syntax
 *
 * Copyright 2021-2022 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var cp = require('child_process');
var fs = require('fs');
var path = require('path');

var qibl = require('qibl');

module.exports = {
    Coprocess: Coprocess,
    WorkerProcess: Coprocess,
    fork: function(code, cb) { return new Coprocess().fork(code, cb) },
}

var setImmediate = eval('global.setImmediate || function(fn, a, b) { process.nextTick(function() { fn(a, b) }) }')

function Coprocess( ) {
    this.nextId = 1;
    this.calls = {};            // worker functions indexed by callName
    this.callbacks = {};        // caller call callbacks indexed by callbackId
    this.listeners = {};        // caller listeners functions indexed by event
    this.child = null;          // worker process

    var self = this;
    this.fork = function fork( code, cb ) {
        if (this.child) throw new Error('already forked');
        // TODO: optional fork timeout for when child script does not signal 'ready'
        var script = code;
        if (typeof code === 'function') {
            // TODO: return fork/script error in 'forked' message
            var src = 'process.send("forked"); ;(' + script.toString() + ')();';
            script = qibl.tmpfile({ dir: '.', name: 'node-coprocess-', ext: '.js' });
            fs.writeFileSync(script, src);
            // TODO: remove the source file when no longer needed, not on process exit
        } else {
            // TODO: return require error in 'forked' message
            var src = 'var file = require("path").resolve("' + code.replace(/""\\/g, '\\$1') + '");' +
                ' process.send("forked"); require(file);\n';
            script = qibl.tmpfile({ dir: '.', name: 'node-coprocess-', ext: '.js' });
            fs.writeFileSync(script, src);
        }
        fs.closeSync(fs.openSync(script, 0)); // probe the script to avoid a node >= v4 uncatchable error
        var child = this.child = cp.fork(script, null, { env: process.env }); // node-v0.6 did not inherit process.env yet
        this.child.on('exit', onDisconnect);
        this.child.on('disconnect', onDisconnect);
        this.child.on('message', self._handleMessage);
        function onDisconnect() {
            var err = new Error('disconnected'), callbacks = self.callbacks;
            setImmediate(function() { for (var id in callbacks) self._handleMessage({ id: id, err: err }) }) }
        // if child unable to send it emits an error that must be listened for, else is uncaught exception!
        // this.child.on('error', function(err) { this.emit('error', err) });
        this.child.on('error', function(err) {});
        cb && this.child.once('message', function(msg) { msg === 'forked' && cb(null, child, script) });
        return this;
    }
    this.call = function call( name, arg1, /* ...VARARGS, */ cb ) {
        // TODO: optional call timeout
        var callback = arguments[arguments.length - 1];
        if (typeof callback !== 'function') throw new Error('callback required');
        var id = '' + this.nextId++, argc = arguments.length - 2, argv = (argc > 1) ? new Array(argc) : arg1;
        if (argc > 1) for (var argv = new Array(argc), i = 0; i < argc; i++) argv[i] = arguments[i + 1];
        this.callbacks[id] = callback;
        this._sendTo(this.child, { id: id, name: name, argc: argc, argv: argv });
    }
    this.listen = function listen( event, listener ) {
        if (event && typeof event === 'object' && !listener) {
            var calls = event;
            for (var name in calls) this.calls[name] = calls[name];
            process.removeListener('message', this._handleMessage);
            process.on('message', this._handleMessage);
        } else {
            if (typeof listener !== 'function') throw new Error('listener function required');
            this.listeners[String(event)] = listener;
        }
        return this;
    }
    this.unlisten = function unlisten( event, listener ) {
        this.listeners[event] === listener && delete this.listeners[event];
    }

    this.emit = function emit( event, value /* ...VARARGS */ ) {
        var argc = arguments.length - 1, argv = (argc <= 1) ? value : new Array(argc);
        if (argc > 1) for (var i = 0; i < argc; i++) argv[i] = arguments[i + 1];
        this._sendTo(this.child || process, { name: event, argc: argc, argv: argv });
    }
    this.close = function close( cb ) {
// FIXME: seems to swallow ^C / ^\ signals fm kbd ??  due to fork, or due to tmpfile ?
        if (this.child) { if (this.child.disconnect) (this.child.connected && this.child.disconnect());
            // node-v0.6 cannot disconnect, and can throw ESRCH
            else try { process.kill(this.child.pid, 'SIGTERM') } catch (err) { cb && cb(err) } }
        process.disconnect && (process.disconnect(), process.removeListener('message', self._handleMessage));
        cb && this.child && (this.child.exited ? cb() : this.child.once('exit', function() { cb() }));
    }

    this.callbackCount = 0;
    this.gcThreshold = 100000;
    this._handleMessage = function _handleMessage( msg ) {
        if (!msg) return;
        if (msg.id && msg.name) {       // rpc call to named method
            // var socket = arguments.length > 1 && arguments[1];
            var id = msg.id, func = self.calls[msg.name];
            var runCallback = function(err, res) {
                err === null || err === undefined ? self._sendTo(process, { id: id, result: res })
                    : self._sendTo(process, { id: id, err: qibl.errorToObject(err), result: res }) }
            func ? (msg.argc === 0 ? func(runCallback) : msg.argc === 1 ? func(msg.argv, runCallback)
                    : (msg.argv.push(runCallback), qibl.invoke(func, msg.argv)))
                : runCallback(new Error(msg.name + ': method not found'));
        } else if (msg.name) {          // named event
            var handler = self.listeners[msg.name];
            handler && (msg.argc === 0 ? handler() : msg.argc === 1 ? handler(msg.argv) : qibl.invoke(handler, msg.argv));
        } else if (msg.id) {            // response to call by id
            var cb = self.callbacks[msg.id];
            self.callbacks[msg.id] = undefined;
            if (++self.callbackCount >= self.gcThreshold) { self.callbackCount = 0; self.gc() }
            cb && cb(msg.err && !(msg.err instanceof Error) ? qibl.objectToError(msg.err) : msg.err, msg.result);
        }                               // else silently ignore bad messages without name or id
    }
    this.gc = function gc() {
        self.callbacks = qibl.omitUndefined(self.callbacks);
    }
    this._sendTo = function _sendTo( target, msg ) {
        // EPIPE is returned to the send() callback, but ERR_IPC_CHANNEL_CLOSED always throws
        // some node versions delay the 'disconnect' event, be sure to call back just once
        try { target.send(msg, null, _onSendError) } catch (err) { _onSendError(err) }
        // TODO: emit errors instead of global notifier
        function _onSendError(err) {
            if (err) { err = (/ 'send' of |reading 'send'/.test(err.message)) ? new Error('not forked yet')
                : (/EPIPE|CHANNEL_CLOSED/.test(String(err.code))) ? new Error('not connected')
                : (/[cC]hannel closed/.test(err.message)) ? new Error('not connected') : err;
                // : (!process.send && !process.connected) ? new Error('not connected') : err;
                self._handleMessage({ id: msg.id, err: err, result: msg.result });
            }
        }
    }
}
