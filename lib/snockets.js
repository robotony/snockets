(function() {
  var CoffeeScript, DIRECTIVE, DepGraph, EXPLICIT_PATH, HEADER, HoldingQueue, Snockets, compilers, fs, jsExts, minify, parseDirectives, path, stripExt, timeEq, uglify, _;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; }, __slice = Array.prototype.slice, __indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++) {
      if (this[i] === item) return i;
    }
    return -1;
  };
  DepGraph = require('dep-graph');
  CoffeeScript = require('coffee-script');
  fs = require('fs');
  path = require('path');
  uglify = require('uglify-js');
  _ = require('underscore');
  module.exports = Snockets = (function() {
    function Snockets(options) {
      var _base, _base2, _ref, _ref2;
      this.options = options != null ? options : {};
      if ((_ref = (_base = this.options).src) == null) {
        _base.src = '.';
      }
      if ((_ref2 = (_base2 = this.options).async) == null) {
        _base2.async = true;
      }
      this.cache = {};
      this.concatCache = {};
      this.depGraph = new DepGraph;
    }
    Snockets.prototype.scan = function(filePath, flags, callback) {
      var _ref;
      if (typeof flags === 'function') {
        callback = flags;
        flags = {};
      }
      if (flags == null) {
        flags = {};
      }
      if ((_ref = flags.async) == null) {
        flags.async = this.options.async;
      }
      return this.updateDirectives(filePath, flags, __bind(function(err, graphChanged) {
        if (err) {
          if (callback) {
            return callback(err);
          } else {
            throw err;
          }
        }
        if (typeof callback === "function") {
          callback(null, this.depGraph, graphChanged);
        }
        return this.depGraph;
      }, this));
    };
    Snockets.prototype.getCompiledChain = function(filePath, flags, callback) {
      var _ref;
      if (typeof flags === 'function') {
        callback = flags;
        flags = {};
      }
      if (flags == null) {
        flags = {};
      }
      if ((_ref = flags.async) == null) {
        flags.async = this.options.async;
      }
      return this.updateDirectives(filePath, flags, __bind(function(err, graphChanged) {
        var chain, compiledChain, link, o;
        if (err) {
          if (callback) {
            return callback(err);
          } else {
            throw err;
          }
        }
        try {
          chain = this.depGraph.getChain(filePath);
        } catch (e) {
          if (callback) {
            return callback(e);
          } else {
            throw e;
          }
        }
        compiledChain = (function() {
          var _i, _len, _ref2, _results;
          _ref2 = chain.concat(filePath);
          _results = [];
          for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
            link = _ref2[_i];
            o = {};
            if (this.compileFile(link)) {
              o.filename = stripExt(link) + '.js';
            } else {
              o.filename = link;
            }
            o.js = this.cache[link].js.toString('utf8');
            _results.push(o);
          }
          return _results;
        }).call(this);
        if (typeof callback === "function") {
          callback(null, compiledChain, graphChanged);
        }
        return compiledChain;
      }, this));
    };
    Snockets.prototype.getConcatenation = function(filePath, flags, callback) {
      var concatenationChanged, _ref;
      if (typeof flags === 'function') {
        callback = flags;
        flags = {};
      }
      if (flags == null) {
        flags = {};
      }
      if ((_ref = flags.async) == null) {
        flags.async = this.options.async;
      }
      concatenationChanged = true;
      return this.updateDirectives(filePath, flags, __bind(function(err, graphChanged) {
        var chain, concatenation, link, result, _ref2, _ref3;
        if (err) {
          if (callback) {
            return callback(err);
          } else {
            throw err;
          }
        }
        try {
          if ((_ref2 = this.concatCache[filePath]) != null ? _ref2.data : void 0) {
            concatenation = this.concatCache[filePath].data.toString('utf8');
            if (!flags.minify) {
              concatenationChanged = false;
            }
          } else {
            chain = this.depGraph.getChain(filePath);
            concatenation = ((function() {
              var _i, _len, _ref3, _results;
              _ref3 = chain.concat(filePath);
              _results = [];
              for (_i = 0, _len = _ref3.length; _i < _len; _i++) {
                link = _ref3[_i];
                this.compileFile(link);
                _results.push(this.cache[link].js.toString('utf8'));
              }
              return _results;
            }).call(this)).join('\n');
            this.concatCache[filePath] = {
              data: new Buffer(concatenation)
            };
          }
        } catch (e) {
          if (callback) {
            return callback(e);
          } else {
            throw e;
          }
        }
        if (flags.minify) {
          if ((_ref3 = this.concatCache[filePath]) != null ? _ref3.minifiedData : void 0) {
            result = this.concatCache[filePath].minifiedData.toString('utf8');
            concatenationChanged = false;
          } else {
            result = minify(concatenation);
            this.concatCache[filePath].minifiedData = new Buffer(result);
          }
        } else {
          result = concatenation;
        }
        if (typeof callback === "function") {
          callback(null, result, concatenationChanged);
        }
        return result;
      }, this));
    };
    Snockets.prototype.updateDirectives = function() {
      var callback, depList, excludes, filePath, flags, graphChanged, q, require, requireTree, _i;
      filePath = arguments[0], flags = arguments[1], excludes = 4 <= arguments.length ? __slice.call(arguments, 2, _i = arguments.length - 1) : (_i = 2, []), callback = arguments[_i++];
      if (__indexOf.call(excludes, filePath) >= 0) {
        return callback();
      }
      excludes.push(filePath);
      depList = [];
      graphChanged = false;
      q = new HoldingQueue({
        task: __bind(function(depPath, next) {
          var err, _ref;
          if (_ref = path.extname(depPath), __indexOf.call(jsExts(), _ref) < 0) {
            return next();
          }
          if (depPath === filePath) {
            err = new Error("Script tries to require itself: " + filePath);
            return callback(err);
          }
          if (__indexOf.call(depList, depPath) < 0) {
            depList.push(depPath);
          }
          return this.updateDirectives.apply(this, [depPath, flags].concat(__slice.call(excludes), [function(err, depChanged) {
            if (err) {
              return callback(err);
            }
            graphChanged || (graphChanged = depChanged);
            return next();
          }]));
        }, this),
        onComplete: __bind(function() {
          if (!_.isEqual(depList, this.depGraph.map[filePath])) {
            this.depGraph.map[filePath] = depList;
            graphChanged = true;
          }
          if (graphChanged) {
            this.concatCache[filePath] = null;
          }
          return callback(null, graphChanged);
        }, this)
      });
      require = __bind(function(relPath) {
        var depName, depPath, relName;
        q.waitFor(relName = stripExt(relPath));
        if (relName.match(EXPLICIT_PATH)) {
          depPath = relName + '.js';
          return q.perform(relName, depPath);
        } else {
          depName = this.joinPath(path.dirname(filePath), relName);
          return this.findMatchingFile(depName, flags, function(err, depPath) {
            if (err) {
              return callback(err);
            }
            return q.perform(relName, depPath);
          });
        }
      }, this);
      requireTree = __bind(function(dirName) {
        q.waitFor(dirName);
        return this.readdir(this.absPath(dirName), flags, __bind(function(err, items) {
          var item, itemPath, _j, _len, _results;
          if (err) {
            return callback(err);
          }
          q.unwaitFor(dirName);
          _results = [];
          for (_j = 0, _len = items.length; _j < _len; _j++) {
            item = items[_j];
            itemPath = this.joinPath(dirName, item);
            if (this.absPath(itemPath) === this.absPath(filePath)) {
              continue;
            }
            q.waitFor(itemPath);
            _results.push(__bind(function(itemPath) {
              return this.stat(this.absPath(itemPath), flags, __bind(function(err, stats) {
                if (err) {
                  return callback(err);
                }
                if (stats.isFile()) {
                  return q.perform(itemPath, itemPath);
                } else {
                  requireTree(itemPath);
                  return q.unwaitFor(itemPath);
                }
              }, this));
            }, this)(itemPath));
          }
          return _results;
        }, this));
      }, this);
      return this.readFile(filePath, flags, __bind(function(err, fileChanged) {
        var command, directive, relPath, relPaths, words, _j, _k, _l, _len, _len2, _len3, _ref;
        if (err) {
          return callback(err);
        }
        if (fileChanged) {
          graphChanged = true;
        }
        _ref = parseDirectives(this.cache[filePath].data.toString('utf8'));
        for (_j = 0, _len = _ref.length; _j < _len; _j++) {
          directive = _ref[_j];
          words = directive.replace(/['"]/g, '').split(/\s+/);
          command = words[0], relPaths = 2 <= words.length ? __slice.call(words, 1) : [];
          switch (command) {
            case 'require':
              for (_k = 0, _len2 = relPaths.length; _k < _len2; _k++) {
                relPath = relPaths[_k];
                require(relPath);
              }
              break;
            case 'require_tree':
              for (_l = 0, _len3 = relPaths.length; _l < _len3; _l++) {
                relPath = relPaths[_l];
                requireTree(this.joinPath(path.dirname(filePath), relPath));
              }
          }
        }
        return q.finalize();
      }, this));
    };
    Snockets.prototype.findMatchingFile = function(filename, flags, callback) {
      var tryFiles;
      tryFiles = __bind(function(filePaths) {
        var filePath, _i, _len;
        for (_i = 0, _len = filePaths.length; _i < _len; _i++) {
          filePath = filePaths[_i];
          if (stripExt(this.absPath(filePath)) === this.absPath(filename)) {
            callback(null, filePath);
            return true;
          }
        }
      }, this);
      if (tryFiles(_.keys(this.cache))) {
        return;
      }
      return this.readdir(path.dirname(this.absPath(filename)), flags, __bind(function(err, files) {
        var file;
        if (err) {
          return callback(err);
        }
        if (tryFiles((function() {
          var _i, _len, _results;
          _results = [];
          for (_i = 0, _len = files.length; _i < _len; _i++) {
            file = files[_i];
            _results.push(this.joinPath(path.dirname(filename), file));
          }
          return _results;
        }).call(this))) {
          return;
        }
        return callback(new Error("File not found: '" + filename + "'"));
      }, this));
    };
    Snockets.prototype.readdir = function(dir, flags, callback) {
      var files;
      if (flags.async) {
        return fs.readdir(this.absPath(dir), callback);
      } else {
        try {
          files = fs.readdirSync(this.absPath(dir));
          return callback(null, files);
        } catch (e) {
          return callback(e);
        }
      }
    };
    Snockets.prototype.stat = function(filePath, flags, callback) {
      var stats;
      if (flags.async) {
        return fs.stat(this.absPath(filePath), callback);
      } else {
        try {
          stats = fs.statSync(this.absPath(filePath));
          return callback(null, stats);
        } catch (e) {
          return callback(e);
        }
      }
    };
    Snockets.prototype.readFile = function(filePath, flags, callback) {
      return this.stat(filePath, flags, __bind(function(err, stats) {
        var data, _ref;
        if (err) {
          return callback(err);
        }
        if (timeEq((_ref = this.cache[filePath]) != null ? _ref.mtime : void 0, stats.mtime)) {
          return callback(null, false);
        }
        if (flags.async) {
          return fs.readFile(this.absPath(filePath), __bind(function(err, data) {
            if (err) {
              return callback(err);
            }
            if (typeof this.options.snocketsPostProcess === "function") {
              data = this.options.snocketsPostProcess(data);
            }
            this.cache[filePath] = {
              mtime: stats.mtime,
              data: data
            };
            return callback(null, true);
          }, this));
        } else {
          try {
            data = fs.readFileSync(this.absPath(filePath));
            if (typeof this.options.snocketsPostProcess === "function") {
              data = this.options.snocketsPostProcess(data);
            }
            this.cache[filePath] = {
              mtime: stats.mtime,
              data: data
            };
            return callback(null, true);
          } catch (e) {
            return callback(e);
          }
        }
      }, this));
    };
    Snockets.prototype.compileFile = function(filePath) {
      var ext, js, src;
      if ((ext = path.extname(filePath)) === '.js') {
        this.cache[filePath].js = this.cache[filePath].data;
        return false;
      } else {
        src = this.cache[filePath].data.toString('utf8');
        js = compilers[ext.slice(1)].compileSync(this.absPath(filePath), src);
        this.cache[filePath].js = new Buffer(js);
        return true;
      }
    };
    Snockets.prototype.absPath = function(relPath) {
      if (relPath.match(EXPLICIT_PATH)) {
        return relPath;
      } else if (this.options.src.match(EXPLICIT_PATH)) {
        return this.joinPath(this.options.src, relPath);
      } else {
        return this.joinPath(process.cwd(), this.options.src, relPath);
      }
    };
    Snockets.prototype.joinPath = function() {
      var filePath, slash;
      filePath = path.join.apply(path, arguments);
      if (process.platform === 'win32') {
        slash = '/';
        return filePath.replace(/\\/g, slash);
      } else {
        return filePath;
      }
    };
    return Snockets;
  })();
  module.exports.compilers = compilers = {
    coffee: {
      match: /\.js$/,
      compileSync: function(sourcePath, source) {
        return CoffeeScript.compile(source, {
          filename: sourcePath
        });
      }
    }
  };
  EXPLICIT_PATH = /^\/|:/;
  HEADER = /(?:(\#\#\#.*\#\#\#\n*)|(\/\/.*\n*)|(\#.*\n*))+/;
  DIRECTIVE = /^[\W]*=\s*(\w+.*?)(\*\\\/)?$/gm;
  HoldingQueue = (function() {
    function HoldingQueue(_arg) {
      this.task = _arg.task, this.onComplete = _arg.onComplete;
      this.holdKeys = [];
    }
    HoldingQueue.prototype.waitFor = function(key) {
      return this.holdKeys.push(key);
    };
    HoldingQueue.prototype.unwaitFor = function(key) {
      return this.holdKeys = _.without(this.holdKeys, key);
    };
    HoldingQueue.prototype.perform = function() {
      var args, key;
      key = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      return this.task.apply(this, __slice.call(args).concat([__bind(function() {
        return this.unwaitFor(key);
      }, this)]));
    };
    HoldingQueue.prototype.finalize = function() {
      var h;
      if (this.holdKeys.length === 0) {
        return this.onComplete();
      } else {
        return h = setInterval((__bind(function() {
          if (this.holdKeys.length === 0) {
            this.onComplete();
            return clearInterval(h);
          }
        }, this)), 10);
      }
    };
    return HoldingQueue;
  })();
  parseDirectives = function(code) {
    var header, match, _results;
    code = code.replace(/[\r\t ]+$/gm, '\n');
    if (!(match = HEADER.exec(code))) {
      return [];
    }
    header = match[0];
    _results = [];
    while (match = DIRECTIVE.exec(header)) {
      _results.push(match[1]);
    }
    return _results;
  };
  stripExt = function(filePath) {
    var _ref;
    if (_ref = path.extname(filePath), __indexOf.call(jsExts(), _ref) >= 0) {
      return filePath.slice(0, filePath.lastIndexOf('.'));
    } else {
      return filePath;
    }
  };
  jsExts = function() {
    var ext;
    return ((function() {
      var _results;
      _results = [];
      for (ext in compilers) {
        _results.push("." + ext);
      }
      return _results;
    })()).concat('.js');
  };
  minify = function(js) {
    var ast, jsp, pro;
    jsp = uglify.parser;
    pro = uglify.uglify;
    ast = jsp.parse(js);
    ast = pro.ast_mangle(ast);
    ast = pro.ast_squeeze(ast);
    return pro.gen_code(ast, {
      ascii_only: true
    });
  };
  timeEq = function(date1, date2) {
    return (date1 != null) && (date2 != null) && date1.getTime() === date2.getTime();
  };
}).call(this);
