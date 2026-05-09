#!/usr/bin/env node

import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const appDir = dirname(dirname(fileURLToPath(import.meta.url)));

function canLoadSharp() {
  try {
    const sharp = require("sharp");
    return Boolean(sharp?.versions?.vips);
  } catch {
    return false;
  }
}

function getSharpRuntime() {
  try {
    return require("sharp/lib/libvips").runtimePlatformArch();
  } catch {
    return null;
  }
}

function ensureSymlink(linkPath, targetPath, relativeTarget) {
  if (existsSync(linkPath)) {
    if (lstatSync(linkPath).isSymbolicLink()) {
      return;
    }
    return;
  }

  if (!existsSync(targetPath)) {
    return;
  }

  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(relativeTarget, linkPath, "dir");
}

if (!existsSync(join(appDir, "node_modules", "sharp"))) {
  process.exit(0);
}

if (canLoadSharp()) {
  process.exit(0);
}

const runtime = getSharpRuntime();
if (!runtime) {
  process.exit(0);
}

const rootLibvips = join(appDir, "node_modules", "@img", `sharp-libvips-${runtime}`);
const nestedLibvips = join(
  appDir,
  "node_modules",
  "sharp",
  "node_modules",
  "@img",
  `sharp-libvips-${runtime}`,
);

if (lstatSafe(nestedLibvips)?.isSymbolicLink() && !existsSync(nestedLibvips)) {
  rmSync(nestedLibvips);
}

ensureSymlink(nestedLibvips, rootLibvips, `../../../@img/sharp-libvips-${runtime}`);

if (!canLoadSharp()) {
  console.warn(
    `[repair-sharp] sharp still cannot load for ${runtime}; run npm install --include=optional --legacy-peer-deps sharp`,
  );
}

function lstatSafe(path) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}
