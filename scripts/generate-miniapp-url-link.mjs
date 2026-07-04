#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_APPID = "wx60c1e5197b92ed4a";
const DEFAULT_PATH = "pages/index/index";
const DEFAULT_QUERY = "from=book";
const DEFAULT_ENV_VERSION = "release";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const args = process.argv.slice(2);

function option(name, fallback = "") {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function hasFlag(name) {
  return args.includes(name);
}

function printHelp() {
  console.log(`生成才华报价计算器小程序 URL Link

用法：
  WECHAT_APPSECRET=你的密钥 node scripts/generate-miniapp-url-link.mjs

常用：
  WECHAT_APPSECRET=你的密钥 node scripts/generate-miniapp-url-link.mjs --apply

参数：
  --appid         小程序 AppID，默认 ${DEFAULT_APPID}
  --path          小程序页面路径，默认 ${DEFAULT_PATH}
  --query         小程序 query，默认 ${DEFAULT_QUERY}
  --env           小程序版本：release / trial / develop，默认 ${DEFAULT_ENV_VERSION}
  --expire-days   多少天后失效；不填则生成长期链接
  --apply         把生成的 URL Link 写入 HTML
  --html          需要写入的 HTML 文件，多个文件用英文逗号分隔
`);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function getJson(url) {
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function updateHtmlUrlLink(targetFile, urlLink) {
  const html = await fs.readFile(targetFile, "utf8");
  const next = html.replace(
    /const MINIAPP_URL_LINK = ".*?";/,
    `const MINIAPP_URL_LINK = "${urlLink}";`
  );

  if (next === html) {
    throw new Error(`没有在 ${targetFile} 找到 MINIAPP_URL_LINK 占位符`);
  }

  await fs.writeFile(targetFile, next);
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printHelp();
    return;
  }

  const appid = option("--appid", process.env.WECHAT_APPID || DEFAULT_APPID);
  const secret = option("--secret", process.env.WECHAT_APPSECRET || "");
  const miniappPath = option("--path", DEFAULT_PATH);
  const query = option("--query", DEFAULT_QUERY);
  const envVersion = option("--env", DEFAULT_ENV_VERSION);
  const expireDays = Number(option("--expire-days", "0"));
  const apply = hasFlag("--apply");
  const htmlTargets = option("--html", path.resolve(__dirname, "../index.html"))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(process.cwd(), item));

  if (!secret) {
    throw new Error("缺少 WECHAT_APPSECRET。用法：WECHAT_APPSECRET=你的密钥 node scripts/generate-miniapp-url-link.mjs");
  }

  const tokenUrl = new URL("https://api.weixin.qq.com/cgi-bin/token");
  tokenUrl.searchParams.set("grant_type", "client_credential");
  tokenUrl.searchParams.set("appid", appid);
  tokenUrl.searchParams.set("secret", secret);

  const tokenResult = await getJson(tokenUrl);
  if (tokenResult.errcode) {
    throw new Error(`获取 access_token 失败：${tokenResult.errcode} ${tokenResult.errmsg}`);
  }

  const payload = {
    path: miniappPath,
    query,
    env_version: envVersion,
    is_expire: expireDays > 0
  };

  if (expireDays > 0) {
    payload.expire_type = 1;
    payload.expire_interval = expireDays;
  }

  const linkUrl = new URL("https://api.weixin.qq.com/wxa/generate_urllink");
  linkUrl.searchParams.set("access_token", tokenResult.access_token);

  const linkResult = await postJson(linkUrl, payload);
  if (linkResult.errcode) {
    throw new Error(`生成 URL Link 失败：${linkResult.errcode} ${linkResult.errmsg}`);
  }

  console.log(linkResult.url_link);

  if (apply) {
    for (const target of htmlTargets) {
      await updateHtmlUrlLink(target, linkResult.url_link);
      console.error(`已写入：${target}`);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
