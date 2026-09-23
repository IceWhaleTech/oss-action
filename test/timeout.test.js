const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');

const source = readFileSync(resolve(__dirname, '../src/index.js'), 'utf8');

async function runUpload({ directory, progress, timeout }) {
  const calls = [];
  const errors = [];
  const outputs = [];
  const assets = directory ? 'src/*:target/' : 'src/a:target';
  const files = directory ? ['src/a', 'src/b'] : ['src/a'];

  class OSS {
    generateObjectUrl(dst) {
      return dst;
    }

    put(dst, _file, options) {
      calls.push({ method: 'put', dst, options });
      return Promise.resolve({ url: dst });
    }

    multipartUpload(dst, _file, options) {
      calls.push({ method: 'multipartUpload', dst, options });
      return Promise.resolve({ url: dst });
    }
  }

  const core = {
    getInput: name => ({ assets, timeout })[name] || '',
    getBooleanInput: name => name === 'show-progress' && progress,
    info: () => {},
    setOutput: (name, value) => outputs.push([name, value]),
    setFailed: error => errors.push(error)
  };
  const dependencies = {
    '@actions/core': core,
    '@actions/github': {},
    'ali-oss': OSS,
    'fast-glob': { sync: () => files }
  };

  await runInNewContext(source, {
    require: name => dependencies[name] || require(name)
  });

  assert.deepEqual(errors, []);
  assert.equal(outputs.length, 1);
  return calls;
}

for (const directory of [false, true]) {
  for (const progress of [false, true]) {
    for (const [input, expected] of [['', 600000], ['15', 15000]]) {
      test(`timeout ${input || 'default'}s for ${directory ? 'directory' : 'file'} ${progress ? 'multipartUpload' : 'put'}`, async () => {
        const calls = await runUpload({ directory, progress, timeout: input });
        assert.equal(calls.length, directory ? 2 : 1);
        for (const call of calls) {
          assert.equal(call.method, progress ? 'multipartUpload' : 'put');
          assert.equal(call.options.timeout, expected);
        }
      });
    }
  }
}
