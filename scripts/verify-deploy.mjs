#!/usr/bin/env node
/**
 * Deploy architecture + artifact invariants for /kadirabi/.
 * Fail-closed: exits non-zero if owners or dist are not production-ready.
 *
 * Canonical auto deploy: GitHub Actions → FTP sync of dist/ only
 * Optional fallback: cPanel Git Version Control + .cpanel.yml
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const DIST = join(ROOT, 'dist')
const CPANEL = join(ROOT, '.cpanel.yml')
const WORKFLOW = join(ROOT, '.github', 'workflows', 'deploy-kadirabi.yml')
const VITE_CONFIG = join(ROOT, 'vite.config.ts')
const BASE = '/kadirabi/'
const DEPLOYPATH = '/home/karmotor/public_html/kadirabi'
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
assertExists('.cpanel.yml', '.cpanel.yml')
assertExists('.github/workflows/deploy-kadirabi.yml', 'CI workflow')
assertExists('vite.config.ts', 'vite.config.ts')

const assetsDir = join(DIST, 'assets')
if (!existsSync(assetsDir) || !statSync(assetsDir).isDirectory()) {
  fail('Missing: dist/assets/')
} else if (readdirSync(assetsDir).length === 0) {
  fail('dist/assets/ is empty')
}

if (existsSync(join(DIST, 'index.html'))) {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8')

  if (!html.includes(`${BASE}assets/`)) {
    fail(`index.html must reference ${BASE}assets/...`)
  }

  if (html.match(/(?:src|href)=["']\/assets\//g)) {
    fail('index.html contains root /assets/ references (expected /kadirabi/assets/)')
  }

  if (html.includes(`${BASE}kadirabi/`) || html.includes('/kadirabi/kadirabi/')) {
    fail('Double base path detected (/kadirabi/kadirabi/)')
  }
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

if (existsSync(VITE_CONFIG)) {
  const vite = readFileSync(VITE_CONFIG, 'utf8')
  const hasLiteralBase =
    vite.includes("base: '/kadirabi/'") || vite.includes('base: "/kadirabi/"')
  const hasConstBase =
    /PRODUCTION_BASE\s*=\s*['"]\/kadirabi\/['"]/.test(vite) && /base:\s*PRODUCTION_BASE/.test(vite)
  if (!hasLiteralBase && !hasConstBase) {
    fail("vite.config.ts must set base to '/kadirabi/'")
  }
}

if (existsSync(CPANEL)) {
  const cpanel = readFileSync(CPANEL, 'utf8')

  if (!cpanel.includes(`DEPLOYPATH=${DEPLOYPATH}`)) {
    fail(`.cpanel.yml must set DEPLOYPATH=${DEPLOYPATH}`)
  }

  if (!cpanel.includes(`"$DEPLOYPATH" = "${DEPLOYPATH}"`)) {
    fail(`.cpanel.yml must assert exact DEPLOYPATH ${DEPLOYPATH}`)
  }

  if (!/\/bin\/cp\s+-a\s+dist\/\.\s+"\$DEPLOYPATH\/"/.test(cpanel)) {
    fail('.cpanel.yml must copy ONLY dist/. into $DEPLOYPATH/')
  }

  if (/\/bin\/cp\s+-a\s+\.\s+"\$DEPLOYPATH/.test(cpanel) || /cp\s+-a\s+\.\s+/.test(cpanel)) {
    fail('.cpanel.yml must not copy repository root to DEPLOYPATH')
  }

  if (!cpanel.includes('command -v node') || !cpanel.includes('command -v npm')) {
    fail('.cpanel.yml must require node and npm before production mutation')
  }

  if (!cpanel.includes('npm ci') || !cpanel.includes('npm test') || !cpanel.includes('npm run build')) {
    fail('.cpanel.yml must run npm ci / test / build before copy')
  }

  if (!cpanel.includes('npm run verify:deploy')) {
    fail('.cpanel.yml must run verify:deploy before copy')
  }

  if (/rm\s+-rf|rsync\s+.*--delete|find\s+.*-delete/.test(cpanel)) {
    fail('.cpanel.yml must not use destructive delete/sync commands')
  }

  if (/public_html(?!\/kadirabi)/.test(cpanel.replaceAll(DEPLOYPATH, ''))) {
    const stripped = cpanel.split(DEPLOYPATH).join('')
    if (/\/home\/karmotor\/public_html(?!\/kadirabi)/.test(stripped) || /public_html\s*$/m.test(stripped)) {
      fail('.cpanel.yml must not target public_html root or non-kadirabi paths')
    }
  }
}

if (existsSync(WORKFLOW)) {
  const wf = readFileSync(WORKFLOW, 'utf8')

  if (!/SamKirkland\/FTP-Deploy-Action@/.test(wf)) {
    fail('GitHub Actions must use SamKirkland/FTP-Deploy-Action for auto deploy')
  }

  if (!wf.includes('local-dir: ./dist/')) {
    fail('FTP deploy must upload ONLY ./dist/')
  }

  if (!/dangerous-clean-slate:\s*false/.test(wf)) {
    fail('FTP deploy must keep dangerous-clean-slate: false')
  }

  if (/dangerous-clean-slate:\s*true/.test(wf)) {
    fail('FTP deploy must not enable dangerous-clean-slate')
  }

  if (!wf.includes('FTP_SERVER') || !wf.includes('FTP_USERNAME') || !wf.includes('FTP_PASSWORD')) {
    fail('FTP deploy must reference FTP_SERVER / FTP_USERNAME / FTP_PASSWORD secrets')
  }

  if (!wf.includes('FTP_REMOTE_DIR')) {
    fail('FTP deploy must require FTP_REMOTE_DIR')
  }

  if (!/npm (ci|test)/.test(wf) || !wf.includes('npm run typecheck') || !wf.includes('npm run build')) {
    fail('CI workflow must run npm ci, test, typecheck, build')
  }

  if (!wf.includes('npm run verify:deploy')) {
    fail('CI workflow must run verify:deploy')
  }

  // Hard filesystem paths belong in .cpanel.yml, not Actions FTP config
  if (/\/home\/karmotor\/public_html/.test(wf)) {
    fail('CI workflow must not hardcode /home/karmotor/public_html paths')
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
console.log(` CPANEL_DEPLOYPATH = ${DEPLOYPATH}`)
console.log(' DEPLOY_OWNER = GITHUB_ACTIONS_FTP')
console.log(' CPANEL_GIT_ROLE = FALLBACK')
console.log(' APACHE_FALLBACK = READY')
