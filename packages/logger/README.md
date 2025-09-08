# @rtcio/logger

## Description

This is a thin wrapper around the [debug](https://www.npmjs.com/package/debug) library.
You may install if you wish, but it's mostly for
internal use with the @rtcio ecosystem

## Installation

```bash
npm i @rtcio/logger
```

## Usage

```ts
import Logger from "@rtcio/logger";

const logger = new Logger(
  "@npmnamespace:npmpackage",
  "SomeClass",
  "instanceIdOfClass",
);

logger.log("Something happened here");
logger.error("Oh no, what happened?");
logger.warn("I'm not sure, we should figure it out");
logger.verbose("Y'all talk too much.");
```
