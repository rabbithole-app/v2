import { createConfig } from '@nx/angular-rspack';
import { RsdoctorRspackPlugin } from '@rsdoctor/rspack-plugin';
import { rspack } from '@rspack/core';
import CompressionPlugin from 'compression-webpack-plugin';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

// See apps/rabbithole/rspack.config.ts for the rationale. Same helper, same flow.
interface CanisterEnv {
  apiUrl: string;
  canisterIds: Record<string, string>;
  cookieValue: string;
  envVars: Record<string, string>;
  rootKey: string;
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
        base: '../../dist/apps/storage',
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
      devServer: {
        port: 4201,
      },
    },
    rspackConfigOverrides: {
      experiments: {
        asyncWebAssembly: true,
      },
      output: {
        wasmLoading: 'fetch',
        workerWasmLoading: 'fetch',
        enabledWasmLoadingTypes: ['fetch'],
        webassemblyModuleFilename: '[name].[hash].wasm',
      },
      resolve: {
        extensions: ['.wasm', '...'],
        fallback: {
          // ICPay SDK can be pulled transitively through core; x402's Node crypto path is not used in browser.
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
            test: /photon_rs_bg\.wasm$/,
            type: 'asset/resource',
            generator: {
              filename: 'photon_rs_bg.wasm',
            },
          },
          {
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
          __RABBITHOLE_CANISTER_ENV__: canisterEnv
            ? JSON.stringify(canisterEnv.envVars)
            : 'undefined',
        }),
      ],
    },
  },
  {
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
          // Ship the `ic_env` cookie so frontend code using @icp-sdk/core/agent/canister-env
          // sees the same values it would get from the deployed asset canister.
          headers: canisterEnv
            ? {
                'Set-Cookie': `ic_env=${encodeURIComponent(canisterEnv.cookieValue)}; Path=/; SameSite=Lax`,
              }
            : undefined,
        },
        output: {
          publicPath: '/',
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
