import type { AddressInfo } from 'node:net'
import { builtinModules } from 'node:module'
import {
  type InlineConfig,
  type ViteDevServer,
  mergeConfig,
} from 'vite'
import type { Configuration } from '.'

export function defineConfig(config: Configuration) {
  return config
}

/** Resolve the default Vite's `InlineConfig` */
export function resolveViteConfig(option: Configuration): InlineConfig {
  const defaultConfig: InlineConfig = {
    // 🚧 Avoid recursive build caused by load config file
    configFile: false,
    publicDir: false,

    build: {
      // @ts-ignore
      lib: option.entry && {
        entry: option.entry,
        // At present, Electron(20) can only support CommonJs
        formats: ['cjs'],
        fileName: () => '[name].js',
      },
      resolve: {
        // Since we're building for electron (which uses nodDejs), we don't want to use the "browser" field in the packages.
        // It corrupts bundling packages like `ws` and `isomorphic-ws`, for example.
        browserField: false,
        mainFields: ['module', 'jsnext:main', 'jsnext'],
      },
      emptyOutDir: false,
      outDir: 'dist-electron',
    },
  }

  return mergeConfig(defaultConfig, option?.vite || {})
}

export function withExternalBuiltins(config: InlineConfig) {
  const builtins = builtinModules.filter(e => !e.startsWith('_')); builtins.push('electron', ...builtins.map(m => `node:${m}`))

  config.build ??= {}
  config.build.rollupOptions ??= {}

  let external = config.build.rollupOptions.external
  if (
    Array.isArray(external) ||
    typeof external === 'string' ||
    external instanceof RegExp
  ) {
    external = builtins.concat(external as string[])
  } else if (typeof external === 'function') {
    const original = external
    external = function (source, importer, isResolved) {
      if (builtins.includes(source)) {
        return true
      }
      return original(source, importer, isResolved)
    }
  } else {
    external = builtins
  }
  config.build.rollupOptions.external = external

  return config
}

/**
 * @see https://github.com/vitejs/vite/blob/c3f6731bafeadd310efa4325cb8dcc639636fe48/packages/vite/src/node/constants.ts#L131-L141
 */
export function resolveHostname(hostname: string) {
  const loopbackHosts = new Set([
    'localhost',
    '127.0.0.1',
    '::1',
    '0000:0000:0000:0000:0000:0000:0000:0001'
  ])
  const wildcardHosts = new Set([
    '0.0.0.0',
    '::',
    '0000:0000:0000:0000:0000:0000:0000:0000'
  ])

  return loopbackHosts.has(hostname) || wildcardHosts.has(hostname) ? 'localhost' : hostname
}

export function resolveServerUrl(server: ViteDevServer): string | void {
  const addressInfo = server.httpServer!.address()
  const isAddressInfo = (x: any): x is AddressInfo => x?.address

  if (isAddressInfo(addressInfo)) {
    const { address, port } = addressInfo
    const hostname = resolveHostname(address)

    const options = server.config.server
    const protocol = options.https ? 'https' : 'http'
    const devBase = server.config.base

    const path = typeof options.open === 'string' ? options.open : devBase
    const url = path.startsWith('http')
      ? path
      : `${protocol}://${hostname}:${port}${path}`

    return url
  }
}
