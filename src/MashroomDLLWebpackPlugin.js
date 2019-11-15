// @flow

const {resolve, basename} = require('path');
const {statSync, existsSync, readFileSync} = require('fs');
const {readJsonSync, writeJsonSync} = require('fs-extra');

import type { MashroomPluginDefinition } from '@mashroom/mashroom/type-definitions';
import type { MashroomPortalAppResources } from '@mashroom/mashroom-portal/type-definitions';

type Config = {
    manifest: {
        name: string,
        content: {}
    },
    dllPath: string,
}

const DEFAULT_CONFIG = {};

class MashroomWebDLLWebpackPlugin {

    _config: Config;

    constructor(config: Config) {
        this._config = Object.assign({}, DEFAULT_CONFIG, config);
        if (!this._config.manifest) {
            throw new Error('MashroomWebDLLWebpackPlugin: manifest property is required!');
        }
        if (!this._config.manifest.name) {
            throw new Error('MashroomWebDLLWebpackPlugin: Invalid DLLPlugin config. name property was not set.');
        }
        if (!this._config.dllPath) {
            throw new Error('MashroomWebDLLWebpackPlugin: dllPath property is required!');
        }
        if (!existsSync(this._config.dllPath)) {
            throw new Error('MashroomWebDLLWebpackPlugin: File does not exists: ' + this._config.dllPath);
        }
    }

    addDllAsAsset(dllTargetName: string, compilation: any) {
        const stats = statSync(this._config.dllPath);
        compilation.assets[dllTargetName] = {
            source: () =>  readFileSync(this._config.dllPath),
            size: () => stats.size
        };
    }

    addDllToHtmlPluginIfPresent(dllTargetName: string, compilation: any) {

        const onBeforeHtmlGeneration = (htmlPluginData: any) => {
            const { assets: { js } } = htmlPluginData;
            // Add the Dll resource as very first entry
            js.splice(0, 0, dllTargetName);
        };

        if (compilation.hooks) {
            // HtmlWebPackPlugin new
            if (compilation.hooks.htmlWebpackPluginBeforeHtmlGeneration) {
                compilation.hooks.htmlWebpackPluginBeforeHtmlGeneration.tap('htmlWebpackTagsPlugin', onBeforeHtmlGeneration);
            } else {
                const HtmlWebpackPlugin = require('safe-require')('html-webpack-plugin');
                if (HtmlWebpackPlugin && HtmlWebpackPlugin.getHooks) {
                    const hooks = HtmlWebpackPlugin.getHooks(compilation);
                    const htmlPlugins = compilation.options.plugins.filter(plugin => plugin instanceof HtmlWebpackPlugin);
                    if (htmlPlugins.length === 0) {
                        throw new Error('MashroomWebDLLWebpackPlugin: The html-webpack-plugin must be defined before the MashroomDLLWebpackPlugin!');
                    }
                    hooks.beforeAssetTagGeneration.tap('htmlWebpackTagsPlugin', onBeforeHtmlGeneration);
                }
            }
        }
    }

    addToMashroomPluginConfig(dllTargetName: string) {
        const packageJsonPath = resolve(process.cwd(), 'package.json');

        if (!existsSync(packageJsonPath)) {
            throw new Error('MashroomWebDLLWebpackPlugin: Not found: ' + packageJsonPath);
        }

        let spaces = '  ';
        const lines = readFileSync(packageJsonPath).toString('utf-8').split('\n');
        const firstLinesSpacesMatch = lines[1].match(/^(\s*)/);
        if (firstLinesSpacesMatch) {
            spaces = firstLinesSpacesMatch[0];
        }

        const packageJson = readJsonSync(packageJsonPath);

        if (!packageJson.mashroom || !packageJson.mashroom.plugins) {
            throw new Error('MashroomWebDLLWebpackPlugin: No Mashroom plugin definition found in package.json');
        }

        const plugins: Array<MashroomPluginDefinition> = packageJson.mashroom.plugins;
        const portalApps = plugins.filter((plugin) => plugin.type === 'portal-app');

        if (portalApps.length === 0) {
            console.warn('MashroomWebDLLWebpackPlugin: No portal-app plugin found in package.json');
        }

        let change = false;

        portalApps.forEach((portalApp) => {
            const sharedResources: MashroomPortalAppResources = portalApp.sharedResources || {};
            let jsResources = sharedResources.js || [];

            const dllBaseName = basename(this._config.dllPath).split('.')[0];

            if (!jsResources.find((js) => js === dllTargetName)) {
                change = true;

                // Remove existing shared entry
                jsResources = jsResources.filter((js) => !js.startsWith(dllBaseName));

                jsResources.push(dllTargetName);

                // $FlowFixMe
                portalApp.sharedResources = Object.assign({}, sharedResources, {
                    js: jsResources,
                });
            }
        });

        if (change) {
            writeJsonSync(packageJsonPath, packageJson, {
                spaces
            });
        }
    }

    apply(compiler: any) {
        const dllTargetName = this._config.manifest.name + '.js';

        let done = false;

        compiler.hooks.afterCompile.tap('MashroomWebDLLWebpackPlugin', (compilation: any) => {
            if (!done) {
                this.addDllAsAsset(dllTargetName, compilation);
                this.addToMashroomPluginConfig(dllTargetName);
                done = true;
            }

            this.addDllToHtmlPluginIfPresent(dllTargetName, compilation);
		});
    }

}

module.exports = MashroomWebDLLWebpackPlugin;
