import path from 'path';
import { Configuration } from 'webpack';
import PathsPlugin from 'tsconfig-paths-webpack-plugin';

export default function WebpackConfig(): Configuration {
  return {
    entry: path.join(__dirname, 'lib', 'index.ts'),
    mode: 'production',
    module: {
      rules: [
        {
          test: /\.(ts|js)$/,
          use: 'ts-loader',
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.js'],
      plugins: [
        new PathsPlugin({
          configFile: path.join(__dirname, 'tsconfig.json'),
        }),
      ],
    },
    output: {
      path: path.join(__dirname, 'dist'),
      filename: 'rtc.io.js',
      library: 'rtc_io',
    },
  };
}
