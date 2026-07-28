#!/usr/bin/env node

const { spawnSync } = require('child_process')

/**
 * @file audit-check.js
 * @description Runs `yarn npm audit` (the only audit implementation that understands Yarn
 * Berry's own report format) and filters out deprecation notices, which Yarn otherwise
 * reports at "moderate" severity alongside real CVEs. Also accepts the `-o/--output-format`
 * flag CI passes through (a legacy audit-ci CLI contract), so `-o json > file` still produces
 * a parseable JSON report instead of erroring out.
 */

const SEVERITY_THRESHOLD = 'moderate'

function parseArgs (argv) {
  let outputFormat = 'text'
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-o' || arg === '--output-format') {
      outputFormat = argv[++i]
    } else if (arg.startsWith('--output-format=')) {
      outputFormat = arg.split('=')[1]
    }
  }
  return { outputFormat }
}

/**
 * @function isRealFinding
 * @description Yarn's audit NDJSON mixes real vulnerabilities (numeric ID + advisory URL)
 * with deprecation notices (string ID ending in "(deprecation)", no URL). Only the former
 * should gate the build.
 */
function isRealFinding (children) {
  return children && typeof children.ID === 'number' && Boolean(children.URL)
}

function collectFindings () {
  const result = spawnSync('yarn', [
    'npm', 'audit',
    '--all', '--recursive',
    '--severity', SEVERITY_THRESHOLD,
    '--json'
  ], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 })

  const findings = []
  const lines = (result.stdout || '').split('\n').filter(Boolean)
  for (const line of lines) {
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (!isRealFinding(entry.children)) continue
    const c = entry.children
    findings.push({
      package: entry.value,
      id: c.ID,
      issue: c.Issue,
      url: c.URL,
      severity: c.Severity,
      vulnerableVersions: c['Vulnerable Versions'],
      treeVersions: c['Tree Versions'],
      dependents: c.Dependents
    })
  }
  return findings
}

function printText (findings) {
  if (findings.length === 0) {
    console.log('No audit suggestions')
    return
  }
  for (const f of findings) {
    console.log(`- ${f.package}@${(f.treeVersions || []).join(',')}: ${f.severity.toUpperCase()} ${f.issue} (${f.url})`)
  }
}

function printJson (findings) {
  process.stdout.write(JSON.stringify({
    summary: { total: findings.length, severityThreshold: SEVERITY_THRESHOLD },
    vulnerabilities: findings
  }, null, 2) + '\n')
}

function main () {
  const { outputFormat } = parseArgs(process.argv.slice(2))
  const findings = collectFindings()

  if (outputFormat === 'json') {
    printJson(findings)
  } else {
    printText(findings)
  }

  process.exitCode = findings.length > 0 ? 1 : 0
}

main()
