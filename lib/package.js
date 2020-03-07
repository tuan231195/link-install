exports.resolveLocalVersion = function resolveLocalVersion(version) {
	if (!(version.startsWith('file:') || version.startsWith('.'))) {
		return '';
	}
	if (version.startsWith('file:')) {
		return version.replace('file:', '');
	}
	return version;
}
