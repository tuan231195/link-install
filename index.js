#! /usr/bin/env node

const {execSync} = require('./lib/child_process');
const fs = require('fs');
const fsExtra = require('fs-extra');
const path = require('path');
const util = require('util');
const cpy = require('cpy');
const {Remove} = require("./lib/undo");
const {FileContent} = require("./lib/undo");
const {UndoManager} = require("./lib/undo");
const {getDependencyGraph} = require("./lib/analyse");
const {resolveLocalVersion} = require("./lib/package");
const {writeJson, readJson, read, write} = require('./lib/files');
const installArgs = process.argv.slice(2);
let installDirectory = process.cwd();

if (installArgs.length && !installArgs[0].startsWith('--')) {
	installDirectory = installArgs.shift();
}

if (!fs.existsSync(installDirectory)) {
	console.error(`Directory ${installDirectory} does not exist`);
	process.exit(1);
}

const packageJsonPath = `${installDirectory}/package.json`;
const packageLockPath = `${installDirectory}/package-lock.json`;

const undoManager = new UndoManager();
run();

async function run() {
	let linkDir;
	await ensurePackageJsonFiles();
	let exitCode = 0;

	process.on('SIGINT', async () => {
		await undoManager.undo();
		process.exit(1);
	});

	try {
		const originalPackageJsonContent = read(packageJsonPath);
		undoManager.add(new FileContent(packageJsonPath, originalPackageJsonContent));
		if (fs.existsSync(packageLockPath)) {
			const originalPackageLockContent = read(packageLockPath);
			undoManager.add(new FileContent(packageLockPath, originalPackageLockContent));
		}
		linkDir = path.resolve(installDirectory, `tmp-${Date.now()}`);
		fs.mkdirSync(linkDir);
		undoManager.add(new Remove(linkDir));
		await prepareDependencies({installPath: installDirectory, linkDir});
		removeLocalDepsFromPackageLock();
		await install();
	} catch (e) {
		console.error('Link install failed', e);
		exitCode = 1;
	} finally {
		await undoManager.undo();
	}
	process.exit(exitCode);
}

async function install() {
	execSync(`npm install ${installArgs.join(' ')}`, {
		cwd: installDirectory,
	});
}

async function ensurePackageJsonFiles() {
	if (!fs.existsSync(packageLockPath) && fs.existsSync(path.resolve(process.cwd(), 'package-lock.json'))) {
		console.info('Copy package-lock.json from current directory');
		await cpy(path.resolve(process.cwd(), 'package-lock.json'), installDirectory);
	}
	if (!fs.existsSync(packageJsonPath)) {
		if (installDirectory !== process.cwd() && fs.existsSync(path.resolve(process.cwd(), 'package.json'))) {
			console.info('Package.json in the install directory does not exist, copy from current directory');
			await copyPackageFiles();
		} else {
			console.error('Package.json file does not exist');
			process.exit(1);
		}
	}
}

async function copyPackageFiles() {
	const packageJsonFile = path.resolve(process.cwd(), 'package.json');
	if (fs.existsSync(packageJsonFile)) {
		const packageFile = readJson(packageJsonFile);
		const dependencyTypes = ['devDependencies', 'dependencies', 'optionalDependencies'];
		dependencyTypes.forEach(dependencyType => {
			Object.entries((packageFile[dependencyType] || {})).map(async ([dependency, version]) => {
				const localPath = resolveLocalVersion(version);
				if (!localPath) {
					return;
				}
				const absolutePackagePath = path.resolve(process.cwd(), localPath);
				packageFile[dependencyType][dependency] = `file:${path.relative(path.resolve(process.cwd(), installDirectory), absolutePackagePath)}`;
			});
		});
		writeJson(packageJsonPath, packageFile);
	}
}

function removeLocalDepsFromPackageLock() {
	if (!fs.existsSync(packageLockPath)) {
		return;
	}
	const packageLock = readJson(packageLockPath);
	const dependencyTypes = ['devDependencies', 'dependencies', 'optionalDependencies'];
	dependencyTypes.forEach(async dependencyType => {
		Object.entries((packageLock[dependencyType] || {})).forEach(([dependency, dependencyInfo]) => {
				const isLocal = !!resolveLocalVersion(dependencyInfo.version);
				if (!isLocal) {
					return;
				}
				delete packageLock[dependencyType][dependency];
			}
		);
	});
	writeJson(packageLockPath, packageLock);
}

async function prepareDependencies({linkDir, installPath}) {
	const packagePath = `${installPath}/package.json`;
	const packageJson = readJson(packagePath);
	const graph = getDependencyGraph(packagePath);
	const dependencies = graph.dependenciesOf(packageJson.name);
	console.log(`Found the following dependencies ${dependencies}`);
	await Promise.all(dependencies.map(async dependency => {
		const {path: dependencyJsonPath, type: dependencyType} = graph.getNodeData(dependency);
		console.log(`Preparing ${dependency}`);
		if (!fs.existsSync(dependencyJsonPath)) {
			console.log(`Skip ${dependency} as ${dependencyJsonPath} does not exist`);
			return;
		}
		const dependencyJsonContent = read(dependencyJsonPath);
		undoManager.add(new FileContent(dependencyJsonPath, dependencyJsonContent));
		const dependencyJson = JSON.parse(dependencyJsonContent);
		const tarFile = `${dependency}-${dependencyJson.version}.tgz`;
		const dependencyPath = path.dirname(dependencyJsonPath);
		const childUndo = new UndoManager();
		undoManager.add(childUndo);
		try {
			const newPath = path.resolve(linkDir, dependency);
			cleanLocalDependencies(dependencyJsonPath);
			undoManager.add(new Remove(path.resolve(dependencyPath, tarFile)));
			execSync('npm pack', {
				cwd: dependencyPath
			});
			console.log(`Copying ${dependencyPath} to ${newPath}`);
			await fsExtra.move(path.resolve(dependencyPath, tarFile), path.resolve(newPath, tarFile), {
				overwrite: true,
			});
			packageJson[dependencyType][dependency] = path.resolve(newPath, tarFile);
		} catch(e) {
			console.error(`Failed to prepare ${dependency}: ${e.message} \n ${e.stack}`);
		} finally {
			await childUndo.undo();
		}
	}));
	writeJson(packagePath, packageJson);

	return packageJson;
}

function cleanLocalDependencies(packageJsonPath) {
	if (!fs.existsSync(packageJsonPath)) {
		return;
	}
	const packageJson = require(path.resolve(packageJsonPath));
	const dependencyTypes = ['devDependencies', 'dependencies', 'optionalDependencies'];
	dependencyTypes.forEach(dependencyType => {
		Object.entries((packageJson[dependencyType] || {})).forEach(async ([dependency, version]) => {
				const isLocal = !!resolveLocalVersion(version);
				if (!isLocal) {
					return;
				}
				delete packageJson[dependencyType][dependency];
			}
		);
	});
	writeJson(packageJsonPath, packageJson);

}
