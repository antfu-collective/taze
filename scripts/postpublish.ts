import { promises as fs } from 'fs'

(async() => {
  await fs.unlink('./package.json')
  await fs.copyFile('./package.back.json', './package.json')
  await fs.unlink('./package.back.json')
})()
