import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
if (process.platform === 'darwin') {
  mkdirSync('build/native', { recursive: true })
  const sdk = execFileSync('xcrun', ['--show-sdk-path'], { encoding: 'utf8' }).trim()
  const target = `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos14.0`
  execFileSync('xcrun', ['swiftc', '-O', '-sdk', sdk, '-target', target, 'native/window-surfaces.swift', '-o', 'build/native/window-surfaces'], { stdio: 'inherit' })
  execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', 'build/native/window-surfaces'], { stdio: 'inherit' })
}
