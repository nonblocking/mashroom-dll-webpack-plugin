
import {resolve, basename} from 'path';
import {statSync, existsSync, readFileSync} from 'fs';
import {readJsonSync, writeJsonSync} from 'fs-extra';
import HtmlWebpackPlugin from 'html-webpack-plugin';

import type { Plugin, Compiler, compilation } from 'webpack';
import type { MashroomPluginDefinition } from '@mashroom/mashroom/type-definitions';
import type { MashroomPortalAppResources } from '@mashroom/mashroom-portal/type-definitions';

type Config = {
    manifest: {
        name: string,
        content: any,
    },
    dllPath: string,
}

const DEFAULT_CONFIG = {};

export default class MashroomWebDLLWebpackPlugin implements Plugin {

    _config: Config;

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

        compiler.hooks.afterCompile.tap('MashroomWebDLLWebpackPlugin', (compilation: compilation.Compilation) => {
            if (!done) {
                this.addDllAsAsset(dllTargetName, compilation);
                this.addToMashroomPluginConfig(dllTargetName);
                done = true;
            }

            this.addDllToHtmlPluginIfPresent(dllTargetName, compilation);
        });
    }

    private addDllAsAsset(dllTargetName: string, compilation: compilation.Compilation): void  {
        const stats = statSync(this._config.dllPath);
        compilation.assets[dllTargetName] = {
            source: () =>  readFileSync(this._config.dllPath),
            size: () => stats.size
        };
    }

    private addDllToHtmlPluginIfPresent(dllTargetName: string, compilation: compilation.Compilation): void  {

        // @ts-ignore
        const htmlPlugins = compilation.options.plugins.filter(plugin => plugin instanceof HtmlWebpackPlugin);
        if (htmlPlugins.length === 0) {
            throw new Error('MashroomWebDLLWebpackPlugin: The html-webpack-plugin must be defined before the MashroomDLLWebpackPlugin!');
        }
        const hooks = HtmlWebpackPlugin.getHooks(compilation);
        hooks.beforeAssetTagGeneration.tap('htmlWebpackTagsPlugin', (data) => {
            const { assets: { js } } = data;
            // Add the Dll resource as very first entry
            js.splice(0, 0, dllTargetName);
            return data;
        });
    }

    private addToMashroomPluginConfig(dllTargetName: string): void  {
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

                // @ts-ignore
                portalApp.sharedResources = {
                    ...sharedResources,
                    js: jsResources,
                };
            }
        });

        if (change) {
            writeJsonSync(packageJsonPath, packageJson, {
                spaces
            });
        }
    }


}

