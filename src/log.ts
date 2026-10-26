import type { ColorsOptions } from './types'
import { MultiBar, Presets } from 'cli-progress'
import { createColors } from './utils/colors'

export function createMultiProgressBar(colors: ColorsOptions = {}) {
  const c = createColors(colors)
  return new MultiBar({
    clearOnComplete: true,
    hideCursor: true,
    format: `{type} {bar} {value}/{total} ${c.progressName('{name}')}`,
    linewrap: false,
    barsize: 40,
  }, Presets.shades_grey)
}
