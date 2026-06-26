const path = require('path');

module.exports = {
  entry: './src/contentScript.jsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'contentScript.js',
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-react'],
          },
        },
      },
      {
        test: /\.css$/,
        use: [
          { loader: 'css-loader', options: { exportType: 'string' } },
          'postcss-loader',
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx'],
  },
  mode: 'production',
  optimization: {
    minimize: true,
  },
};
