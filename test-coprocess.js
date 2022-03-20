'use strict';

var coprocess = require('./');
var Coprocess = coprocess.Coprocess;
var WorkerProcess = coprocess.WorkerProcess;

module.exports = {
    'dummy test': function(t) {
        t.ok(true);
        t.done();
    },
}
