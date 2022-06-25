Coproq
=========
[![Build Status](https://api.travis-ci.com/andrasq/node-coprocess.svg?branch=master)](https://travis-ci.com/github/andrasq/node-coprocess?branch=master)
[![Coverage Status](https://codecov.io/github/andrasq/node-coprocess/coverage.svg?branch=master)](https://codecov.io/github/andrasq/node-coprocess?branch=master)
[![Coverage Status](https://coveralls.io/repos/github/andrasq/node-coprocess/badge.svg?branch=master)](https://coveralls.io/github/andrasq/node-coprocess?branch=master)


Inter-process RPC wrapped in OO syntax.

A Coprocess is a pair of connected objects, one in the current process and one in a new
worker process.  The local object is the parent, it forks the child and makes calls to it
via message passing RPC.  The connection is symmetric, the child can make calls back to and
get responses from the parent.  Calls are sent and launched in order, but may complete out
of order.  Calls return (invoke their callback) when the response is received.

Tested to work with node v0.6 through v16.

    var coprocess = require('coproq');

    // create the worker process
    var coproc = coprocess.fork(function() {
        // function implementing worker; must load depencies as if in a file
        var Coprocess = require('coproq').Coprocess;
        new Coprocess().listen({
            echo: function(x, cb) { cb(null, x) },
        });
    });

    // ...

    // call the worker, wait for its response
    coproc.call('echo', 1234, function(err, reponse) {
        // => err: undefined, response: 1234
    });


Package Api
----------------

### coprocess.Coprocess

Coprocess implementation class.  A Coprocess instance can function as either the parent or
the worker.  The parent-worker relationship is fully symmetric, parent and worker can both
make calls to the other.

The communcation methods are

- `call` - call the remote, wait for the response
- `emit` - push data to the remote, do not wait
- `listen` - register a call handler or data listener

The process control methods are

- `fork` - create the worker process
- `close` - terminate the worker process

### coprocess.fork( scriptName | functionBody [,cb] )

Convenience function to create a pair of Coprocess objects and also launch the worker.
Same as calling `fork` on a `new Coprocess()` object.

    var coprocess = require('coproq');
    coprocess.fork('./scripts/test.js', function() {
        // worker process has started
    })


Process Api
----------------

### coproc = new coprocess.Coprocess( )

Create a new local coprocess object, not yet paired with a worker.  The `fork` method is
used to start the paired worker process.

    var Coprocess = require('coproq').Coprocess;
    var coproc = new Coprocess().fork('./scripts/test.js');

### coproc.fork( scriptName | functionBody [,cb] )

Creates the worker process and sets it running the named script or the provided function.
The callback `cb` is invoked as soon as the worker process is running nodejs, not after it's
initialized.  The worker process is killed when parent process exits.

Returns the local parent object `coproc` used to talk to the worker.

Script file names are relative to the current working directory, not the source file.

Functions are converted to source and saved to temporary files in the current working
directory `./node-coprocess-XXXXXX.js` and get removed automatically when the parent process
calls its `process.on('exit')` listeners.  Worker functions are a convenience, they share no
context with the caller:  they must load and initialize all their dependencies as if they
were in their own file.

`fork` throws if unable to create the worker.  The optional callback is invoked once the
worker process is running.

    var coprocess = require('coproq');
    var coproc = coprocess.fork('./scripts/test.js');

### coproc.close( [cb(err)] )

Terminate the worker process, either by disconnecting from it or killing it.


RPC Call Api
----------------

RPC calls are fully handshaken, the callback is invoked when the worker signals that the
call completed.

### coproc.call( method [, arg [...]], callback(err, result) )

Invoke the named `method` with the given argument(s), and wait for the results.  Calls can
pass zero, one, or multiple arguments.  The last argument must be the callback.  The
callback will be invoked with the returned result once the call completes.

Can return `'not forked yet'`, `'method not found'` or `'not connected'` errors.

### coproc.listen( methods )

Register handlers for the calls in the `methods` name-value hash.  Each handler function is
provided a callback as its last argument, and must call it to signal completion and return
an error or a result back to the caller.  If completion signaling is not needed, it is
faster to `emit` events.

    coproc.listen({
        ping: function(cb) {
            cb(null);
        },
        echo: function(value, cb) {
            cb(null, value);
        },
    })


Data Transfer Api
----------------

Emitted events are one-way, they are sent to the remote process without any acknowledgement
expected or waited for.  However, events and calls are sent in order, so receipt of a batch
of events can be confirmed with a single handshaken `call` at the end.

### coproc.emit( event [, value [...]] )

Emit a named event and optional value(s) to the registered event listener.  Emit can pass
zero, one, or multiple arguments.  Events are sent back-to-back in order, no response is
returned or expected.  Note that events and calls are sent and dispatched in order.

Events not listened for are silently discarded.  The `'error'` event is reserved, but
currently unused.

    // send a batch of stats, no callback because no response
    coproc.emit('stats', 1, 2, 3);

### coproc.listen( event, handler(value [, ...]) )

Listen for named events emitted by the remote.  The handler function is called with the
received arguments whenever the named `event` is received.  Only one listener is supported
per event.

    coproc.listen('stats', function(...stats) {
        // received another batch of stats, no response expected
        // => stats = [1, 2, 3]
    })


Message Formats
----------------

Call

    { id, name, argc, argv }

Response

    { id, result }

    { id, err, result }

Event

    { name, argc, argv }


Change Log
----------------

- 0.1.3 - fix README to use `coproq` npm package name, fix parent/child rpc to be fully symmetric
- 0.1.2 - first published version
