const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'development',
    devtool: 'source-map',
    entry: {
        background: './src/extension/background/index.ts',
        popup: './src/extension/popup/index.ts'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name]/index.js'
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                // Copy manifest
                { 
                    from: './src/extension/manifest.json', 
                    to: './' 
                },
                // Copy HTML files
                { 
                    from: './src/extension/popup/index.html', 
                    to: './popup/index.html' 
                },
                // Copy CSS files
                { 
                    from: './src/extension/popup/styles.css', 
                    to: './popup/styles.css' 
                },
                // Copy assets (when we add them)
                // { 
                //     from: './src/extension/assets', 
                //     to: './assets' 
                // }
            ]
        })
    ]
};