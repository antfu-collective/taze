import { promises as fs } from 'fs'

(async() => {
  await fs.copyFile('./package.json', './package.back.json')
  const content = JSON.parse(await fs.readFile('./package.json', 'utf-8'))
  delete content.scripts
  delete content.devDependencies
  delete content.eslintConfig
  delete content.ava
  fs.writeFile('./package.json', `${JSON.stringify(content, null, 2)}\n`, 'utf-8')
})()
