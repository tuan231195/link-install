const fsExtra = require('fs-extra');
const fs = require('fs');
const { promisify } = require('util');
const writeAsync = promisify(fs.writeFile).bind(fs);
const existsAsync = promisify(fs.exists).bind(fs);

exports.UndoManager = class UndoManager {
	constructor() {
		this.undos = [];
	}

	add(undo) {
		this.undos.push(undo);
	}

	async undo() {
		await Promise.all(this.undos.map(currentUndo => currentUndo.undo()));
		this.undos = [];
	}
};

exports.FileContent = class FileContent {
	constructor(filePath, content) {
		this.filePath = filePath;
		this.content = content;
	}

	async undo() {
		await writeAsync(this.filePath, this.content, {
			encoding: 'utf-8',
		});
	}
};

exports.Remove = class Remove {
	constructor(filePath) {
		this.filePath = filePath;
	}

	async undo() {
		if (await existsAsync(this.filePath)) {
			await fsExtra.remove(this.filePath);
		}
	}
};
