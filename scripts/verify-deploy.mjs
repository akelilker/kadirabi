#!/usr/bin/env node
/**
 * Production artifact + workflow invariants for /kadirabi/ deployment.
 * Fail-closed: exits non-zero if dist or deploy owner is not ready.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const DIST = join(ROOT, 'dist')
const WORKFLOW = join(ROOT, '.github', 'workflows', 'deploy-kadirabi.yml')
const BASE = '/kadirabi/'
const errors = []

function fail(msg) {
  errors.push(msg)
}

function assertExists(rel, label = rel) {
  if (!existsSync(join(ROOT, rel))) fail(`Missing: ${label}`)
}

assertExists('dist', 'dist/')
assertExists('dist/index.html', 'dist/index.html')
assertExists('dist/.htaccess', 'dist/.htaccess')
assertExists('.github/workflows/deploy-kadirabi.yml', 'deploy workflow')

const assetsDir = join(DIST, 'assets')
if (!existsSync(assetsDir) || !statSync(assetsDir).isDirectory()) {
  fail('Missing: dist/assets/')
} else {
  const assets = readdirSync(assetsDir)
  if (assets.length === 0) fail('dist/assets/ is empty')
}

if (existsSync(join(DIST, 'index.html'))) {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8')

  if (!html.includes(`${BASE}assets/`)) {
    fail(`index.html must reference ${BASE}assets/...`)
  }

  const rootAssetHits = html.match(/(?:src|href)=["']\/assets\//g)
  if (rootAssetHits) {
    fail('index.html contains root /assets/ references (expected /kadirabi/assets/)')
  }

  const doubleBase = html.includes(`${BASE}kadirabi/`) || html.includes('/kadirabi/kadirabi/')
  if (doubleBase) fail('Double base path detected (/kadirabi/kadirabi/)')
}

if (existsSync(join(DIST, '.htaccess'))) {
  const ht = readFileSync(join(DIST, '.htaccess'), 'utf8')
  if (!ht.includes('RewriteBase /kadirabi/')) {
    fail('.htaccess must set RewriteBase /kadirabi/')
  }
  if (/RewriteRule\s+.+\s+\/index\.html/.test(ht)) {
    fail('.htaccess must not rewrite to domain-root /index.html')
  }
}

if (existsSync(WORKFLOW)) {
  const wf = readFileSync(WORKFLOW, 'utf8')

  if (!/local-dir:\s*\.\/dist\//.test(wf)) {
    fail('workflow local-dir must be ./dist/')
  }

  if (!/FTP_REMOTE_DIR:\s*\$\{\{\s*secrets\.FTP_REMOTE_DIR\s*\|\|\s*vars\.FTP_REMOTE_DIR\s*\}\}/.test(wf)) {
    fail('workflow must resolve FTP_REMOTE_DIR from secrets.FTP_REMOTE_DIR || vars.FTP_REMOTE_DIR')
  }

  if (!/server-dir:\s*\$\{\{\s*env\.FTP_REMOTE_DIR\s*\}\}/.test(wf)) {
    fail('workflow server-dir must use ${{ env.FTP_REMOTE_DIR }}')
  }

  if (/\/public_html\/kadirabi\//.test(wf)) {
    fail('workflow must not hardcode /public_html/kadirabi/')
  }

  if (/server-dir:\s*['"]?\/?public_html\//.test(wf)) {
    fail('workflow must not hardcode a public_html server-dir')
  }

  if (!/dangerous-clean-slate:\s*false/.test(wf)) {
    fail('workflow must set dangerous-clean-slate: false')
  }

  if (!/if:\s*github\.event_name\s*==\s*'workflow_dispatch'/.test(wf)) {
    fail('FTP production deploy job must require workflow_dispatch (manual gate)')
  }

  // Fail closed: FTP action must live under a job gated by workflow_dispatch,
  // not under an always-on push job.
  const deployJobMatch = wf.match(
    /deploy:\s*\n(?:[ \t]+.+\n)*?[ \t]+if:\s*github\.event_name\s*==\s*'workflow_dispatch'[\s\S]*?FTP-Deploy-Action/,
  )
  if (!deployJobMatch) {
    fail('FTP-Deploy-Action must run only in the workflow_dispatch-gated deploy job')
  }

  // Build/test must precede deploy via needs: validate
  if (!/needs:\s*validate/.test(wf)) {
    fail('deploy job must need validate so build/test failure cannot open FTP upload')
  }
}

if (errors.length) {
  console.error('verify:deploy FAILED')
  for (const e of errors) console.error(` - ${e}`)
  process.exit(1)
}

console.log('verify:deploy PASS')
console.log(` PRODUCTION_BASE_PATH = ${BASE}`)
console.log(' BUILD_OUTPUT = dist/')
console.log(' FTP_REMOTE_DIR = RUNTIME_CONFIGURED (secret|variable)')
console.log(' DEPLOY_TRIGGER = workflow_dispatch')
console.log(' APACHE_FALLBACK = READY')
