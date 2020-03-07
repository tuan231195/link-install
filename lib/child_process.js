const path = require('path');
const childProcess = require('child_process');

exports.execSync = function (command, options = {}) {
    console.info('Executing command', command);
    return childProcess.execSync(command, {
        ...getDefaultOptions(),
        ...options,
    });
}

function getDefaultOptions() {
    return {
        stdio: 'inherit',
        encoding: 'utf-8',
        shell: true,
    }
}