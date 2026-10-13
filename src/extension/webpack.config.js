const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
    const browser = env?.browser || 'chrome';
    const isFirefox = browser === 'firefox';
    const manifestFile = isFirefox ? 'manifest.firefox.json' : 'manifest.json';
    const production = env?.production === true || env?.production === 'true';
    const outputDir = production ? (isFirefox ? 'dist-firefox-release' : 'dist-release') : (isFirefox ? 'dist-firefox' : 'dist');
    const baseUrl = production ? 'https://www.bookmarx.cc' : 'http://localhost:3005';

    console.log(`Building for: ${browser}`);

    return {
        mode: production ? 'production' : argv.mode || 'development',
        devtool: production ? false : 'source-map',
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
                'process.env.IS_FIREFOX': JSON.stringify(isFirefox),
                '__BOOKMARX_API_BASE_URL__': JSON.stringify(baseUrl),
                '__BOOKMARX_WEBSITE_BASE_URL__': JSON.stringify(baseUrl),
                '__BOOKMARX_GOOGLE_CLIENT_ID__': JSON.stringify(process.env.BOOKMARX_GOOGLE_CLIENT_ID || '')
            }),
            new CopyPlugin({
                patterns: [
                    { 
                        from: manifestFile,
                        to: 'manifest.json',
                        transform(content) {
                            const manifest = JSON.parse(content.toString());
                            manifest.host_permissions = production ? ['https://www.bookmarx.cc/*'] : ['http://localhost/*', 'http://127.0.0.1/*'];
                            manifest.web_accessible_resources = [];
                            if (isFirefox) delete manifest.key;
                            return JSON.stringify(manifest, null, 2);
                        }
                    },
                    { 
                        from: 'popup/index.html',
                        to: 'popup/index.html'
                    },
                    ...(!production ? [{
                        from: 'popup/debug.html',
                        to: 'popup/debug.html'
                    },
                    { 
                        from: 'popup/debug.js',
                        to: 'popup/debug.js'
                    }] : []),
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
