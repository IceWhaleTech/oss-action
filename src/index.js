
const core = require('@actions/core');
const github = require('@actions/github');
const OSS = require('ali-oss');
const fs = require('fs');
const { resolve } = require('path');
const fg = require('fast-glob');

function getErrorMessage(err) {
  if (err && typeof err.message === 'string' && err.message) {
    return err.message;
  }

  return String(err);
}

(async () => {
  try {
    // OSS 实例化
    const opts = {
      accessKeyId: core.getInput('key-id'),
      accessKeySecret: core.getInput('key-secret'),
      bucket: core.getInput('bucket'),
      secure: core.getBooleanInput('secure')
    }

    ;['region', 'endpoint']
      .filter(name => core.getInput(name))
      .forEach(name => {
        Object.assign(opts, {
          [name]: core.getInput(name)
        })
      })

    const oss = new OSS(opts)
    const showProgress = core.getBooleanInput('show-progress')

    const upload = async (dst, file, options = {}) => {
      if (!showProgress) {
        return oss.put(dst, resolve(file), options)
      }

      let lastPercentage = -1
      const reportProgress = percentage => {
        const currentPercentage = Math.floor(percentage * 100)
        if (currentPercentage !== lastPercentage) {
          core.info(`Uploading ${file} to ${dst}: ${currentPercentage}%`)
          lastPercentage = currentPercentage
        }
      }

      const res = await oss.multipartUpload(dst, resolve(file), {
        ...options,
        progress: reportProgress
      })
      reportProgress(1)

      return {
        ...res,
        url: oss.generateObjectUrl(dst)
      }
    }

    // 上传资源
    const assets = core.getInput('assets', { required: true })

    await Promise.all(assets.split('\n').map(async rule => {
      const [src, dst] = rule.split(':')

      const files = fg.sync([src], { dot: false, onlyFiles: true })

      if (files.length && !/\/$/.test(dst)) {
        // 单文件
        const res = await upload(dst, files[0])
        core.setOutput('url', res.url)
      } else if (files.length && /\/$/.test(dst)) {
        // 目录
        const timeout = core.getInput('timeout')
        const res = await Promise.all(
          files.map(async file => {
            const base = src.replace(/\*+$/g, '')
            const filename = file.replace(base, '')
            return upload(`${dst}${filename}`, file, {
              timeout: 1000 * Number(timeout)
            })
          })
        )
        core.setOutput('url', res.map(r => r.url).join(','))
      }
    }))

  } catch (err) {
    core.setFailed(getErrorMessage(err))
  }
})()
