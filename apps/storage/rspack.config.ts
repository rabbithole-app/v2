import { createConfig } from '@nx/angular-rspack';
import { RsdoctorRspackPlugin } from '@rsdoctor/rspack-plugin';
import { rspack } from '@rspack/core';
import CompressionPlugin from 'compression-webpack-plugin';
import { config } from 'dotenv';

const { parsed } = config({ path: '../backend/.env' });

function getEnvVars() {
  return Object.entries(parsed ?? {}).reduce(
    (acc, [key, value]) => {
      if (/^(CANISTER_ID|DFX)_/.test(key)) acc[key] = value;

      return acc;
    },

    {} as Record<string, unknown>,
  );
}

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
            ...getEnvVars(),
            NODE_ENV: process.env['NODE_ENV'],
          }),
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
            maximumError: '2mb',
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
