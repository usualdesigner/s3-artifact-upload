"use strict";
// CJS shim for @actions/glob (ESM-only package) so Jest can require it.
// Implements the same create() / glob() / globGenerator() surface used by resolve.ts.

const fg = require("fast-glob");
const path = require("path");

/**
 * Expand a newline-separated pattern string (with ! exclusions) into file paths.
 * Mirrors the behaviour of @actions/glob: patterns starting with ! are exclusions.
 */
async function expandPatterns(patternStr, options) {
  const lines = patternStr
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const includes = lines.filter((l) => !l.startsWith("!"));
  const excludes = lines
    .filter((l) => l.startsWith("!"))
    .map((l) => l.slice(1));

  const matchDirectories = options && options.matchDirectories != null
    ? options.matchDirectories
    : true;

  const followSymlinks = options && options.followSymbolicLinks != null
    ? options.followSymbolicLinks
    : true;

  const results = await fg.glob(includes, {
    dot: true,
    followSymbolicLinks: followSymlinks,
    onlyFiles: !matchDirectories,
    absolute: true,
    ignore: excludes,
  });

  return results.map((r) => path.normalize(r));
}

/**
 * Create a globber — mirrors @actions/glob.create()
 */
async function create(patterns, options) {
  return {
    async glob() {
      return expandPatterns(patterns, options);
    },
    async *globGenerator() {
      const results = await expandPatterns(patterns, options);
      for (const r of results) yield r;
    },
  };
}

async function hashFiles() {
  throw new Error("hashFiles is not implemented in the Jest shim");
}

module.exports = { create, hashFiles };
