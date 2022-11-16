declare module '@npmcli/config' {
  type Recordable = Record<string, any>

  export interface NpmcliConfigOptions {
    definitions: Recordable
    npmPath: string
    flatten: (current: Recordable, total: Recordable) => void
  }

  export default class NpmcliConfig{
    constructor (options: NpmcliConfigOptions)
    load(): Promise<void>
    loadDefaults(): void
    home: string
    globalPrefix: string
    data: Map<string, Recordable>
    get flat(): Recordable
  }
}