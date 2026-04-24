import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

import { createConfig } from '@nx/angular-rspack';
import { RsdoctorRspackPlugin } from '@rsdoctor/rspack-plugin';
import { rspack } from '@rspack/core';
import CompressionPlugin from 'compression-webpack-plugin';

// Canister IDs + root-key come from the running local launcher (via icp-cli).
// Fails loudly with a helpful message if the backend stack isn't up, so
// `npx nx serve rabbithole` only succeeds when the canisters are deployed.
// On production builds there's no running network; we skip the lookup and
// let environment.prod.ts provide concrete values.
interface CanisterEnv {
  canisterIds: Record<string, string>;
  rootKey: string;
  apiUrl: string;
  cookieValue: string;
}

function loadCanisterEnv(): CanisterEnv | null {
  if (process.env['NX_TASK_TARGET_TARGET'] !== 'serve') return null;
  const helper = resolve(__dirname, '../backend/scripts/get-canister-env.mjs');
  const environment = process.env['ICP_ENVIRONMENT'] ?? 'local';
  try {
    const out = execSync(`node "${helper}" ${environment}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(out) as CanisterEnv;
  } catch (err) {
    console.error('\n❌ Could not fetch canister IDs from icp-cli.');
    console.error('   Make sure the backend stack is running and canisters are deployed:');
    console.error('     npx nx serve backend\n');
    throw err;
  }
}

const canisterEnv = loadCanisterEnv();

export default createConfig(
  {
    options: {
      root: __dirname,
      outputPath: {
        base: '../../dist/apps/rabbithole',
      },
      index: './src/index.html',
      browser: './src/main.ts',
      polyfills: [],
      tsConfig: './tsconfig.app.json',
      assets: [
        {
          glob: '**/*',
          input: '../../libs/shared-assets/public',
        },
        {
          glob: '**/*',
          input: './public',
        },
      ],
      styles: ['./src/styles.css'],
      scripts: [],
      devServer: {},
    },
    rspackConfigOverrides: {
      experiments: {
        asyncWebAssembly: true,
      },
      output: {
        wasmLoading: 'fetch',
        workerWasmLoading: 'fetch',
        enabledWasmLoadingTypes: ['fetch'],
        // Default pattern for WASM modules - includes module identifier
        webassemblyModuleFilename: '[name].[hash].wasm',
      },
      resolve: {
        extensions: ['.wasm', '...'],
        alias: {
          // ICPay SDK depends on @dfinity/* but project uses @icp-sdk/core
          '@dfinity/identity': '@icp-sdk/core/identity',
          '@dfinity/auth-client': '@icp-sdk/auth/client',
        },
        fallback: {
          // ICPay x402 module conditionally requires Node crypto — not needed in browser
          crypto: false,
        },
      },
      module: {
        parser: {
          javascript: {
            importMeta: true,
            url: true,
          },
        },
        rules: [
          {
            // Specific rule for photon WASM - use fixed name
            test: /photon_rs_bg\.wasm$/,
            type: 'asset/resource',
            generator: {
              filename: 'photon_rs_bg.wasm',
            },
          },
          {
            // Generic rule for other WASM modules - use dynamic naming
            test: /\.wasm$/,
            exclude: /photon_rs_bg\.wasm$/,
            type: 'asset/resource',
            generator: {
              filename: 'wasm/[name].[hash][ext]',
            },
          },
        ],
      },
      infrastructureLogging: {
        level: 'warn',
        debug: ['rspack'],
      },
      plugins: [
        new rspack.DefinePlugin({
          'import.meta.env': JSON.stringify({
            NODE_ENV: process.env['NODE_ENV'],
          }),
        }),
        new rspack.CopyRspackPlugin({
          patterns: [
            {
              from: '../../tmp/styles.403.css',
              to: './styles.403.css',
              noErrorOnMissing: true,
            },
          ],
        }),
      ],
    },
  },
  {
    staging: {
      options: {
        outputHashing: 'all',
        sourceMap: true,
        devServer: {},
        fileReplacements: [
          {
            replace: './src/environments/environment.ts',
            with: './src/environments/environment.staging.ts',
          },
        ],
      },
    },

    production: {
      options: {
        budgets: [
          {
            type: 'initial',
            maximumWarning: '500kb',
            maximumError: '2.5mb',
          },
          {
            type: 'anyComponentStyle',
            maximumWarning: '4kb',
            maximumError: '8kb',
          },
        ],
        outputHashing: 'all',
        devServer: {},
        fileReplacements: [
          {
            replace: './src/environments/environment.ts',
            with: './src/environments/environment.prod.ts',
          },
        ],
      },
      rspackConfigOverrides: {
        plugins: [
          new CompressionPlugin({
            filename: '[path][base].gz',
            algorithm: 'gzip',
            test: /\.(js|css|html|svg|wasm)$/,
            threshold: 10240,
            minRatio: 0.8,
          }),
          new CompressionPlugin({
            filename: '[path][base].br',
            algorithm: 'brotliCompress',
            test: /\.(js|css|html|svg|wasm)$/,
            compressionOptions: {
              level: 11,
            },
            threshold: 10240,
            minRatio: 0.8,
          }),
          process.env['RSDOCTOR'] && new RsdoctorRspackPlugin(),
        ].filter(Boolean),
      },
    },

    development: {
      options: {
        optimization: false,
        vendorChunk: true,
        extractLicenses: false,
        sourceMap: true,
        namedChunks: true,
        devServer: {},
      },
      rspackConfigOverrides: {
        devServer: {
          host: '0.0.0.0',
          historyApiFallback: true,
          // Mimic the asset canister: ship the `ic_env` cookie on every
          // response so code using @icp-sdk/core/agent/canister-env works
          // the same as on deployed canisters.
          headers: canisterEnv
            ? {
                'Set-Cookie': `ic_env=${encodeURIComponent(canisterEnv.cookieValue)}; Path=/; SameSite=Lax`,
              }
            : undefined,
        },
        output: {
          publicPath: '/',
        },
        watchOptions: {
          aggregateTimeout: 500, // Wait 500ms after the last change before rebuilding
        },
        infrastructureLogging: {
          level: 'info',
          debug: ['rspack', 'webpack-dev-server'],
        },
        plugins: [
          ...(process.env['RSDOCTOR'] ? [new RsdoctorRspackPlugin()] : []),
        ],
      },
    },
  },
);
