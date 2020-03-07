const {resolveLocalVersion} = require("./package");
const path = require('path');
const fs = require('fs');
const DepGraph = require('dependency-graph').DepGraph;

exports.getDependencyGraph = function getDependencyGraph(packageJsonPath) {
	const packageJson = require(path.resolve(packageJsonPath));
	const graph = new DepGraph();
	const packageName = packageJson.name;
	graph.addNode(packageName, {
		path: packageJsonPath,
	});
	['dependencies', 'devDependencies', 'optionalDependencies'].forEach(dependencyType => {
		const dependencies = getDependenciesOfType(packageJsonPath);
		for (const [[a, aPath], [b, bPath]] of dependencies) {
			if (!graph.hasNode(a)) {
				graph.addNode(a, {
					path: aPath,
					type: dependencyType
				});
			}
			if (!graph.hasNode(b)) {
				graph.addNode(b, {
					path: bPath,
					type: dependencyType
				});
			}
			graph.addDependency(a, b);
		}
	});
	return graph;
};

function getDependenciesOfType(packageJsonPath, type = 'dependencies', currentDeps = []) {
	const packageJson = require(path.resolve(packageJsonPath));
	const dependencies = packageJson[type] || {};
	const name = packageJson.name;
	for (const dependency of Object.keys(dependencies)) {
		const localPath = resolveLocalVersion(dependencies[dependency]);
		if (!localPath) {
			continue;
		}
		const dependencyPackageJson = path.resolve(path.dirname(packageJsonPath), localPath, 'package.json');
		if (!fs.existsSync(dependencyPackageJson)) {
			continue;
		}
		currentDeps.push([[name, packageJsonPath], [dependency, dependencyPackageJson]]);
		getDependenciesOfType(dependencyPackageJson, 'dependencies', currentDeps);
	}
	return currentDeps;
}
