/*
 * mini-amd.js — minimal AMD loader for the single-file bundle emitted by
 * `tsc --module amd --outFile`. Part of vibe-loops (not a third-party library).
 *
 * tsc emits `define("<id>", [deps...], factory)` with ids already resolved to
 * paths relative to rootDir, so no relative-id normalization is required.
 * Load order matters: vendor UMD scripts (react, sql.js, lamejs) must be
 * loaded BEFORE this file, because they sniff for a global `define.amd`.
 */
(function () {
  'use strict';
  var defs = {};
  var cache = {};

  function req(id) {
    if (Object.prototype.hasOwnProperty.call(cache, id)) return cache[id].exports;
    var d = defs[id];
    if (!d) throw new Error('mini-amd: module not found: ' + id);
    var mod = { exports: {} };
    cache[id] = mod;
    var args = d.deps.map(function (dep) {
      if (dep === 'require') return req;
      if (dep === 'exports') return mod.exports;
      return req(dep);
    });
    var ret = d.fn.apply(null, args);
    if (ret !== undefined) mod.exports = ret;
    return mod.exports;
  }

  window.define = function (id, deps, fn) {
    defs[id] = { deps: deps, fn: fn };
  };
  window.define.amd = {};
  window.VibeLoopsLoader = { require: req };
})();
