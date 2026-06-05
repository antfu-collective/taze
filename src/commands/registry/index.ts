import type { CAC } from 'cac'
import process from 'node:process'
import {
  addRegistry,
  currentRegistry,
  deleteRegistry,
  listRegistries,
  testRegistries,
  useRegistry,
} from './actions'

export {
  addRegistry,
  currentRegistry,
  deleteRegistry,
  listRegistries,
  testRegistries,
  useRegistry,
} from './actions'
export { resetRegistryPaths, setRegistryPaths } from './io'

function unknownRegistryCommand(command: string): never {
  console.error(`Unknown registry command: ${command}`)
  process.exit(1)
}

export function registerRegistryCommands(cli: CAC): void {
  cli
    .command('registry [command] [args...]', 'Manage npm registries (alias: reg)')
    .alias('reg')
    .option('--url', 'Show registry URL instead of name')
    .action(async (command: string | undefined, args: string[], options: { url?: boolean }) => {
      switch (command) {
        case undefined:
        case 'help':
          await listRegistries()
          break
        case 'ls':
        case 'list':
          await listRegistries()
          break
        case 'current':
          await currentRegistry({ showUrl: !!options.url })
          break
        case 'use':
          await useRegistry(args[0])
          break
        case 'add':
          addRegistry(args[0], args[1], args[2])
          break
        case 'del':
        case 'delete':
          await deleteRegistry(args[0])
          break
        case 'test':
          await testRegistries(args[0])
          break
        default:
          unknownRegistryCommand(command)
      }
    })
}
