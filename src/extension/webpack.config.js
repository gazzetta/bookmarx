const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'development',
    devtool: 'source-map',
    entry: {
        'background/index': './background/index.ts',
        'popup/index': './popup/index.ts',
        'pages/master-collection': './pages/master-collection.ts'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        clean: true // This will clean the dist folder before each build
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
                { 
                    from: 'manifest.json',
                    to: 'manifest.json'
                },
                { 
                    from: 'popup/index.html',
                    to: 'popup/index.html'
                },
                {
                    from: 'pages/master-collection.html',
                    to: 'pages/master-collection.html'
                },
                { 
                    from: 'popup/styles.css',
                    to: 'popup/styles.css'
                }
            ]
        })
    ]
};
