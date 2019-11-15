
# Mashroom DLL Webpack Plugin

Webpack plugin that adds *DLLs* as shared resources to [Mashroom Server](https://www.mashroom-server.com) Portal Apps.

This is useful to share vendor libraries (e.g. React) between multiple Apps, which drastically reduces the bundle sizes.

## Usage

Please read the  documentation first.

### Bundling the DLL

There is nothing specific here, just follow the [DLLPlugin](https://webpack.js.org/plugins/dll-plugin/) documentation.

To bundle React and Redux your *webpack* config would look like this:

```js
const path = require('path');
const webpack = require('webpack');

module.exports = {
    entry: ['react', 'react-dom', 'redux', 'react-redux'],
    output: {
        path: __dirname + '/dist',
        filename: "my_dll.js",
        // MUST contain the hash!
        library: "my_dll_[hash]"
    },
    plugins: [
        new webpack.DllPlugin({
            path: path.join(__dirname, "dist", "my_dll_manifest.json"),
            // MUST be the same as output.library!
            name: "my_dll_[hash]"
        })
    ]
};
```

### Using the DLL

On the other side use the *webpack* *DllReferencePlugin* and this plugin to add the library as *sharedResource* to 
the Portal App:

```js
const webpack = require('webpack');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const MashroomWDLLWebpackPlugin = require('@mashroom/mashroom-dll-webpack-plugin');

module.exports = {
    // ...
    plugins: [
        new CleanWebpackPlugin(),
        new MashroomWDLLWebpackPlugin({
            manifest: require("my-dll-module/dist/my_dll_manifest.json"),
            dllPath: require.resolve("my-dll-module/dist/my_dll.js")
        }),
        new webpack.DllReferencePlugin({
            manifest: require("my-dll-module/dist/my_dll_manifest.json"),
        })
    ],
}
```

This configuration is going to copy the DLL (my_dll.js) copy to the output path and adds it to the *Mashroom* config in *package.json* like this:

```json
    "mashroom": {
        "plugins": [
            {
                "name": "Demo Shared DLL App",
                "type": "portal-app",
                "bootstrap": "startupDemoSharedDLLApp",
                "sharedResources": {
                    "js": [
                        "my_dll_910502a6fce2f139eff8.js"
                    ]
                },
                "resources": {
                    "js": [
                        "bundle.js"
                    ]
                },
                "defaultConfig": {
                    "resourcesRoot": "./dist",
                    "appConfig": {}
                }
            }
        ]
    }
```

## Demo

See [Mashroom Demo Shared DLL](https://github.com/nonblocking/mashroom-demo-shared-dll).



