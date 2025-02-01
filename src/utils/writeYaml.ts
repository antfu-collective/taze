import type { PnpmWorkspaceMeta } from '../types'
import { writeFile } from 'node:fs/promises'
import { stringify } from 'yaml'

export function writeYaml(pkg: PnpmWorkspaceMeta, yamlContents: any) {
  return writeFile(pkg.filepath, stringify(yamlContents), 'utf-8')
}
