const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
    const browser = env?.browser || 'chrome';
    const isFirefox = browser === 'firefox';
    const outputDir = isFirefox ? 'dist-firefox' : 'dist';
    const manifestFile = isFirefox ? 'manifest.firefox.json' : 'manifest.json';

    console.log(`Building for: ${browser}`);

    return {
        mode: argv.mode || 'development',
        devtool: 'source-map',
        entry: {
            'background/index': './background/index.ts',
            'popup/index': './popup/index.ts',
            'pages/master-collection': './pages/master-collection.ts'
        },
        output: {
            path: path.resolve(__dirname, outputDir),
            filename: '[name].js',
            clean: true
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
            new webpack.DefinePlugin({
                'process.env.BROWSER': JSON.stringify(browser),
                'process.env.IS_FIREFOX': JSON.stringify(isFirefox)
            }),
            new CopyPlugin({
                patterns: [
                    { 
                        from: manifestFile,
                        to: 'manifest.json'
                    },
                    { 
                        from: 'popup/index.html',
                        to: 'popup/index.html'
                    },
                    { 
                        from: 'popup/debug.html',
                        to: 'popup/debug.html'
                    },
                    { 
                        from: 'popup/debug.js',
                        to: 'popup/debug.js'
                    },
                    {
                        from: 'pages/master-collection.html',
                        to: 'pages/master-collection.html'
                    },
                    {
                        from: 'assets',
                        to: 'assets'
                    },
                    { 
                        from: 'pages/styles.css',
                        to: 'pages/styles.css'
                    },
                    { 
                        from: 'popup/styles.css',
                        to: 'popup/styles.css'
                    }
                ]
            })
        ]
    };
};
