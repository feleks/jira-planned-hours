#!/usr/bin/env node

import { exec } from 'child_process';
import * as fs from 'fs';

async function sh(cmd) {
    return new Promise(function (resolve, reject) {
        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                reject(err);
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

async function readFile(path) {
    return new Promise(function (resolve, reject) {
        fs.readFile(path, { encoding: 'utf-8' }, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

async function writeFile(path, data) {
    return new Promise(function (resolve, reject) {
        fs.writeFile(path, data, { encoding: 'utf-8' }, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

const HEADER = `// ==UserScript==
// @name         JiraPlannedHours
// @namespace    http://tampermonkey.net/
// @version      %VERSION%
// @description  Добавляет функционал просмотра загруженности работников по времени и анализа отклонений
// @author       feleks
// @match        https://jira.kalabi.ru/*
// @require      https://momentjs.com/downloads/moment.js
// @require      http://code.jquery.com/jquery-latest.js
// @grant        GM_xmlhttpRequest
// ==/UserScript==
`
const SCRIPT_TEMPLATE = `%HEADER%

%SCRIPT_CONTENT%
`

async function main() {
    // build jira_plannes_hours
    let { stdout, stderr } = await sh('./node_modules/.bin/tsc');
    if (stdout.length !== 0 || stderr.length !== 0) {
        console.log(stdout);
        console.error(stderr);
        throw new Error("tsc error");
    }
    console.log('compiled script code to .js');

    // get current version
    const version = process.env.npm_package_version;
    if (version.length === 0) {
        throw new Error('version can not be empty');
    }
    console.log(`determined current version=${version}`)

    // create string for new release file
    const header = HEADER.replace('%VERSION%', version);
    const scriptContent = await readFile('./jira_planned_hours.js');
    const releaseFileContent = SCRIPT_TEMPLATE.replace('%HEADER%', header).replace('%SCRIPT_CONTENT%', scriptContent);
    console.log('added tempermonkey header to script content');

    // write string to version-specific-file
    await writeFile(`./releases/JiraPlannedHours.${version}.user.js`, releaseFileContent);
    // wtire string to latest file
    await writeFile(`./releases/JiraPlannedHours.latest.user.js`, releaseFileContent);
    console.log('wrote release file with version and latest posfixes')

    fs.unlinkSync('./jira_planned_hours.js');
    console.log('deleted original .js file');
}

main()
