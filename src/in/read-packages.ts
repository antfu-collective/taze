import { promises as fs } from 'fs'

export async function readJSON(filepath: string) {
  return JSON.parse(await fs.readFile(filepath, 'utf-8'))
}

export async function writeJSON(filepath: string, data: any) {
  return await fs.writeFile(filepath, JSON.stringify(data), 'utf-8')
}
