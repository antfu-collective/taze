import pacote from 'pacote'
import { Dependencies } from './load-dependencies'

export async function checkUpdates(deps: Dependencies[]) {
  return Promise.all(
    deps.map(async(dep) => {
      const data = await pacote.packument(dep.name, { fullMetadata: false })
      dep.latestVersion = data['dist-tags'].latest
      return dep
    }),
  )
}
