#!/usr/bin/env node

var jest = require('jest-cli');
console.log(jest);
jest.run(`--config=${require.resolve('./jest.config.ts')} --runInBand--`)

console.log(1)
