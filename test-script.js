var Coprocess = require('.').Coprocess;
var count = 0;

var coproc = new Coprocess().listen({
    echo: function(x, cb) { cb(null, x) },
    add: function(a, b, cb) { cb(null, a + b) },
    getCount: function(cb) { cb(null, count) },
    badSend: function(cb) { process.send(); cb() },
});

coproc.listen('count', function(n) { for (var i = 0; i < arguments.length; i++) count += arguments[i] });
