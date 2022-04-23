
import {resolve, basename} from 'path';
import {existsSync, readFileSync} from 'fs';
import {readJsonSync, writeJsonSync} from 'fs-extra';
import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';

import type { Compiler, Compilation } from 'webpack';
import type { MashroomPluginDefinition } from '@mashroom/mashroom/type-definitions';
import type { MashroomPortalAppResources } from '@mashroom/mashroom-portal/type-definitions';

interface WebpackPlugin {
    apply(compiler: Compiler): void;
}

type Config = {
    manifest: {
        name: string,
        content: any,
    },
    dllPath: string,
}

const DEFAULT_CONFIG = {};

export default class MashroomWebDLLWebpackPlugin implements WebpackPlugin {

    private _config: Config;

    constructor(config: Config) {
        this._config = {
            ...DEFAULT_CONFIG,
            ...config
        };
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

    apply(compiler: Compiler): void {
        const dllTargetName = this._config.manifest.name + '.js';

        let done = false;

        compiler.hooks.compilation.tap('MashroomWebDLLWebpackPlugin', (compilation: Compilation) => {
            if (!done) {
                this.addDllAsAsset(dllTargetName, compilation);
                this.addToMashroomPluginConfig(dllTargetName);
                done = true;
            }

            this.addDllToHtmlPluginIfPresent(dllTargetName, compilation);
        });
    }

    private addDllAsAsset(dllTargetName: string, compilation: Compilation): void  {
        const { RawSource } = webpack.sources;
        compilation.assets[dllTargetName] = new RawSource(readFileSync(this._config.dllPath));
    }

    private addDllToHtmlPluginIfPresent(dllTargetName: string, compilation: Compilation): void  {
        const htmlPlugins = compilation.options.plugins.filter(plugin => plugin instanceof HtmlWebpackPlugin);
        if (htmlPlugins.length === 0) {
            throw new Error('MashroomWebDLLWebpackPlugin: The html-webpack-plugin must be present!');
        }
        const hooks = HtmlWebpackPlugin.getHooks(compilation);
        hooks.beforeAssetTagGeneration.tap('MashroomWebDLLWebpackPlugin', (data) => {
            const { assets: { js } } = data;
            // Add the Dll resource as very first entry
            js.splice(0, 0, dllTargetName);
            return data;
        });
    }

    private addToMashroomPluginConfig(dllTargetName: string): void  {
        const packageJsonFile = resolve(process.cwd(), 'package.json');
        const mashroomJsonFile = resolve(process.cwd(), 'mashroom.json');

        let pluginDefinitionFile = packageJsonFile;
        if (existsSync(mashroomJsonFile)) {
            pluginDefinitionFile = mashroomJsonFile;
        }

        if (!existsSync(pluginDefinitionFile)) {
            throw new Error('MashroomWebDLLWebpackPlugin: Plugin definition file not found: ' + pluginDefinitionFile);
        }

        let spaces = '  ';
        const lines = readFileSync(pluginDefinitionFile).toString('utf-8').split('\n');
        const firstLinesSpacesMatch = lines[1].match(/^(\s*)/);
        if (firstLinesSpacesMatch) {
            spaces = firstLinesSpacesMatch[0];
        }

        const pluginsDef = readJsonSync(pluginDefinitionFile);
        let plugins: Array<MashroomPluginDefinition>;
        if (pluginDefinitionFile === mashroomJsonFile) {
            plugins = pluginsDef.plugins;
        } else {
            plugins = pluginsDef.mashroom?.plugins
        }

        if (!plugins) {
            throw new Error('MashroomWebDLLWebpackPlugin: No Mashroom plugin definitions found!');
        }

        const portalApps = plugins.filter((plugin) => plugin.type === 'portal-app' || plugin.type === 'portal-app2');

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

                // @ts-ignore
                portalApp.sharedResources = {
                    ...sharedResources,
                    js: jsResources,
                };
            }
        });

        if (change) {
            if (pluginDefinitionFile === mashroomJsonFile) {
                writeJsonSync(mashroomJsonFile, pluginsDef, {
                    spaces
                });
            } else {
                writeJsonSync(packageJsonFile, pluginsDef, {
                    spaces
                });
            }
        }
    }


}

