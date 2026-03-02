import { Buffer } from 'node:buffer'

export function getHexHashFromIntegrity(integrity: string) {
  return Buffer.from(integrity.slice(`sha512-`.length), `base64`).toString(`hex`)
}
