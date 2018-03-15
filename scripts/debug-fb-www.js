/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

// NOTE:
// put the input fb-www file in ${root}/fb-www/input.js
// the compiled file will be saved to ${root}/fb-www/output.js

let prepackSources = require("../lib/prepack-node.js").prepackSources;
let path = require("path");
let { readFile, writeFile, existsSync } = require("fs");
let { promisify } = require("util");
let readFileAsync = promisify(readFile);
let writeFileAsync = promisify(writeFile);
let chalk = require("chalk");

let errorsCaptured = [];

let prepackOptions = {
  errorHandler: diag => {
    errorsCaptured.push(diag);
    if (diag.severity === "Information") {
      console.log(diag.message);
      return "Recover";
    }
    if (diag.severity !== "Warning") {
      return "Fail";
    }
    return "Recover";
  },
  compatibility: "fb-www",
  internalDebug: true,
  serialize: true,
  uniqueSuffix: "",
  maxStackDepth: 100,
  reactEnabled: true,
  reactOutput: "jsx",
  reactVerbose: true,
  inlineExpressions: true,
  omitInvariants: true,
  abstractEffectsInAdditionalFunctions: true,
  simpleClosures: true,
};
let inputPath = path.resolve("fb-www/input.js");
let outputPath = path.resolve("fb-www/output.js");
let componentsListPath = path.resolve("fb-www/components.txt");
let components = new Map();
let startTime = Date.now();
let uniqueEvaluatedComponents = 0;

function compileSource(source) {
  let serialized;
  try {
    serialized = prepackSources([{ filePath: "", fileContents: source, sourceMapContents: "" }], prepackOptions);
  } catch (e) {
    errorsCaptured.forEach(error => {
      console.error(error);
    });
    throw e;
  }
  return {
    // $FlowFixMe: reactStatistics do exist as we're passing reactEnabled in config
    stats: serialized.reactStatistics,
    code: serialized.code,
  };
}

async function readComponentsList() {
  if (existsSync(componentsListPath)) {
    let componentsList = await readFileAsync(componentsListPath, "utf8");
    let componentNames = componentsList.split("\n");

    for (let componentName of componentNames) {
      components.set(componentName, "missing");
    }
  }
}

async function compileFile() {
  let source = await readFileAsync(inputPath, "utf8");
  let { stats, code } = await compileSource(source);
  await writeFileAsync(outputPath, code);
  return stats;
}

function printReactEvaluationGraph(evaluatedRootNode, depth) {
  if (Array.isArray(evaluatedRootNode)) {
    for (let child of evaluatedRootNode) {
      printReactEvaluationGraph(child, depth);
    }
  } else {
    let status = evaluatedRootNode.status.toLowerCase();
    let message = evaluatedRootNode.message !== "" ? `: ${evaluatedRootNode.message}` : "";
    let name = evaluatedRootNode.name;
    let line;
    if (status === "inlined") {
      line = `${chalk.gray(`-`)} ${chalk.green(name)} ${chalk.gray(`(${status + message})`)}`;
    } else if (status === "unsupported_completion" || status === "unknown_type" || status === "bail-out") {
      line = `${chalk.gray(`-`)} ${chalk.red(name)} ${chalk.gray(`(${status + message})`)}`;
    } else {
      line = `${chalk.gray(`-`)} ${chalk.yellow(name)} ${chalk.gray(`(${status + message})`)}`;
    }
    if (components.has(name)) {
      let currentStatus = components.get(name);

      if (currentStatus === "missing") {
        uniqueEvaluatedComponents++;
        currentStatus = [currentStatus];
        components.set(name, currentStatus);
      } else if (Array.isArray(currentStatus)) {
        currentStatus.push(status);
      }
    }
    console.log(line.padStart(line.length + depth));
    printReactEvaluationGraph(evaluatedRootNode.children, depth + 2);
  }
}

readComponentsList()
  .then(compileFile)
  .then(result => {
    console.log(`\n${chalk.inverse(`=== Compilation Complete ===`)}\n`);
    console.log(chalk.bold(`Evaluated Tree:`));
    printReactEvaluationGraph(result.evaluatedRootNodes, 0);

    if (components.size > 0) {
      console.log(`\n${chalk.inverse(`=== Status ===`)}\n`);
      for (let [componentName, status] of components) {
        if (status === "missing") {
          console.log(`${chalk.red(`✖`)} ${componentName}`);
        } else {
          console.log(`${chalk.green(`✔`)} ${componentName}`);
        }
      }
    }

    console.log(`\n${chalk.inverse(`=== Summary ===`)}\n`);
    if (components.size > 0) {
      console.log(`${chalk.gray(`Optimized Components`)}: ${uniqueEvaluatedComponents}/${components.size}`);
    }
    console.log(`${chalk.gray(`Optimized Nodes`)}: ${result.componentsEvaluated}`);
    console.log(`${chalk.gray(`Inlined Nodes`)}: ${result.inlinedComponents}`);
    console.log(`${chalk.gray(`Optimized Trees`)}: ${result.optimizedTrees}`);

    let timeTaken = Math.floor((Date.now() - startTime) / 1000);
    console.log(`${chalk.gray(`Compile time`)}: ${timeTaken}s\n`);
  })
  .catch(e => {
    console.error(e.natickStack || e.stack);
    process.exit(1);
  });