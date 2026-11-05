// 阿里云 OSS 客户端配置（凭证从环境变量读取，不写入代码）
const OSS = require('ali-oss')
require('dotenv').config()

const client = new OSS({
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET
})

// 公开访问基地址
const BASE_URL =
  process.env.OSS_BASE_URL ||
  `https://${process.env.OSS_BUCKET}.${process.env.OSS_REGION}.aliyuncs.com`

module.exports = { client, BASE_URL }
