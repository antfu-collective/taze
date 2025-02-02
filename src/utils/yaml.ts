import type { Alias, Document, Scalar } from 'yaml'
import type { PnpmWorkspaceMeta } from '../types'
import { writeFile } from 'node:fs/promises'
import { visit } from 'yaml'

export function writeYaml(pkg: PnpmWorkspaceMeta, document: Document) {
  return writeFile(pkg.filepath, document.toString(), 'utf-8')
}

export function findAnchor(doc: Document, alias: Alias): Scalar<string> | null {
  const { source } = alias
  let anchor: Scalar<string> | null = null

  visit(doc, {
    Scalar: (_key, scalar, _path) => {
      if (
        scalar.anchor === source
        && typeof scalar.value === 'string'
      ) {
        anchor = scalar as Scalar<string>
      }
    },
  })

  return anchor
}
