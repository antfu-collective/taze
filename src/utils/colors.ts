import type { AnsiStyles } from 'ansis'
import type { ColorsOptions, ColorValue } from '../types'
import ansis, { Ansis } from 'ansis'
import { DEFAULT_COLORS } from '../constants'

type NamedColor = Exclude<ColorValue, false | `#${string}`>
type BackgroundColor = `bg${Capitalize<NamedColor>}`

type ColorStyles = Ansis & { [Key in keyof ColorsOptions | AnsiStyles]: ColorStyles }

const colorKeys = Object.keys(DEFAULT_COLORS) as (keyof ColorsOptions)[]
const defaultPalette = buildColors(DEFAULT_COLORS)
const paletteCache = new WeakMap<ColorsOptions, { colors: ColorsOptions, palette: ColorStyles }>()

function backgroundName(name: NamedColor): BackgroundColor {
  return `bg${name[0].toUpperCase()}${name.slice(1)}` as BackgroundColor
}

function colorStyle(palette: Ansis, value: ColorValue, background = false): Ansis {
  if (value === false)
    return palette.visible
  if (value.startsWith('#'))
    return background ? palette.bgHex(value) : palette.hex(value)

  return background ? palette[backgroundName(value as NamedColor)] : palette[value as NamedColor]
}

function buildColors(colors: ColorsOptions): ColorStyles {
  const styles: Record<string, Ansis> = {}
  for (const key of colorKeys)
    styles[key] = colorStyle(ansis, colors[key] ?? DEFAULT_COLORS[key], key.endsWith('Bg'))

  // Each role gets its own style; equal default colors remain independently configurable.
  // Ansis preserves extensions in style chains, but its types only describe the first level.
  return new Ansis(ansis.level).extend(styles) as unknown as ColorStyles
}

export function createColors(colors: ColorsOptions = {}): ColorStyles {
  if (colorKeys.every(key => colors[key] == null || colors[key] === DEFAULT_COLORS[key]))
    return defaultPalette

  const cached = paletteCache.get(colors)
  if (
    cached
    && colorKeys.every(key => colors[key] === cached.colors[key])
  ) {
    return cached.palette
  }

  const result = buildColors(colors)
  paletteCache.set(colors, { colors: { ...colors }, palette: result })
  return result
}
