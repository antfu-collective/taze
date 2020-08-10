import { promises as fs } from 'fs'

(async() => {
  await fs.rmdir('./package.json')
  await fs.copyFile('./package.back.json', './package.json')
  await fs.rmdir('./package.back.json')
})()
